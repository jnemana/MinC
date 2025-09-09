# shared/config.py
from datetime import timedelta

# Regex for identifier validation (case-insensitive)
# MINC: MM + YY (2 digits) + A (or another capital) + 5 digits
MINC_ID_REGEX = r"^MM[0-9]{2}[A-Z][0-9]{5}$"

# Attempts/lockout policy
MAX_FAILED_ATTEMPTS = 3
LOCKOUT_DURATION = timedelta(hours=24)

# Collection info
DB_NAME = "minc"
CONTAINER_NAME = "minc_users"
PARTITION_KEY = "/domain"
