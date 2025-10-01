# vegu_responders_update/__init__.py  v1.4

import json
import re
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import azure.functions as func
from function_app import app
from shared.auth import http_auth_level
from shared.normalizers import normalize_responder
from shared.vegu_cosmos_client import (
    get_responder_by_vg_id,
    update_responder_fields,
)
_DT_PAT = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$")

def _resp(obj, status=200):
    return func.HttpResponse(
        json.dumps(obj),
        status_code=status,
        mimetype="application/json"
    )

# map any snake_case to the camelCase we actually store
KEY_SYNONYMS = {
    "first_name": "firstName",
    "middle_name": "middleName",
    "last_name": "lastName",
    "resetLockedUntil": "reset_locked_until",
}

# Only these fields are editable by FE (BE will also set updated_at itself)
ALLOWED_FIELDS = {
    "firstName", "middleName", "lastName",
    "phone", "country", "department",
    "status",
    "admin_notes",
    "reset_locked_until",
}

@app.function_name(name="vegu_responders_update")
@app.route(
    route="vegu-responders-update",
    methods=[func.HttpMethod.POST, func.HttpMethod.PATCH],
    auth_level=http_auth_level()
)
def run(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return _resp({"success": False, "error": "Invalid JSON."}, 400)

    vg_id = (body or {}).get("vg_id") or (body or {}).get("id")
    if not vg_id:
        return _resp({"success": False, "error": "vg_id is required"}, 400)

    client_etag = (body or {}).get("etag")
    patch_in = (body or {}).get("patch") or {}
    if not isinstance(patch_in, dict) or not patch_in:
        return _resp({"success": False, "error": "patch object is required"}, 400)

    # Normalize keys first (snake_case -> camelCase), then filter
    normalized = {}
    for k, v in patch_in.items():
        k2 = KEY_SYNONYMS.get(k, k)
        normalized[k2] = v

    # Now enforce allowed list
    patch = {k: v for k, v in normalized.items() if k in ALLOWED_FIELDS}

    if not patch:
        return _resp({"success": False, "error": "No allowed fields in patch."}, 400)

    # Cheap sanitation
    if "status" in patch and isinstance(patch["status"], str):
        patch["status"] = patch["status"].strip().lower()
        if patch["status"] not in {"active", "pending", "suspended", "locked", "expired"}:
            return _resp({"success": False, "error": "Invalid status value."}, 400)

    if "admin_notes" in patch and patch["admin_notes"] is None:
        # prevent nulling notes accidentally
        patch.pop("admin_notes")

    # Load current (for ETag + existence)
    current = get_responder_by_vg_id(vg_id)
    if not current:
        return _resp({"success": False, "error": "Responder not found"}, 404)

    # Normalize reset_locked_until input (string) to ISO Z using responder's TZ
    if "reset_locked_until" in patch:
        val = patch["reset_locked_until"]
        if isinstance(val, str) and val.strip():
            tz = current.get("timezone") or current.get("time_zone") or "UTC"
            patch["reset_locked_until"] = _to_iso_from_local(val, tz)
        elif val in ("", None):
             # allow clearing the lock
            patch["reset_locked_until"] = None

    server_etag = current.get("_etag")
    if client_etag and server_etag and client_etag != server_etag:
        return _resp({
            "success": False,
            "error": "etag_mismatch",
            "message": "The record was modified by someone else. Refresh and retry.",
            "etag": server_etag
        }, 409)

    # BE owns updated_at (UTC, ISO8601 Z)
    patch["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        updated = update_responder_fields(
            vg_id=vg_id,
            patch=patch,
            expected_etag=server_etag  # helper should do conditional replace if provided
        )
    except ValueError as ve:
        # e.g., responder not found in helper
        return _resp({"success": False, "error": str(ve)}, 404)
    except PermissionError:
        # ETag mismatch at write time
        try:
            fresh = get_responder_by_vg_id(vg_id) or {}
            fresh_etag = fresh.get("_etag")
        except Exception:
            fresh_etag = None
        return _resp({
            "success": False,
            "error": "etag_mismatch",
            "message": "The record was modified by someone else. Refresh and retry.",
            "etag": fresh_etag
        }, 409)
    except Exception:
        logging.exception("vegu_responders_update failed")
        return _resp({"success": False, "error": "server_error"}, 500)

    etag = updated.get("_etag")
    for f in ("_rid", "_self", "_attachments"):
        updated.pop(f, None)

    return _resp(
    {
        "success": True,
        "responder": normalize_responder(updated),
        "etag": updated.get("_etag")
    },
    200
)

def _expand_date_to_eod_iso(date_str: str, responder_tz: str) -> str:
    """
    Convert 'YYYY-MM-DD' + 23:59:59 in responder_tz to ISO8601 Z.
    """
    try:
        y, m, d = map(int, date_str.split("-"))
        tz = ZoneInfo(responder_tz) if responder_tz else timezone.utc
        dt_local = datetime(y, m, d, 23, 59, 59, tzinfo=tz)
        return dt_local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        # If parsing fails, just return the original string; validation below can reject it.
        return date_str

def _to_iso_from_local(local_str: str, responder_tz: str) -> str:
    """
    Accepts:
      - YYYY-MM-DD
      - YYYY-MM-DDTHH:MM
      - YYYY-MM-DDTHH:MM:SS
      - same with space instead of 'T'
    Interprets as local time in responder_tz, converts to ISO8601 Z.
    Date-only is treated as 23:59:59.
    """
    m = _DT_PAT.match(local_str.strip())
    if not m:
      # leave as-is; validation will fail at write if it's nonsense
      return local_str

    y, mm, dd = map(int, m.group(1,2,3))
    hh = int(m.group(4) or 23)
    mi = int(m.group(5) or 59)
    ss = int(m.group(6) or 59)

    tz = ZoneInfo(responder_tz) if responder_tz else timezone.utc
    dt_local = datetime(y, mm, dd, hh, mi, ss, tzinfo=tz)
    return dt_local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
