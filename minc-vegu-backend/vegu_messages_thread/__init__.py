# minc_vegu_backend/vegu_mesages_thread/__init__.py v1.6

import azure.functions as func
from function_app import app
from shared.vegu_cosmos_client import get_messages_container
import json

_messages = get_messages_container()  # ⬅️ no "kind=" kwarg

@app.route(
    route="vegu-complaint-messages",
    methods=["GET"],
    auth_level=func.AuthLevel.ANONYMOUS
)
def vegu_complaint_messages(req: func.HttpRequest) -> func.HttpResponse:
    try:
        vg = (req.params.get("complaint_vg_id") or "").strip()
        if not vg:
            return func.HttpResponse(
                json.dumps({"success": False, "error": "Missing complaint_vg_id"}),
                status_code=400,
                mimetype="application/json",
            )

        query = """
        SELECT * FROM c
        WHERE c.complaint_vg_id = @vg
        ORDER BY c.timestamp ASC
        """
        params = [{"name": "@vg", "value": vg}]
        items = list(_messages.query_items(
            query=query,
            parameters=params,
            enable_cross_partition_query=True
        ))

        return func.HttpResponse(
            json.dumps({"success": True, "count": len(items), "items": items}),
            status_code=200,
            mimetype="application/json",
        )
    except Exception as e:
        return func.HttpResponse(
            json.dumps({"success": False, "error": str(e)}),
            status_code=500,
            mimetype="application/json",
        )
