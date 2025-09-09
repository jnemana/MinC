# shared/email_otp.py
import os, logging, random
import sendgrid

from python_http_client import exceptions as sg_exc
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from .cosmos_client import get_container, users_container

COSMOS_DB = os.getenv("COSMOS_DB", "minc")
OTP_CONTAINER = os.getenv("MINC_OTP_CONTAINER", "minc_otp_log")  # <-- you named it this
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
OTP_FROM_EMAIL = os.getenv("OTP_FROM_EMAIL", "otp@mihirmobile.com")

# Optional fixed OTP for local/dev (leave empty in prod)
FIXED_OTP = os.getenv("MINC_OTP_FIXED", "")

def _otp(n=5):
    if FIXED_OTP:
        return FIXED_OTP.zfill(n)[:n]
    lo, hi = 10**(n-1), 10**n - 1
    return str(random.randint(lo, hi))

def _email_exists(email: str) -> bool:
    # match the same container used by login
    container = users_container()
    q = "SELECT TOP 1 c.id FROM c WHERE c.email = @e"
    rows = list(container.query_items(
        query=q,
        parameters=[{"name":"@e","value":email}],
        enable_cross_partition_query=True
    ))
    return len(rows) > 0

def send_email_otp(email: str, context: str = "minc_login") -> tuple[bool, str | None]:
    """
    Returns (ok, reason). On success, reason is None.
    Context 'minc_login' requires the user to exist.
    """
    try:
        if context == "minc_login" and not _email_exists(email):
            return (False, "Email not found for login.")

        code = _otp(5)
        now = datetime.now(timezone.utc)
        expires = now + timedelta(minutes=5)

        # Store OTP record first (lets us test even if email fails)
        otp_container = get_container(COSMOS_DB, OTP_CONTAINER)
        doc = {
            "id": str(uuid4()),
            "email": email.lower(),
            "otp": code,
            "type": "email",
            "context": context,
            "created_at": now.isoformat(),
            "expires_at": expires.isoformat(),
        }
        otp_container.create_item(doc)

        if FIXED_OTP:
            logging.info("[OTP] Using FIXED_OTP=%s (no email sent).", code)
            return (True, None)

        if not SENDGRID_API_KEY:
            return (False, "SENDGRID_API_KEY not set.")

        msg = Mail(
            from_email=OTP_FROM_EMAIL,
            to_emails=email,
            subject="Your MinC Email OTP",
            plain_text_content=(
                f"Your 5-digit OTP is: {code}\n\n"
                "It will expire in 5 minutes.\n"
                f"Generated at: {now.strftime('%Y-%m-%d %H:%M:%S %Z')} UTC\n"
            ),
        )

        try:
            sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
            resp = sg.send(msg)  # type: ignore
            status = getattr(resp, "status_code", None)
            body_b = getattr(resp, "body", b"")
            body = body_b.decode("utf-8", "ignore") if isinstance(body_b, (bytes, bytearray)) else str(body_b)
            headers = dict(getattr(resp, "headers", {}) or {})

            logging.info("[OTP] SendGrid status=%s", status)
            if status in (200, 202):
                return (True, None)

            # Log a concise, explicit reason
            logging.error("[OTP] SendGrid non-2xx. status=%s body=%s headers=%s",
                          status, body[:500], {k: headers[k] for k in list(headers)[:6]})
            return (False, f"SendGrid status {status}: {body[:200]}")
        except sg_exc.HTTPError as e:
            # This captures 403/401/etc with the API’s JSON error details
            status = getattr(e, "status_code", 0)
            body_b = getattr(e, "body", b"")
            body = body_b.decode("utf-8", "ignore") if isinstance(body_b, (bytes, bytearray)) else str(body_b)
            logging.error("[OTP] SendGrid HTTPError %s body=%s", status, body[:1000])
            # surface a short reason to the caller
            return (False, f"SendGrid {status}: {body[:200]}")

    except Exception as e:
        logging.exception("[OTP] send_email_otp failed")
        return (False, str(e))

def verify_email_otp(email: str, otp: str, context: str = "minc_login") -> tuple[bool, str | None]:
    """Return (ok, reason). Looks up latest OTP for the email."""
    try:
        otp_container = get_container(COSMOS_DB, OTP_CONTAINER)
        q = "SELECT TOP 1 * FROM c WHERE c.email=@e ORDER BY c.created_at DESC"
        rows = list(otp_container.query_items(
            query=q,
            parameters=[{"name":"@e","value":email.lower()}],
            enable_cross_partition_query=True
        ))
        if not rows:
            return (False, "No OTP found.")

        item = rows[0]
        if (item.get("context") or "") != context:
            return (False, f"OTP was not generated for {context} context.")

        if (item.get("otp") or "") != otp:
            return (False, "Incorrect OTP.")

        exp = item.get("expires_at")
        if exp:
            try:
                exp_dt = datetime.fromisoformat(exp.replace("Z","")).replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) > exp_dt:
                    return (False, "OTP has expired.")
            except Exception:
                pass

        return (True, None)
    except Exception as e:
        logging.exception("[OTP] verify_email_otp failed")
        return (False, str(e))
