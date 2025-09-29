# vegu_responders_update/__init__.py  v1.4

import json
import logging
from datetime import datetime, timezone

import azure.functions as func
from function_app import app
from shared.auth import http_auth_level
from shared.vegu_cosmos_client import (
    get_responder_by_vg_id,
    update_responder_fields,
)

def _resp(obj, status=200):
    return func.HttpResponse(
        json.dumps(obj),
        status_code=status,
        mimetype="application/json"
    )

# Fields we allow FE to modify for Responders (others are system-controlled or sensitive)
ALLOWED_FIELDS = {
    "firstName", "middleName", "lastName",
    "phone", "country", "department",
    "status",
    "admin_notes",          # append-only policy is enforced in FE; BE allows string set
    # timestamps:
    "updated_at",           # BE will set/override this
    # explicit non-editable here: id, vg_id, email, timezone, local_created_at, created_at,
    # last_login, institution_name, institution_id, password, role, reset_* counters, etc.
}

@app.function_name(name="vegu_responders_update")
@app.route(route="vegu-responders-update", methods=[func.HttpMethod.POST, func.HttpMethod.PATCH], auth_level=http_auth_level())
def run(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return _resp({"success": False, "error": "Invalid JSON."}, 400)

    vg_id = (body or {}).get("vg_id") or (body or {}).get("id")
    if not vg_id:
        return _resp({"success": False, "error": "vg_id is required"}, 400)

    patch_in = (body or {}).get("patch") or {}
    if not isinstance(patch_in, dict) or not patch_in:
        return _resp({"success": False, "error": "patch object is required"}, 400)

    client_etag = (body or {}).get("etag")

    # Load current
    current = get_responder_by_vg_id(vg_id)
    if not current:
        return _resp({"success": False, "error": "Responder not found"}, 404)

    # Optimistic concurrency (light check before conditional replace)
    server_etag = current.get("_etag")
    if client_etag and server_etag and client_etag != server_etag:
        return _resp({
            "success": False,
            "error": "etag_mismatch",
            "message": "The record was modified by someone else. Refresh and retry.",
            "etag": server_etag
        }, 409)

    # Sanitize patch keys
    patch = {k: v for k, v in patch_in.items() if k in ALLOWED_FIELDS}

    if not patch:
        return _resp({"success": False, "error": "No allowed fields in patch."}, 400)

    # BE owns updated_at (UTC)
    patch["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        updated = update_responder_fields(vg_id=vg_id, patch=patch, expected_etag=server_etag)
    except ValueError as ve:
        return _resp({"success": False, "error": str(ve)}, 404)
    except PermissionError:
        # ETag mismatch during conditional replace
        return _resp({
            "success": False,
            "error": "etag_mismatch",
            "message": "The record was modified by someone else. Refresh and retry.",
            "etag": get_responder_by_vg_id(vg_id).get("_etag")  # best-effort fresh etag
        }, 409)
    except Exception:
        logging.exception("vegu_responders_update failed")
        return _resp({"success": False, "error": "server_error"}, 500)

    etag = updated.get("_etag")
    for f in ("_rid", "_self", "_attachments"):
        updated.pop(f, None)

    return _resp({"success": True, "responder": updated, "etag": etag}, 200)
