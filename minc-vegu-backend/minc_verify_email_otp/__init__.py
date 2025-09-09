# minc_verify_email_otp/__init__.py
import json
import azure.functions as func
import logging
from function_app import app
from shared.auth import http_auth_level
from shared.email_otp import verify_email_otp   # <-- change this import

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
        return _json({"success": True})
    logging.warning(f"[OTP] verify failed: {reason}")
    return _json({"success": False, "error": reason or "OTP verification failed."}, 400)
