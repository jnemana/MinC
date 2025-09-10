# minc-vegu-backend/shared/validators.py
import re

MINC_ID_RE = re.compile(r"^MM\d{2}[A-Z]\d{5}$", re.IGNORECASE)
ALLOWED_DOMAINS = {"mihirmobile.com", "vegu.me"}

def normalize_identifier(raw: str):
    s = (raw or "").strip()
    if not s:
        return None, "empty"
    if MINC_ID_RE.match(s):
        return s.upper(), "mincId"
    if "@" in s and "." in s.split("@")[-1]:
        lower = s.lower()
        dom = lower.split("@")[-1]
        if dom in ALLOWED_DOMAINS:
            return lower, "email"
        return lower, "email-disallowed"
    return None, "invalid"
