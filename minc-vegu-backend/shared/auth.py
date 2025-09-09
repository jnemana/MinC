# shared/auth.py
import os
import re
import bcrypt
from datetime import datetime, timedelta, timezone
import azure.functions as func

# === Identifier validation (case-insensitive) ===
MINC_RE  = re.compile(r"^MM\d{2}[A-Z]\d{5}$", re.IGNORECASE)
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# === Config (env overridable) ===
MAX_ATTEMPTS   = int(os.getenv("MINC_MAX_ATTEMPTS", 3))
LOCKOUT_HOURS  = int(os.getenv("MINC_LOCKOUT_HOURS", 24))

def http_auth_level() -> func.AuthLevel:
    raw = (os.getenv("HTTP_AUTH_LEVEL") or "anonymous").strip().lower()
    return {
        "anonymous": func.AuthLevel.ANONYMOUS,
        "function":  func.AuthLevel.FUNCTION,
        "admin":     func.AuthLevel.ADMIN,
    }.get(raw, func.AuthLevel.ANONYMOUS)

def classify_identifier(raw: str):
    s = (raw or "").strip()
    if not s:
        return {"kind": "empty"}
    if MINC_RE.match(s):
        return {"kind": "minc", "normalized": s.upper()}
    if EMAIL_RE.match(s):
        return {"kind": "email", "normalized": s.lower()}
    return {"kind": "invalid"}

# Read camelCase (preferred), with snake_case fallback if ever present
def _get_int(user: dict, *keys: str, default: int = 0) -> int:
    for k in keys:
        v = user.get(k)
        if v is not None:
            try:
                return int(v)
            except Exception:
                pass
    return default

def _get_str(user: dict, *keys: str):
    for k in keys:
        v = user.get(k)
        if isinstance(v, str):
            return v
    return None


def is_locked(user: dict) -> tuple[bool, str | None]:
    """
    Consider an account locked if:
      - status is explicitly 'locked', OR
      - lockoutUntil exists and is in the future.
    Return (locked?, lockoutUntil|None).
    """
    status = (user.get("status") or "").lower().strip()
    if status == "locked":
        return True, user.get("lockoutUntil")

    until = user.get("lockoutUntil")
    if not until:
        return False, None
    try:
        dt = datetime.fromisoformat(until.replace("Z", "+00:00"))
    except Exception:
        return False, None
    return (dt > datetime.now(timezone.utc)), until

def attempts_left(user: dict) -> int:
    return max(0, MAX_ATTEMPTS - int(user.get("failedLoginCount", 0)))

def mark_failure(user: dict) -> dict:
    fails = int(user.get("failedLoginCount", 0)) + 1
    user["failedLoginCount"] = fails
    # Do not set status here; caller decides after increment.
    if fails >= MAX_ATTEMPTS:
        user["lockoutUntil"] = (datetime.now(timezone.utc) + timedelta(hours=LOCKOUT_HOURS)).isoformat()
    return user

def reset_failures(user: dict) -> dict:
    user["failedLoginCount"] = 0
    user["lockoutUntil"] = None
    return user

def verify_password(plain: str, user: dict) -> bool:
    ph = user.get("passwordHash")
    if ph:
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), ph.encode("utf-8"))
        except Exception:
            pass
    return False
