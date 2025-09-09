# minc_login_init/__init__.py
import json
import logging
from datetime import datetime, timezone

import azure.functions as func
from function_app import app

from shared.auth import (
    http_auth_level,
    classify_identifier,
    is_locked,
    reset_failures,
)
from shared.cosmos_client import users_container


def _json(obj, status=200):
    return func.HttpResponse(
        body=json.dumps(obj),
        status_code=status,
        mimetype="application/json",
    )


def _account_status(u: dict) -> str:
    return (u.get("status") or "").lower() or "active"


def _lock_expired(u: dict) -> bool:
    # Treat missing lockoutUntil as expired
    _, until_iso = is_locked(u)
    if not until_iso:
        return True
    try:
        dt = datetime.fromisoformat(until_iso.replace("Z", "+00:00"))
    except Exception:
        return True
    return dt <= datetime.now(timezone.utc)


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

        cont = users_container()
        if cls["kind"] == "minc":
            query = "SELECT TOP 1 * FROM c WHERE c.mincId = @id"
            params = [{"name": "@id", "value": cls["normalized"]}]
        else:
            query = "SELECT TOP 1 * FROM c WHERE c.email = @em"
            params = [{"name": "@em", "value": cls["normalized"]}]

        items = list(cont.query_items(
            query=query,
            parameters=params,
            enable_cross_partition_query=True
        ))
        if not items:
            return _json({"error": "MinC user not found."}, 404)

        user = items[0]

        # 1) If locked, try auto-unlock when past lockoutUntil
        if _account_status(user) == "locked":
            if _lock_expired(user):
                reset_failures(user)
                user["status"] = "active"
                note = f'[{datetime.now(timezone.utc).isoformat()}] Auto-unlock at init after lockout expiry.'
                user["adminNotes"] = ((user.get("adminNotes") or "") + ("\n" if user.get("adminNotes") else "") + note).strip()
                cont.replace_item(user, user)
            else:
                # still locked
                _, until_iso = is_locked(user)
                return _json(
                    {"error": "Account locked", "lockoutUntil": until_iso, "reason": "locked"},
                    403,
                )

        # 2) Only allow active
        if _account_status(user) != "active":
            return _json(
                {"error": "Account is not active. Contact MinC support.", "reason": "not_active"},
                403,
            )

        # Success payload for step 2
        return _json(
            {
                "success": True,
                "mincId": user.get("mincId"),
                "email": user.get("email"),
                "failedLoginCount": int(user.get("failedLoginCount", 0)),
                "lockoutUntil": user.get("lockoutUntil"),
            },
            200,
        )

    except Exception:
        logging.exception("minc-login-init failed")
        return _json({"error": "Server error during sign-in."}, 500)
