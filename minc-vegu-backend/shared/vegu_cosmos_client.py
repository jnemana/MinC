# shared/vegu_cosmos_client.py v1.3
# MinC → VEGU Cosmos access (scoped, least-privilege)

from __future__ import annotations
import os
from typing import Any, Dict, List, Optional, Tuple
from azure.cosmos import CosmosClient
from azure.cosmos.exceptions import CosmosHttpResponseError

# ---- ENV (MinC) ----
VEGU_COSMOS_URI = os.getenv("VEGU_COSMOS_URI")
VEGU_COSMOS_KEY = os.getenv("VEGU_COSMOS_KEY")
VEGU_COSMOS_DB  = os.getenv("VEGU_COSMOS_DB", "vegu3-main")

# Containers we will touch from MinC
CN_INSTITUTIONS = "institutions"

# ----- client helpers -----
def _client() -> CosmosClient:
    if not VEGU_COSMOS_URI or not VEGU_COSMOS_KEY:
        raise RuntimeError("VEGU Cosmos credentials are not configured.")
    return CosmosClient(VEGU_COSMOS_URI, VEGU_COSMOS_KEY)

def _db():
    return _client().get_database_client(VEGU_COSMOS_DB)

def institutions_container():
    return _db().get_container_client(CN_INSTITUTIONS)

# ----- read helpers -----
def institutions_count(country: Optional[str] = None) -> int:
    """
    Fast-ish count via query. If country is provided, filter by that partition.
    """
    cont = institutions_container()
    if country:
        q = "SELECT VALUE COUNT(1) FROM c WHERE c.type='institution' AND c.country=@country"
        params = [{"name":"@country","value":country}]
        it = cont.query_items(query=q, parameters=params, enable_cross_partition_query=True)
    else:
        q = "SELECT VALUE COUNT(1) FROM c WHERE c.type='institution'"
        it = cont.query_items(query=q, enable_cross_partition_query=True)
    for v in it:
        return int(v)
    return 0

def get_institution_by_vg_id(vg_id: str) -> Optional[Dict[str, Any]]:
    """
    Query by exact vg_id. Partition key is /country, so we query cross-partition.
    """
    cont = institutions_container()
    q = "SELECT TOP 1 * FROM c WHERE c.type='institution' AND c.vg_id=@vg_id"
    params = [{"name":"@vg_id","value":vg_id}]
    items = list(cont.query_items(query=q, parameters=params, enable_cross_partition_query=True))
    return items[0] if items else None

def list_institutions(
    skip: int = 0,
    limit: int = 25,
    country: Optional[str] = None,
    status: Optional[str] = None,
    plan_type: Optional[str] = None,
    sort_by: str = "updated_at",
    sort_dir: str = "DESC",
) -> Tuple[List[Dict[str,Any]], int]:
    """
    Paginated list. Returns (items, total_count).
    """
    cont = institutions_container()

    filters = ["c.type='institution'"]
    params: List[Dict[str,Any]] = []

    if country:
        filters.append("c.country=@country")
        params.append({"name":"@country","value":country})
    if status:
        filters.append("LOWER(c.status)=@status")
        params.append({"name":"@status","value":status.lower()})
    if plan_type:
        filters.append("LOWER(c.plan_type)=@plan")
        params.append({"name":"@plan","value":plan_type.lower()})

    where = " AND ".join(filters)
    order = sort_by if sort_by in {"name","vg_id","updated_at","created_at","subscription_expiry"} else "updated_at"
    direction = "DESC" if sort_dir.upper() == "DESC" else "ASC"

    # total
    qc = f"SELECT VALUE COUNT(1) FROM c WHERE {where}"
    total_iter = cont.query_items(query=qc, parameters=params, enable_cross_partition_query=True)
    total = next(iter(total_iter), 0)

    # page
    qp = f"SELECT * FROM c WHERE {where} ORDER BY c.{order} {direction} OFFSET @skip LIMIT @limit"
    items_iter = cont.query_items(
        query=qp,
        parameters=params + [{"name":"@skip","value":skip},{"name":"@limit","value":limit}],
        enable_cross_partition_query=True,
    )
    items = list(items_iter)
    return items, int(total)

def search_institutions(
    text: str,
    fields: Optional[List[str]] = None,
    limit: int = 50
) -> List[Dict[str,Any]]:
    """
    Multi-field search. Supports vg_id pattern, name, city, email.
    Cosmos SQL allows STARTSWITH / CONTAINS (case-sensitive by default),
    so we normalize both sides to lower() for consistency.
    """
    cont = institutions_container()
    text = (text or "").strip()
    if not text:
        return []

    fields = fields or ["vg_id","name","city","complaint_email","institution_type","institution_category"]
    # Build a lower(...) OR chain
    or_terms = []
    for f in fields:
        or_terms.append(f"CONTAINS(LOWER(c.{f}), @q)")
    where = " OR ".join(or_terms)

    q = f"""
      SELECT TOP {max(1, min(limit, 200))} *
      FROM c
      WHERE c.type='institution' AND ({where})
      ORDER BY c.updated_at DESC
    """
    params = [{"name":"@q", "value": text.lower()}]
    items = list(cont.query_items(query=q, parameters=params, enable_cross_partition_query=True))
    return items

# ----- write helper (safe replace) -----
def update_institution_fields(vg_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    """
    Read → merge → replace.
    Requires we can determine partition key (country) from the existing doc.
    Only updates whitelisted fields (defensive).
    """
    allowed = {
        "name","address1","address2","city","state","postal_code","country",
        "complaint_email","complaint_phone","country_code","timezone",
        "status","plan_type","subscription_expiry","institution_type","institution_category",
        "personnel_name","comment","admin_notes","max_responders","testing","last_updated","updated_at"
    }

    cont = institutions_container()
    current = get_institution_by_vg_id(vg_id)
    if not current:
        raise ValueError("Institution not found")

    # Merge only allowed keys
    new_doc = dict(current)
    for k, v in patch.items():
        if k in allowed:
            new_doc[k] = v

    # Always bump updated_at (UTC ISO) if caller didn't supply
    from datetime import datetime, timezone
    new_doc.setdefault("updated_at", datetime.now(timezone.utc).isoformat())

    # Partition key is /country; ensure it exists
    pk = new_doc.get("country")
    if not pk:
        raise ValueError("Institution document missing 'country' for partition key.")

    try:
        # Replace by (id, partition_key)
        return cont.replace_item(item=new_doc["id"], body=new_doc, partition_key=pk)  # SDK ≥ 4.7 supports partition_key kw
    except TypeError:
        # Older SDK signature fallback
        return cont.replace_item(item=new_doc, body=new_doc)  # relies on body['country']

# (Optional) existence checks
def institution_name_exists(name: str) -> bool:
    cont = institutions_container()
    q = "SELECT VALUE COUNT(1) FROM c WHERE c.type='institution' AND c.name=@name"
    params = [{"name":"@name","value":name}]
    count = next(iter(cont.query_items(query=q, parameters=params, enable_cross_partition_query=True)), 0)
    return int(count) > 0
