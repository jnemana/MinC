# minc-vegu-backend/vegu_users_update/__init__.py 1.5

import json, re
from datetime import datetime, timezone
import azure.functions as func
from function_app import app
from shared.vegu_cosmos_client import get_user_container
from azure.cosmos.exceptions import CosmosResourceNotFoundError, CosmosHttpResponseError

ALLOWED = {"status", "dob", "admin_notes"}  # server sets updated_at
STATUS_VALUES = {"active", "pending", "suspended", "under investigation", "expired"}
DOB_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")  # yyyy-mm-dd

def _j(body: dict, status: int = 200):
    return func.HttpResponse(
        json.dumps(body, ensure_ascii=False),
        status_code=status,
        mimetype="application/json",
    )

@app.route(route="vegu-users-update", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def vegu_users_update(req: func.HttpRequest) -> func.HttpResponse:
    try:
        data = req.get_json()
    except ValueError:
        return _j({"success": False, "error": "invalid_json"}, 400)

    vg_id = (data.get("vg_id") or "").strip()
    etag  = (data.get("etag") or "").strip()
    patch = data.get("patch") or {}
    if not vg_id or not isinstance(patch, dict):
        return _j({"success": False, "error": "missing vg_id or patch"}, 400)

    clean = {}
    for k, v in patch.items():
        if k not in ALLOWED:
            continue
        if k == "status":
            if not isinstance(v, str) or v not in STATUS_VALUES:
                return _j({"success": False, "error": "invalid status"}, 400)
            clean["status"] = v
        elif k == "dob":
            if v in ("", None):
                clean["dob"] = ""
            elif isinstance(v, str) and DOB_RE.match(v):
                clean["dob"] = v
            else:
                return _j({"success": False, "error": "invalid dob (yyyy-mm-dd)"}, 400)
        elif k == "admin_notes":
            if not isinstance(v, str):
                return _j({"success": False, "error": "invalid admin_notes"}, 400)
            clean["admin_notes"] = v

    if not clean:
        return _j({"success": False, "error": "no_changes"}, 400)

    clean["updated_at"] = (
        datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    )

    cont = get_user_container()
    try:
        doc = cont.read_item(item=vg_id, partition_key=vg_id)
    except CosmosResourceNotFoundError:
        return _j({"success": False, "error": "not_found"}, 404)

    # apply changes
    doc.update(clean)

    try:
        access_condition = {"type": "IfMatch", "condition": etag} if etag else None
        new_doc = cont.replace_item(item=doc, body=doc, access_condition=access_condition)
        return _j({"success": True, "user": new_doc, "etag": new_doc.get("_etag", "")})
    except CosmosHttpResponseError as e:
        if e.status_code == 412:
            fresh = cont.read_item(item=vg_id, partition_key=vg_id)
            return _j({"success": False, "error": "etag_mismatch", "etag": fresh.get("_etag","")}, 409)
        return _j({"success": False, "error": f"cosmos_error:{e.status_code}"}, 500)
    except Exception as e:
        return _j({"success": False, "error": f"{type(e).__name__}: {e}"}, 500)
