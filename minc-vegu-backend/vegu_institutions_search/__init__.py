# vegu_institutions_search/__init__.py
# Route: GET /api/vegu-institutions-search?q=<text>&limit=20
# - Partial, case-insensitive, multi-token (AND across tokens, OR across fields)
# - Returns lightweight rows for the FE typeahead

import json
from urllib.parse import unquote_plus

import azure.functions as func
from function_app import app
from shared.auth import http_auth_level
from shared.vegu_cosmos_client import institutions_container

SEARCH_FIELDS = [
    "vg_id", "name", "city",
    "complaint_email", "institution_type", "institution_category",
]

RETURN_FIELDS = ["id", "vg_id", "name", "city", "country", "status"]

MAX_LIMIT = 50
DEFAULT_LIMIT = 20


def _json(payload, status=200):
    return func.HttpResponse(json.dumps(payload), status_code=status, mimetype="application/json")


@app.function_name(name="vegu_institutions_search")
@app.route(route="vegu-institutions-search", methods=["GET"], auth_level=http_auth_level())
def run(req: func.HttpRequest) -> func.HttpResponse:
    try:
        raw_q = req.params.get("q", "")
        q = unquote_plus(raw_q).strip()
        if not q:
            return _json({"success": False, "error": "Missing query param 'q'."}, 400)

        tokens = [t.lower() for t in q.split() if t.strip()]
        if not tokens:
            return _json({"success": False, "error": "Empty search tokens."}, 400)

        try:
            limit = int(req.params.get("limit", DEFAULT_LIMIT))
        except ValueError:
            limit = DEFAULT_LIMIT
        limit = max(1, min(limit, MAX_LIMIT))

        cont = institutions_container()

        # WHERE: c.type='institution' AND ( ORs per token ) AND (next token) ...
        clauses = ["c.type='institution'"]
        params = []
        for i, tok in enumerate(tokens):
            pname = f"@t{i}"
            params.append({"name": pname, "value": tok})
            ors = [f"CONTAINS(LOWER(c.{f}), {pname})" for f in SEARCH_FIELDS]
            clauses.append("(" + " OR ".join(ors) + ")")
        where = " AND ".join(clauses)

        select_fields = ", ".join([f"c.{f}" for f in RETURN_FIELDS])
        query = f"""
            SELECT TOP {limit} {select_fields}
            FROM c
            WHERE {where}
            ORDER BY c._ts DESC
        """

        items = list(cont.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        return _json({"success": True, "items": items})

    except Exception as e:
        # Keep logs verbose, response minimal
        print(f"❌ vegu_institutions_search error: {e}")
        return _json({"success": False, "error": "server_error"}, 500)
