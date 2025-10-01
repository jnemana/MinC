# vegu_responders_search/__init__.py V1.4

import os
import json
import azure.functions as func
from function_app import app  # ← use the single global app
from azure.cosmos import PartitionKey
from shared.vegu_cosmos_client import get_vegu_db  # we already use this elsewhere

RESPONDERS_CONTAINER = os.getenv("VEGU_CONTAINER_RESPONDERS", "responders")

@app.route(route="vegu-responders-search", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def vegu_responders_search(req: func.HttpRequest) -> func.HttpResponse:
    try:
        q = (req.params.get("q") or "").strip()
        if not q:
            return func.HttpResponse(
                json.dumps({"success": True, "items": []}),
                mimetype="application/json"
            )

        db = get_vegu_db()
        container = db.get_container_client(RESPONDERS_CONTAINER)

        # Case-insensitive substring matching on multiple fields
        sql = """
        SELECT TOP 20
            c.id, c.vg_id, c.email,
            c.firstName, c.middleName, c.lastName,
            c.institution_name, c.institution_id
        FROM c
        WHERE
            CONTAINS(c.vg_id, @q, true)
            OR CONTAINS(c.email, @q, true)
            OR CONTAINS(c.firstName, @q, true)
            OR CONTAINS(c.middleName, @q, true)
            OR CONTAINS(c.lastName, @q, true)
            OR CONTAINS(c.institution_name, @q, true)
        """
        params = [{"name": "@q", "value": q}]
        items_iter = container.query_items(
            query=sql,
            parameters=params,
            enable_cross_partition_query=True
        )
        items = list(items_iter)

        # Normalize a tiny shape for FE list
        out = []
        for it in items:
            out.append({
                "id": it.get("id"),
                "vg_id": it.get("vg_id") or it.get("id"),
                "email": it.get("email"),
                "firstName": it.get("firstName"),
                "middleName": it.get("middleName"),
                "lastName": it.get("lastName"),
                "institution_name": it.get("institution_name"),
                "institution_id": it.get("institution_id"),
            })

        return func.HttpResponse(
            json.dumps({"success": True, "items": out}),
            mimetype="application/json"
        )
    except Exception as e:
        # Keep the message generic for FE, but print detail to logs
        print("vegu_responders_search error:", repr(e))
        return func.HttpResponse(
            json.dumps({"success": False, "error": "server_error"}),
            mimetype="application/json",
            status_code=500
        )
