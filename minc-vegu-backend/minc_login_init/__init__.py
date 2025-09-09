# minc_login_init/__init__.py
import json
import logging
from datetime import datetime, timezone

import azure.functions as func
from function_app import app

from shared.auth import http_auth_level, classify_identifier, is_locked
from shared.cosmos_client import users_container

def _json(obj, status=200):
    return func.HttpResponse(
        body=json.dumps(obj),
        status_code=status,
        mimetype="application/json"
    )

@app.function_name(name="minc_login_init")
@app.route(route="minc-login-init", methods=["POST"], auth_level=http_auth_level())
def run(req: func.HttpRequest) -> func.HttpResponse:
    try:
        try:
            body = req.get_json()
        except ValueError:
            return _json({"error": "Invalid JSON."}, 400)

        ident = (body or {}).get("identifier", "")
        cls = classify_identifier(ident)
        if cls["kind"] in ("empty", "invalid"):
            return _json({"error": "Enter a valid MINC ID or Email address."}, 400)
        if cls["kind"] == "email-disallowed":
            return _json({"error": "Invalid User ID"}, 400)

        cont = users_container()
        if cls["kind"] == "minc":
            query = "SELECT TOP 1 * FROM c WHERE c.mincId = @id"
            params = [{"name": "@id", "value": cls["normalized"]}]
        else:
            query = "SELECT TOP 1 * FROM c WHERE c.email = @em"
            params = [{"name": "@em", "value": cls["normalized"]}]

        items = list(cont.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        if not items:
            return _json({"error": "MinC user not found."}, 404)

        user = items[0]

        # Lock status check (status first)
        locked, until_iso = is_locked(user)
        if locked:
            return _json({"error": "Account locked", "lockoutUntil": until_iso}, 403)
            
        # OK
        return _json({
            "success": True,
            "mincId": user.get("mincId"),
            "email": user.get("email"),
            "failedLoginCount": int(user.get("failedLoginCount", 0)),
            "lockoutUntil": user.get("lockoutUntil")
        }, 200)

    except Exception:
        logging.exception("minc-login-init failed")
        return _json({"error": "Server error during sign-in."}, 500)
