# minc-vegu-backend/vegu_users_get/__init__.py v1.5

import json
import azure.functions as func
from function_app import app
from shared.vegu_cosmos_client import get_user_container
from azure.cosmos.exceptions import CosmosResourceNotFoundError

def _j(body: dict, status: int = 200):
    return func.HttpResponse(
        json.dumps(body, ensure_ascii=False),
        status_code=status,
        mimetype="application/json",
    )

@app.route(route="vegu-users/{vg_id}", methods=["GET"], auth_level=func.AuthLevel.FUNCTION)
def vegu_users_get(req: func.HttpRequest) -> func.HttpResponse:
    vg_id = (req.route_params.get("vg_id") or "").strip()
    if not vg_id:
        return _j({"success": False, "error": "missing vg_id"}, 400)

    cont = get_user_container()
    try:
        doc = cont.read_item(item=vg_id, partition_key=vg_id)
        return _j({"success": True, "user": doc, "etag": doc.get("_etag", "")})
    except CosmosResourceNotFoundError:
        return _j({"success": False, "error": "not_found"}, 404)
    except Exception as e:
        return _j({"success": False, "error": f"{type(e).__name__}: {e}"}, 500)
