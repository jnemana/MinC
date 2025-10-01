# shared/normalizers.py 1.4
from typing import Any, Dict, Optional

def normalize_responder(doc: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not doc:
        return {}
    return {
        "vg_id":              doc.get("vg_id") or doc.get("id") or "",
        "id":                 doc.get("id") or doc.get("vg_id") or "",
        "email":              doc.get("email", ""),
        "institution_name":   doc.get("institution_name") or doc.get("institutionName") or "",
        "institution_id":     doc.get("institution_id") or doc.get("institutionId") or "",
        "first_name":         doc.get("first_name") or doc.get("firstName") or "",
        "middle_name":        doc.get("middle_name") or doc.get("middleName") or "",
        "last_name":          doc.get("last_name") or doc.get("lastName") or "",
        "phone":              doc.get("phone", ""),
        "country":            doc.get("country", ""),
        "department":         doc.get("department", ""),
        "status":             doc.get("status", ""),
        "timezone":           doc.get("timezone", ""),
        # timestamps (strings or None)
        "local_created_at":   doc.get("local_created_at"),
        "created_at":         doc.get("created_at"),
        "last_login":         doc.get("last_login"),
        "reset_locked_until": doc.get("reset_locked_until"),
        # prefer explicit updated_at; else use _ts
        "updated_at":         doc.get("updated_at") or doc.get("_ts"),
        # extras
        "admin_notes":        doc.get("admin_notes", ""),
        "_ts":                doc.get("_ts"),
    }
