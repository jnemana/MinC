# vegu_responders_get/__init__.py  v1.4 — normalized payload

import json
import logging
import azure.functions as func
from function_app import app
from shared.auth import http_auth_level
from shared.vegu_cosmos_client import get_responder_by_vg_id
from shared.normalizers import normalize_responder

def _resp(obj, status=200):
    return func.HttpResponse(
        json.dumps(obj),
        status_code=status,
        mimetype="application/json"
    )

def _normalize(doc: dict) -> dict:
    """Return a FE-friendly responder dict (stable keys, fallbacks, trimmed internals)."""
    if not doc:
        return {}

    # build normalized payload with both camel/snake fallbacks
    r = {
        "vg_id":              doc.get("vg_id") or doc.get("id") or "",
        "id":                 doc.get("id") or doc.get("vg_id") or "",
        "email":              doc.get("email", ""),
        "institution_name":   doc.get("institution_name") or doc.get("institutionName") or "",
        "institution_id":     doc.get("institution_id") or doc.get("institutionId") or "",
        "first_name":         doc.get("first_name") or doc.get("firstName") or "",
        "middle_name":        doc.get("middle_name") or doc.get("middleName") or "",
        "last_name":          doc.get("last_name") or doc.get("lastName") or "",
        "phone":              doc.get("phone", ""),
        "country":            doc.get("country", ""),
        "department":         doc.get("department", ""),
        "status":             doc.get("status", ""),
        "timezone":           doc.get("timezone", ""),
        # time fields (strings or None)
        "local_created_at":   doc.get("local_created_at"),
        "created_at":         doc.get("created_at"),
        "last_login":         doc.get("last_login"),
        "reset_locked_until": doc.get("reset_locked_until"),
        # updated_at (prefer explicit, else _ts epoch seconds)
        "updated_at":         doc.get("updated_at") or doc.get("_ts"),
        # notes
        "admin_notes":        doc.get("admin_notes", ""),
        # pass through raw _ts as well (optional)
        "_ts":                doc.get("_ts"),
    }
    return r


@app.function_name(name="vegu_responders_get")
@app.route(route="vegu-responders/{vg_id}", methods=[func.HttpMethod.GET], auth_level=http_auth_level())
def run(req: func.HttpRequest) -> func.HttpResponse:
    vg_id = req.route_params.get("vg_id")
    if not vg_id:
        return _resp({"success": False, "error": "vg_id is required"}, 400)

    try:
        doc = get_responder_by_vg_id(vg_id)
        if not doc:
            return _resp({"success": False, "error": "Responder not found"}, 404)

        etag = doc.get("_etag")
        responder = normalize_responder(doc)
        return _resp({"success": True, "responder": responder, "etag": etag}, 200)
    except Exception as e:
        logging.exception("vegu_responders_get failed")
        return _resp({"success": False, "error": "server_error", "detail": str(e)}, 500)
