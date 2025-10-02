# minc-vegu-backend/vegu_users_search/__init__.py v1.5

import re
import json
import azure.functions as func
from function_app import app
from shared.vegu_cosmos_client import get_user_container

def _j(body: dict, status: int = 200):
    return func.HttpResponse(
        json.dumps(body, ensure_ascii=False),
        status_code=status,
        mimetype="application/json",
    )

@app.route(route="vegu-users-search", methods=["GET"], auth_level=func.AuthLevel.FUNCTION)
def vegu_users_search(req: func.HttpRequest) -> func.HttpResponse:
    q = (req.params.get("q") or "").strip()
    if not q:
        return _j({"success": True, "items": []})

    # split to tokens and lowercase
    tokens = [t.lower() for t in re.split(r"[^A-Za-z0-9@._+-]+", q) if t]
    if not tokens:
        return _j({"success": True, "items": []})

    # AND of ORs across fields (first/middle/last/email/vg_id)
    def ors(i: int) -> str:
        return (
            f"CONTAINS(LOWER(c.first_name), @t{i}) "
            f"OR CONTAINS(LOWER(c.middle_name), @t{i}) "
            f"OR CONTAINS(LOWER(c.last_name), @t{i}) "
            f"OR CONTAINS(LOWER(c.email), @t{i}) "
            f"OR CONTAINS(LOWER(c.vg_id), @t{i})"
        )

    where = " AND ".join([f"({ors(i)})" for i in range(len(tokens))])

    query = (
        "SELECT TOP 20 c.id, c.vg_id, c.first_name, c.middle_name, c.last_name, "
        "c.email, c.institution_name, c.status, c.timezone "
        "FROM c "
        "WHERE c.type = 'user_profile' AND " + where + " "
        "ORDER BY c._ts DESC"
    )
    params = [{"name": f"@t{i}", "value": tokens[i]} for i in range(len(tokens))]

    try:
        container = get_user_container()
        items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        return _j({"success": True, "items": items})
    except Exception as e:
        return _j({"success": False, "error": f"{type(e).__name__}: {e}"}, 500)
