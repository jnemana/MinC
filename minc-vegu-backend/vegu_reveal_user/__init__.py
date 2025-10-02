# minc-vegu-backend/vegu_reveal_user/__init__.py v1.7

import json
import logging
import os
import azure.functions as func
from function_app import app
from shared.vegu_cosmos_client import get_container

bp = func.Blueprint()

@app.route(
    route="vegu/reveal-user/{complaint_vg_id}",
    methods=["GET"],
    auth_level=func.AuthLevel.FUNCTION,
)

def vegu_reveal_user(req: func.HttpRequest) -> func.HttpResponse:
    """
    Map complaint_vg_id -> user_vg_id by looking in the vgcrypt container.
    Returns only the mapping; FE should fetch user details via Users module.
    """
    complaint_vg_id = (
        req.route_params.get("complaint_vg_id")
        or (req.params.get("complaint_vg_id") or "").strip()
    )
    if not complaint_vg_id:
        return func.HttpResponse(
            json.dumps({"success": False, "error": "Missing complaint_vg_id"}),
            status_code=400, mimetype="application/json",
        )

    try:
        crypt_name = os.getenv("VEGU_CRYPT_CONTAINER", "vgcrypt")
        vgcrypt = get_container(crypt_name)

        query = "SELECT TOP 1 c.user_vg_id FROM c WHERE c.complaint_vg_id=@cid"
        params = [{"name": "@cid", "value": complaint_vg_id}]
        items = list(vgcrypt.query_items(query=query, parameters=params, enable_cross_partition_query=True))

        if not items:
            return func.HttpResponse(
                json.dumps({
                    "success": False,
                    "error": "No user mapping found for this complaint.",
                    "complaint_vg_id": complaint_vg_id
                }),
                status_code=404, mimetype="application/json",
            )

        return func.HttpResponse(
            json.dumps({
                "success": True,
                "complaint_vg_id": complaint_vg_id,
                "user_vg_id": items[0].get("user_vg_id")
            }),
            status_code=200, mimetype="application/json",
        )

    except Exception as e:
        logging.exception("vegu_reveal_user failed")
        return func.HttpResponse(
            json.dumps({"success": False, "error": str(e)}),
            status_code=500, mimetype="application/json",
        )
