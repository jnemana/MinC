# minc_login_password/__init__.py
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

        # If already locked, short-circuit
        locked, until_iso = is_locked(user)
        if locked:
            return _json({"error": "Account locked", "lockout_until": until_iso}, 403)

        # Verify password
        ok = verify_password(password, user)
        if not ok:
            # increment first
            user = mark_failure(user)

            # if newly locked NOW (3rd strike), set status + admin note
            fails = int(user.get("failedLoginCount", 0))
            if fails >= MAX_ATTEMPTS:
                user["status"] = "locked"
                now_utc = datetime.now(timezone.utc)
                until_iso = user.get("lockoutUntil")
                # append admin note
                note = f"[{now_utc.isoformat()}] Account auto-locked after {fails} failed attempts. LockoutUntil={until_iso}"
                if user.get("adminNotes"):
                    user["adminNotes"] = (user["adminNotes"] + "\n" + note).strip()
                else:
                    user["adminNotes"] = note

                cont.replace_item(user, user)
                return _json({"error": "Account locked", "lockoutUntil": until_iso}, 403)

            # still not locked: tell remaining attempts (after increment)
            cont.replace_item(user, user)
            remaining = attempts_left(user)  # this uses MAX_ATTEMPTS - fails
            return _json({"error": "Incorrect password.", "attemptsLeft": remaining}, 401)

        # Password OK — reset failures, (re)activate if needed
        reset_failures(user)
        if (user.get("status") or "").lower() == "locked":
            # if lock has expired, unlock; otherwise still locked (handled earlier)
            user["status"] = "active"
        cont.replace_item(user, user)

        # success payload (add what you need for FE session)
        return _json({"success": True, "mincId": user.get("mincId"), "email": user.get("email")}, 200)

    except Exception:
        logging.exception("minc-login-password failed")
        return _json({"error": "Server error during password verification."}, 500)
