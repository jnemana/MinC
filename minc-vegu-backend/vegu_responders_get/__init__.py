# vegu_responders_get/__init__.py  v1.4

import json
import azure.functions as func
from function_app import app
from shared.auth import http_auth_level
from shared.vegu_cosmos_client import get_responder_by_vg_id


def _resp(obj, status=200):
    return func.HttpResponse(
        json.dumps(obj),
        status_code=status,
        mimetype="application/json"
    )


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
        # trim noisy internals before returning (keep _ts for FE timestamp formatting if you want)
        for f in ("_rid", "_self", "_attachments"):
            doc.pop(f, None)

        return _resp({"success": True, "responder": doc, "etag": etag}, 200)
    except Exception:
        return _resp({"success": False, "error": "server_error"}, 500)
