# minc-vegu-backend/vegu_complaints_search/__init__.py  v1.6

import json, re
import azure.functions as func
from function_app import app
from typing import List, Dict, Any, Set
from shared.vegu_cosmos_client import get_complaints_container, get_messages_container

def _j(body, code=200):
    return func.HttpResponse(json.dumps(body, ensure_ascii=False), status_code=code, mimetype="application/json")

def _tokens(q: str) -> List[str]:
    return [t.lower() for t in re.split(r"[^A-Za-z0-9@._+-]+", q or "") if t]

def _where_for_tokens(alias: str, fields: List[str], toks: List[str]) -> str:
    # AND of per-token ORs
    ors = []
    for i, _ in enumerate(toks):
        ors.append("(" + " OR ".join([f"CONTAINS(LOWER({alias}.{f}), @t{i})" for f in fields]) + ")")
    return " AND ".join(ors)

@app.route(route="vegu-complaints-search", methods=["GET"], auth_level=func.AuthLevel.FUNCTION)
def vegu_complaints_search(req: func.HttpRequest) -> func.HttpResponse:
    q = (req.params.get("q") or "").strip()
    limit = int(req.params.get("limit") or 20)
    toks = _tokens(q)
    if not toks:
        return _j({"success": True, "items": []})

    comp_c = get_complaints_container()
    msg_c  = get_messages_container()

    # 1) Search complaints by their own fields
    comp_fields = ["vg_id","display_subject","subject","institution_name"]
    c_where = _where_for_tokens("c", comp_fields, toks)
    c_sql = f"""
      SELECT TOP {max(1, min(limit*2, 100))} c.id, c.vg_id, c.display_subject, c.subject,
             c.institution_name, c.last_updated, c.threat_level, c.threat_status
      FROM c
      WHERE c.type='complaint' AND ({c_where})
      ORDER BY c.last_updated DESC
    """
    c_params = [{"name": f"@t{i}", "value": toks[i]} for i in range(len(toks))]
    c_hits = list(comp_c.query_items(query=c_sql, parameters=c_params, enable_cross_partition_query=True))

    # 2) Search messages.content and collect complaint_vg_id
    m_where = _where_for_tokens("m", ["content"], toks)
    m_sql = f"""
      SELECT DISTINCT m.complaint_vg_id
      FROM m
      WHERE ({m_where})
    """
    m_params = c_params  # same tokens
    m_hits = list(msg_c.query_items(query=m_sql, parameters=m_params, enable_cross_partition_query=True))
    m_ids: Set[str] = {h.get("complaint_vg_id") for h in m_hits if h.get("complaint_vg_id")}

    # 3) Fetch complaint shells for message-matched IDs we don't already have
    already: Set[str] = {x.get("vg_id") or x.get("id") for x in c_hits}
    fetch_ids = [cid for cid in m_ids if cid not in already]
    extra: List[Dict[str, Any]] = []
    if fetch_ids:
        # IN is not supported; UNION of OR conditions
        ors = " OR ".join([f"c.vg_id=@id{i}" for i in range(len(fetch_ids))])
        e_sql = f"""
          SELECT c.id, c.vg_id, c.display_subject, c.subject,
                 c.institution_name, c.last_updated, c.threat_level, c.threat_status
          FROM c WHERE c.type='complaint' AND ({ors})
        """
        e_params = [{"name": f"@id{i}", "value": vid} for i, vid in enumerate(fetch_ids)]
        extra = list(comp_c.query_items(query=e_sql, parameters=e_params, enable_cross_partition_query=True))

    # 4) Merge, sort by last_updated desc, trim
    merged = c_hits + extra
    # Normalize fields & sort
    def latest(x):
        v = x.get("last_updated") or x.get("_ts")
        return v
    dedup: Dict[str, Dict[str, Any]] = {}
    for it in merged:
        vid = it.get("vg_id") or it.get("id")
        if not vid: 
            continue
        prev = dedup.get(vid)
        if (not prev) or (latest(it) > latest(prev)):
            dedup[vid] = it

    items = sorted(dedup.values(), key=lambda r: r.get("last_updated", 0), reverse=True)[:limit]

    # Map to lite response rows for picker
    rows = [{
        "vg_id": r.get("vg_id") or r.get("id"),
        "subject": r.get("display_subject") or r.get("subject") or "",
        "institution_name": r.get("institution_name") or "",
        "threat_level": (r.get("threat_level") or "").upper(),
        "threat_status": (r.get("threat_status") or "").upper(),
        "updated_at": r.get("last_updated") or r.get("_ts"),
        "preview": ""  # could later add first 120 chars of latest msg if desired
    } for r in items]

    return _j({"success": True, "items": rows})
