// src/pages/MinCVEGUComplaintReview.jsx 1.6

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/MinCVeguDashboard.css";
import "../styles/MinCDashboard.css";
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";
import { FaArrowLeft } from "react-icons/fa";
import { CONFIG } from "../utils/config";
import UsePageTitle from "../utils/UsePageTitle";

// --- helpers (same as Users page) ---
const debugFetch = async (label, url, init = {}) => {
  console.log(`➡️ ${label} REQ`, url, init);
  const res = await fetch(url, init);
  const text = await res.text();
  console.log(`⬅️ ${label} RESP ${res.status}`, text);
  let json; try { json = JSON.parse(text); } catch { json = { parseError: true, text }; }
  return { res, json };
};
const makeUrl = (path, qs = "") => {
  const base = CONFIG.API_BASE || "";
  const key  = CONFIG.API_KEY;
  const sep  = qs.includes("?") ? "&" : "?";
  const withKey = key ? `${qs}${sep}code=${encodeURIComponent(key)}` : qs || "";
  const url = `${base}${path}${withKey}`;
  console.debug("[MinC] calling:", url);
  return url;
};
const ts = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const pad = (n) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export default function MinCVEGUComplaintReview() {
  UsePageTitle("View Complaint");

  const nav = useNavigate();
  const { vg_id } = useParams();

  const [loading, setLoading] = useState(true);
  const [complaint, setComplaint] = useState(null);
  const [messages, setMessages] = useState([]);
  const [err, setErr] = useState("");

  const listRef = useRef(null);
  const lastCount = useRef(0);

  // auto-scroll to bottom when new messages arrive and user is near bottom
  const nearBottom = (el) => {
    if (!el) return false;
    const position = el.scrollTop + el.clientHeight;
    return el.scrollHeight - position <= 120;
  };
  useLayoutEffect(() => {
    const el = listRef.current;
    const wasNear = nearBottom(el);
    if (el && wasNear && messages.length > lastCount.current) {
      el.scrollTop = el.scrollHeight;
    }
    lastCount.current = messages.length;
  }, [messages]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");

        // 1) GET complaint (preferred: also returns messages)
        const url = makeUrl(`${CONFIG.PATHS.VEGU_COMPLAINTS_GET}/${encodeURIComponent(vg_id)}`);
        let { res, json } = await debugFetch("vegu-complaints-get", url);
        if (!res.ok || json?.success === false) throw new Error(json?.error || `Fetch failed (${res.status})`);

        const c = json?.complaint || json;  // support either shape
        if (mounted) setComplaint(c);

        // 2) messages: use embedded if present, else call messages endpoint, else legacy
        let msgs = Array.isArray(json?.messages) ? json.messages : null;

        if (!msgs && CONFIG.PATHS.VEGU_COMPLAINT_MESSAGES) {
          const mu = makeUrl(CONFIG.PATHS.VEGU_COMPLAINT_MESSAGES, `?complaint_vg_id=${encodeURIComponent(vg_id)}`);
          const r2 = await debugFetch("vegu-complaint-messages", mu);
          if (r2.res.ok && Array.isArray(r2.json)) msgs = r2.json;
        }
        if (!msgs && CONFIG.PATHS.LEGACY_GET_CHAT_THREAD) {
          const lu = makeUrl(CONFIG.PATHS.LEGACY_GET_CHAT_THREAD, `?complaint_vg_id=${encodeURIComponent(vg_id)}`);
          const r3 = await debugFetch("get-chat-thread(legacy)", lu);
          if (r3.res.ok && Array.isArray(r3.json)) msgs = r3.json;
        }

        if (mounted) setMessages(Array.isArray(msgs) ? msgs : []);
      } catch (e) {
        console.error(e);
        if (mounted) setErr(e.message || "Failed to load complaint.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [vg_id]);

  return (
    <div className="vegu-page">
      <MinCSpinnerOverlay open={loading} />

      <div className="vegu-card" style={{ paddingBottom: 8 }}>
        {/* Back */}
        <div
          className="minc-back-container"
          role="button"
          tabIndex={0}
          onClick={() => nav("/vegu/complaints")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/vegu/complaints")}
          aria-label="Back to Complaints"
        >
          <FaArrowLeft className="minc-back-icon" />
          <div className="minc-back-label">Back</div>
        </div>

        <h1 className="vegu-title" style={{ marginBottom: 10 }}>Complaint</h1>

        {err && (
          <div role="alert" style={{ maxWidth: 960, margin: "0 auto 12px",
            background:"#fff6f6", border:"2px solid #f3b8b8", color:"#7a1d1d",
            borderRadius:12, padding:"10px 12px", fontFamily:"'Exo 2', sans-serif" }}>
            {err}
          </div>
        )}

        {complaint && (
          <div style={{ maxWidth: 980, margin: "0 auto",
            background:"#f9f9f9", border:"2px solid #1B5228", borderRadius:12, padding:16 }}>
            <div style={{ textAlign:"center", marginBottom:10, borderBottom:"1px solid #ccc", paddingBottom:8 }}>
              <h3 style={{ margin:0, color:"#1B5228" }}>📌 {complaint.display_subject || complaint.subject || "Anonymous Complaint"}</h3>
              <div style={{ fontFamily:"Orbitron, sans-serif", marginTop:4, color:"#234a39" }}>
                Complaint ID: {(complaint.vg_id || complaint.id || "").replace(/(.{4})/g,"$1 ").trim()}
              </div>
              <div style={{ marginTop:6, color:"#475569" }}>
                {complaint.institution_name ? <>Institution: <b style={{ color:"#1B5228" }}>{complaint.institution_name}</b></> : null}
              </div>
            </div>

            <div
              ref={listRef}
              style={{
                display:"flex", flexDirection:"column", gap:12,
                maxHeight:"60vh", overflowY:"auto", padding:8, background:"#fff",
                border:"1px solid #cbd5e1", borderRadius:10
              }}
            >
              {messages.map(m => {
                if (m.sender_type === "system") {
                  return (
                    <div key={m.id} style={{ alignSelf:"center", maxWidth:"80%" }}>
                      <div style={{ background:"#F3FAF3", border:"1px dashed #9ae6b4", color:"#234a39",
                        padding:"10px 12px", borderRadius:10, textAlign:"center" }}
                        dangerouslySetInnerHTML={{ __html: (m.content || "").replace(/\n/g,"<br/>") }}
                      />
                      <div style={{ fontSize:12, color:"#64748b", textAlign:"center", marginTop:4 }}>{ts(m.timestamp)}</div>
                    </div>
                  );
                }
                const left = m.sender_type === "responder";
                return (
                  <div key={m.id} style={{ alignSelf: left ? "flex-start" : "flex-end", maxWidth:"70%" }}>
                    <div style={{
                      background: left ? "#F1663D" : "#F5EE1F",
                      color: left ? "white" : "#1B5228",
                      padding:"10px 14px", borderRadius:12, wordBreak:"break-word",
                      fontFamily:"'Titillium Web', sans-serif"
                    }}>
                      {m.content}
                    </div>
                    <div style={{ fontSize:12, color:"#666", marginTop:4, textAlign:"right" }}>{ts(m.timestamp)}</div>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <div style={{ color:"#64748b", textAlign:"center", padding:"12px 0" }}>No messages in this thread.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}