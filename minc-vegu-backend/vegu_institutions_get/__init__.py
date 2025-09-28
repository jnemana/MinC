# vegu_institutions_get/__init__.py  v1.3
import json
import azure.functions as func
from function_app import app
from shared.auth import http_auth_level          # keep same auth behavior as others
from shared.vegu_cosmos_client import get_institution_by_vg_id

def _json(obj, status=200):
    return func.HttpResponse(json.dumps(obj), status_code=status, mimetype="application/json")

@app.function_name(name="vegu_institutions_get")
@app.route(route="vegu-institutions/{vg_id}", methods=["GET"], auth_level=http_auth_level())
def run(req: func.HttpRequest) -> func.HttpResponse:
    vg_id = req.route_params.get("vg_id", "").strip()
    if not vg_id:
        return _json({"success": False, "error": "Missing vg_id"}, 400)

    try:
        doc = get_institution_by_vg_id(vg_id)
        if not doc:
            return _json({"success": False, "error": "Institution not found"}, 404)

        # remove noisy cosmos fields if present
        etag = doc.pop("_etag", "")
        for f in ("_rid", "_self", "_attachments", "_ts"):
            doc.pop(f, None)

        return _json({"success": True, "institution": doc, "etag": etag})
    except Exception as e:
        # log if you want; keep generic error outward
        return _json({"success": False, "error": "server_error"}, 500)
