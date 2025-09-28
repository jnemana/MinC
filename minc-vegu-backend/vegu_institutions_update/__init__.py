# vegu_institutions_update/__init__.py  v1.3
import json
import logging
import azure.functions as func
from datetime import datetime, timezone
from function_app import app
from shared.auth import http_auth_level
from shared.vegu_cosmos_client import (
    get_institution_by_vg_id,
    update_institution_fields,
)

def _resp(obj, status=200):
    return func.HttpResponse(json.dumps(obj), status_code=status, mimetype="application/json")

# Fields we’re OK receiving from FE (extra safety — vegu_cosmos_client also defends)
ALLOWED_FIELDS = {
    "name","address1","address2","city","state","postal_code","country",
    "complaint_email","complaint_phone","country_code","timezone",
    "status","plan_type","subscription_expiry","institution_type","institution_category",
    "personnel_name","comment","admin_notes","max_responders","testing","updated_at",
    "primary_contact_name","primary_contact_phone","primary_contact_email", "website_url",
}

@app.function_name(name="vegu_institutions_update")
@app.route(route="vegu-institutions-update", methods=["POST", "PATCH"], auth_level=http_auth_level())
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

    # Optional optimistic concurrency
    client_etag = (body or {}).get("etag")

    # Load current
    current = get_institution_by_vg_id(vg_id)
    if not current:
        return _resp({"success": False, "error": "Institution not found"}, 404)

    # Concurrency: if client provided etag and doesn’t match, ask them to refresh
    server_etag = current.get("_etag")
    if client_etag and server_etag and client_etag != server_etag:
        return _resp({
            "success": False,
            "error": "etag_mismatch",
            "message": "The record was modified by someone else. Refresh and retry.",
            "etag": server_etag
        }, 409)

    # Sanitize patch keys (extra layer; the write helper also filters)
    patch = {k: v for k, v in patch_in.items() if k in ALLOWED_FIELDS}

    if not patch:
        return _resp({"success": False, "error": "No allowed fields in patch."}, 400)
    # ALWAYS server-stamp the update time (UTC, ISO8601 Z)
    patch["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    try:
        updated = update_institution_fields(vg_id=vg_id, patch=patch)
    except ValueError as ve:
        # e.g., missing country (partition) or not found
        return _resp({"success": False, "error": str(ve)}, 404)
    except Exception as e:
        logging.exception("vegu_institutions_update failed")
        return _resp({"success": False, "error": "server_error"}, 500)

    # Trim noisy cosmos internals but return fresh etag for the client
    etag = updated.get("_etag")
    for f in ("_rid","_self","_attachments","_ts"):
        updated.pop(f, None)

    return _resp({
        "success": True,
        "institution": updated,
        "etag": etag
    }, 200)
