import json, azure.functions as func, logging
from function_app import app
from shared.auth import http_auth_level
from shared.email_otp import send_email_otp

def _json(obj, status=200):
    return func.HttpResponse(json.dumps(obj), status_code=status, mimetype="application/json")

@app.function_name(name="minc_send_email_otp")
@app.route(route="minc-send-email-otp", methods=["POST"], auth_level=http_auth_level())
def run(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return _json({"success": False, "error": "Invalid JSON."}, 400)

    email = (body or {}).get("email","").strip().lower()
    context = (body or {}).get("context","minc_login")

    if not email:
        return _json({"success": False, "error": "Email not provided."}, 400)

    ok, reason = send_email_otp(email=email, context=context)
    if ok:
        return _json({"success": True})
    logging.warning(f"[OTP] send failed: {reason}")
    return _json({"success": False, "error": reason or "Failed to send OTP."}, 400)
