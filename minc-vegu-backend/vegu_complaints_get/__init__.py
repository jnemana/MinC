# minc-vegu-backend/vegu_complaints_get/__init__.py  v1.6

import json
import azure.functions as func
from function_app import app
from typing import Optional, Dict, Any, List
from shared.vegu_cosmos_client import get_complaints_container, get_messages_container

def _j(body, code=200):
    return func.HttpResponse(json.dumps(body, ensure_ascii=False), status_code=code, mimetype="application/json")

def _find_complaint(vg_id: str) -> Optional[Dict[str, Any]]:
    c = get_complaints_container()
    sql = "SELECT TOP 1 * FROM c WHERE c.type='complaint' AND c.vg_id=@id"
    items = list(c.query_items(query=sql, parameters=[{"name":"@id","value":vg_id}], enable_cross_partition_query=True))
    return items[0] if items else None

@app.route(route="vegu-complaints/{vg_id}", methods=["GET"], auth_level=func.AuthLevel.FUNCTION)
def vegu_complaints_get(req: func.HttpRequest) -> func.HttpResponse:
    vg_id = req.route_params.get("vg_id")
    if not vg_id:
        return _j({"success": False, "error": "missing vg_id"}, 400)

    comp = _find_complaint(vg_id)
    if not comp:
        return _j({"success": False, "error": "not found"}, 404)

    m = get_messages_container()
    m_sql = """
      SELECT m.id, m.sender_type, m.message_type, m.content, m.timestamp
      FROM m
      WHERE m.complaint_vg_id=@id
      ORDER BY m.timestamp ASC
    """
    msgs = list(m.query_items(query=m_sql, parameters=[{"name":"@id","value":vg_id}], enable_cross_partition_query=True))

    out_msgs: List[Dict[str, Any]] = [{
        "id": x.get("id"),
        "role": x.get("sender_type"),           # 'user' | 'responder' | 'system'
        "text": x.get("content") or "",
        "ts": x.get("timestamp"),
        "type": x.get("message_type") or "text"
    } for x in msgs]

    shell = {
        "vg_id": comp.get("vg_id") or comp.get("id"),
        "subject": comp.get("display_subject") or comp.get("subject") or "",
        "severity": (comp.get("threat_level") or "").upper(),
        "status": (comp.get("threat_status") or "").upper(),
        "institution_id": comp.get("institutionId"),
        "institution_name": comp.get("institution_name"),
        "created_at": comp.get("created_at"),
        "updated_at": comp.get("last_updated") or comp.get("_ts"),
    }

    return _j({"success": True, "complaint": shell, "messages": out_msgs})
