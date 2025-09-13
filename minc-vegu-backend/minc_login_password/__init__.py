# minc_login_password/__init__.py
# V1.1

import json
import logging
from datetime import datetime, timezone

import azure.functions as func
from function_app import app
from shared.auth import (
    http_auth_level,
    classify_identifier,
    verify_password,
    mark_failure,
    reset_failures,
    attempts_left,
    is_locked,
    account_status,
    lock_expired,
    MAX_ATTEMPTS,
    LOCKOUT_HOURS,
)

from shared.cosmos_client import users_container

def _json(obj, status=200):
    return func.HttpResponse(
        body=json.dumps(obj),
        status_code=status,
        mimetype="application/json"
    )

@app.function_name(name="minc_login_password")
@app.route(route="minc-login-password", methods=["POST"], auth_level=http_auth_level())
def run(req: func.HttpRequest) -> func.HttpResponse:
    try:
        try:
            body = req.get_json()
        except ValueError:
            return _json({"error": "Invalid JSON."}, 400)

        ident = (body or {}).get("identifier", "")
        password = (body or {}).get("password", "")
        cls = classify_identifier(ident)
        if cls["kind"] in ("empty", "invalid"):
            return _json({"error": "Enter a valid MINC ID or Email address."}, 400)
        if not password:
            return _json({"error": "Password is required."}, 400)

        cont = users_container()
        if cls["kind"] == "minc":
            query = "SELECT TOP 1 * FROM c WHERE c.mincId = @id"
            params = [{"name": "@id", "value": cls["normalized"]}]
        else:
            query = "SELECT TOP 1 * FROM c WHERE c.email = @em"
            params = [{"name": "@em", "value": cls["normalized"]}]

        items = list(cont.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        if not items:
            # same generic message as init to avoid info leak
            return _json({"error": "MinC user not found."}, 404)

        user = items[0]

         # 1) Locked? auto-unlock if expired, else block
        if account_status(user) == "locked":
            if lock_expired(user):
                reset_failures(user)
                user["status"] = "active"
                note = f'[{datetime.now(timezone.utc).isoformat()}] Auto-unlock at password step after lockout expiry.'
                user["adminNotes"] = ((user.get("adminNotes") or "") + ("\n" if user.get("adminNotes") else "") + note)
                cont.replace_item(user, user)
            else:
                _, until_iso = is_locked(user)
                return _json({"error": "Account locked", "lockoutUntil": until_iso, "reason": "locked"}, 403)

        # 2) Only allow active accounts
        if account_status(user) != "active":
            return _json({"error": f"Account  is not active. Contact MinC support.", "reason": "not_active"}, 403)

        # 3) Verify password
        if not verify_password(password, user):
            user = mark_failure(user)
            fails = int(user.get("failedLoginCount", 0))
            if fails >= MAX_ATTEMPTS:
                # newly locked
                until_iso = user.get("lockoutUntil")
                user["status"] = "locked"
                note = f'[{datetime.now(timezone.utc).isoformat()}] Account auto-locked after {fails} failed attempts. lockoutUntil={until_iso}'
                user["adminNotes"] = ((user.get("adminNotes") or "") + ("\n" if user.get("adminNotes") else "") + note)
                cont.replace_item(user, user)
                return _json({"error": "Account locked", "lockoutUntil": until_iso, "reason": "locked"}, 403)

            cont.replace_item(user, user)
            remaining = attempts_left(user)
            # return both keys for FE compatibility
            return _json(
                {"error": "Incorrect password.", "attemptsLeft": remaining, "attempts_left": remaining},
                401
            )

        # 4) Success — clear failures; ensure status active
        reset_failures(user)
        user["status"] = "active"
        cont.replace_item(user, user)

        return _json({
            "success": True,
            "mincId": user.get("mincId"),
            "email": user.get("email"),
        }, 200)

    except Exception:
        logging.exception("minc-login-password failed")
        return _json({"error": "Server error during password verification."}, 500)
