# minc_verify_email_otp/__init__.py
import json
import azure.functions as func
import logging
from function_app import app
from datetime import datetime, timezone
from shared.auth import http_auth_level
from shared.email_otp import verify_email_otp   # <-- change this import
from shared.cosmos_client import users_container

def _json(obj, status=200):
    return func.HttpResponse(json.dumps(obj), status_code=status, mimetype="application/json")

@app.function_name(name="minc_verify_email_otp")
@app.route(route="minc-verify-email-otp", methods=["POST"], auth_level=http_auth_level())
def run(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return _json({"success": False, "error": "Invalid JSON."}, 400)

    email   = (body or {}).get("email", "").strip().lower()
    otp     = (body or {}).get("otp", "").strip()
    context = (body or {}).get("context", "minc_login")

    if not email or not otp:
        return _json({"success": False, "error": "Email and OTP are required."}, 400)

    ok, reason = verify_email_otp(email=email, otp=otp, context=context)
    if ok:
        # Post-OTP success → this is the true login point.
        try:
            cont = users_container()
            items = list(cont.query_items(
                query="SELECT TOP 1 * FROM c WHERE c.email = @em",
                parameters=[{"name": "@em", "value": email}],
                enable_cross_partition_query=True
            ))
            if items:
                user = items[0]
                user["lastLoginAt"] = datetime.now(timezone.utc).isoformat()
                # OTP confirms identity → clear counters/lock if any lingered
                user["failedLoginCount"] = 0
                user["lastFailedAt"] = None
                user["lockoutUntil"] = None
                cont.replace_item(user, user)
            else:
                logging.warning(f"[OTP] success but user not found for email={email}")
        except Exception as e:
            # Best-effort: do not block login if the write fails
            logging.exception(f"[OTP] lastLoginAt update failed: {e}")
        return _json({"success": True})
        
    logging.warning(f"[OTP] verify failed: {reason}")
    return _json({"success": False, "error": reason or "OTP verification failed."}, 400)
