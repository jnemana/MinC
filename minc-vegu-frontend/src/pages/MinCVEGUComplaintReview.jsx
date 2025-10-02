// src/pages/MinCVEGUComplaintReview.jsx  v1.6

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/MinCVeguDashboard.css";
import "../styles/MinCDashboard.css";
import "../styles/ChatThread.css";
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";
import { FaArrowLeft, FaSearch } from "react-icons/fa";
import { CONFIG } from "../utils/config";
import UsePageTitle from "../utils/UsePageTitle";

// ------- helpers (same style as Users) -------
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
  const s = String(iso);
  const d = new Date(s.endsWith("Z") ? s : s + "Z");
  const pad = (n) => String(n).padStart(2, "0");
  return isNaN(d) ? "—"
    : `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// --- threat helpers (maps/casing) ---
const threatLevelOf = (c = {}) =>
  (c.threat_level || c.severity || c.level || "").toString().trim();

const threatStatusOf = (c = {}) =>
  (c.threat_status || c.status || "").toString().trim();

const levelColors = (lvlRaw) => {
  const lvl = lvlRaw.toUpperCase();
  if (["LOW"].includes(lvl)) return { bg:"#DCFCE7", br:"#16A34A", fg:"#065F46" };        // green
  if (["MEDIUM","MODERATE"].includes(lvl)) return { bg:"#FEF9C3", br:"#EAB308", fg:"#713F12" }; // yellow
  if (["HIGH"].includes(lvl)) return { bg:"#FFE4E6", br:"#FB7185", fg:"#7F1D1D" };       // rose
  if (["SERIOUS","CRITICAL","SEVERE"].includes(lvl)) return { bg:"#FEE2E2", br:"#EF4444", fg:"#7F1D1D" }; // red
  return { bg:"#E2E8F0", br:"#64748B", fg:"#1F2937" };                                   // slate (unknown)
};

const statusColors = (stRaw) => {
  const st = stRaw.toUpperCase();
  if (["OPEN","NEW"].includes(st)) return { bg:"#FFE4E6", br:"#FB7185", fg:"#7F1D1D" };         // red-ish
  if (["UNDER REVIEW","IN REVIEW","INVESTIGATING","IN PROGRESS"].includes(st))
    return { bg:"#E0F2FE", br:"#38BDF8", fg:"#0C4A6E" };                                        // sky
  if (["ESCALATED"].includes(st)) return { bg:"#EDE9FE", br:"#8B5CF6", fg:"#4C1D95" };          // violet
  if (["RESOLVED","CLOSED","DONE"].includes(st)) return { bg:"#DCFCE7", br:"#16A34A", fg:"#065F46" }; // green
  return { bg:"#E2E8F0", br:"#64748B", fg:"#1F2937" };                                           // slate
};

const badge = (label, palette) => ({
  display:"inline-flex",
  alignItems:"center",
  gap:8,
  padding:"6px 10px",
  borderRadius:999,
  background:palette.bg,
  border:`2px solid ${palette.br}`,
  color:palette.fg,
  fontFamily:"'Exo 2', sans-serif",
  fontWeight:700,
  fontSize:14,
});

export default function MinCVEGUComplaintReview() {
  UsePageTitle("View Complaint");

  const nav = useNavigate();
  const { vg_id } = useParams();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // search UX
  const [query, setQuery] = useState(vg_id || "");
  const [typeahead, setTypeahead] = useState([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef(null);

  // data
  const [complaint, setComplaint] = useState(null);
  const [messages, setMessages] = useState([]);

  // scroll helpers
  const listRef = useRef(null);
  const prevCountRef = useRef(0);

  const [searchOpen, setSearchOpen] = useState(false);   // controls results popover/chip
  const [results, setResults] = useState([]);            // search results list
  const inputRef = useRef(null);                         // the VG-ID input

  // ----- typeahead like Users -----
  useEffect(() => {
    const q = (query || "").trim();
    setTypeahead([]);
    if (!q || /^\s*VG\d{4,}\s*$/i.test(q)) return; // if looks like ID, don't query until submit

    const t = setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        setSearching(true);
        const url = makeUrl(CONFIG.PATHS.VEGU_COMPLAINTS_SEARCH, `?q=${encodeURIComponent(q)}`);
        const { res, json } = await debugFetch("vegu-complaints-search(typeahead)", url, { method: "GET", signal: ctrl.signal });
        if (!res.ok || json.success !== true) { setTypeahead([]); return; }
        const items = Array.isArray(json.items) ? json.items.slice(0, 10) : [];
        setTypeahead(items);
      } catch (e) {
        if (e.name !== "AbortError") console.error(e);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // ----- fetch complaint by id -----
  const loadComplaint = async (id) => {
    setErr(""); setLoading(true);
    try {
      const url = makeUrl(`${CONFIG.PATHS.VEGU_COMPLAINTS_GET}/${encodeURIComponent(id)}`);
      const { res, json } = await debugFetch("vegu-complaints-get", url);
      if (!res.ok || json?.success === false) throw new Error(json?.error || `Fetch failed (${res.status})`);

      const c = json?.complaint || json;
      setComplaint(c);

      // Prefer embedded messages if present
      const msgs = Array.isArray(json?.messages) ? json.messages : [];
      setMessages(msgs);

       // ---- close the search UI
      setTypeahead([]);
      inputRef.current?.blur();

    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load complaint.");
      setComplaint(null);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  // deep-link support
  useEffect(() => {
    if (vg_id) {
      setQuery(vg_id);
      loadComplaint(vg_id);
    }
    // if no vg_id, we stay on search mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vg_id]);

  // search submit
  const onSearch = async (e) => {
    e?.preventDefault?.();
    const q = (query || "").trim();
    if (!q) return;

    // close UI immediately on submit
    setTypeahead([]);
    inputRef.current?.blur();

    // If it looks like a VG id, go straight
    if (/^VG\d{4,}$/i.test(q)) {
      // navigate to deep route for consistency (you can also just call loadComplaint)
      nav(`/vegu/complaints/review/${q}`);
      return;
    }

    // otherwise run a search and take first match
    try {
      setSearching(true);
      const url = makeUrl(CONFIG.PATHS.VEGU_COMPLAINTS_SEARCH, `?q=${encodeURIComponent(q)}`);
      const { res, json } = await debugFetch("vegu-complaints-search", url);
      const items = res.ok && json?.success ? (json.items || []) : [];

      if (items.length > 0) {
        const first = items[0];
        const id = first.vg_id || first.id;
        nav(`/vegu/complaints/review/${id}`);
      } else {
        setErr("No complaints match your search.");
      }

    } finally {
      setSearching(false);
    }
  };

  // pick from typeahead
  const pick = (item) => {
    const id = item.vg_id || item.id;
    setTypeahead([]);
    inputRef.current?.blur();
    nav(`/vegu/complaints/review/${id}`);
  };

  // autoscroll when near-bottom
  const nearBottom = (el) => !el ? false : (el.scrollTop + el.clientHeight >= el.scrollHeight - 120);
  useLayoutEffect(() => {
    const el = listRef.current;
    const wasNear = nearBottom(el);
    if (el && wasNear && messages.length > prevCountRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  return (
    <div className="vegu-page">
      <MinCSpinnerOverlay open={loading} />

      <div className="vegu-card" style={{ paddingBottom: 8 }}
        onClick={(e) => {
        // if the click wasn't inside the form, close the list
        if (!e.target.closest("form")) setTypeahead([]);
        }}
      >
        {/* Back */}
        <div
          className="minc-back-container"
          role="button"
          tabIndex={0}
          onClick={() => nav("/vegu/complaints")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/vegu/complaints")}
          aria-label="Back to Complaints Actions"
        >
          <FaArrowLeft className="minc-back-icon" />
          <div className="minc-back-label">Back</div>
        </div>

        <h1 className="vegu-title" style={{ marginBottom: 10 }}>View Complaint</h1>

        {/* SEARCH BAR (shown always; it doubles as “Jump to…” even when a complaint is loaded) */}
        <form
          onSubmit={onSearch}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
            maxWidth: 720,
            margin: "0 auto 8px",
            position: "relative",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter Complaint ID/keywords…"
            aria-label="Complaint ID/keywords"
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "2px solid #9aa5b1",
              fontFamily: "'Exo 2', sans-serif",
              fontSize: "1rem",
            }}
          />
          <button
            type="submit"
            className="btn"
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              border: "2px solid #F1663D",
              background: "#F5EE1F",
              color: "#1B5228",
              fontWeight: 800,
              display: "grid",
              gridAutoFlow: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <FaSearch /> Search
          </button>

          {/* typeahead */}
          {!!typeahead.length && (
            <div
              role="listbox"
              style={{
                position: "absolute",
                top: "100%",
                left: 0, right: 0,
                zIndex: 20,
                background: "white",
                border: "2px solid #cbd5e1",
                borderRadius: 12,
                marginTop: 6,
                boxShadow: "0 10px 28px rgba(0,0,0,.12)",
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {searching && (
                <div style={{ padding: "10px 12px", color: "#64748b", fontFamily: "'Exo 2', sans-serif" }}>
                  Searching…
                </div>
              )}
              {typeahead.map((r) => (
                <button
                  key={r.vg_id || r.id}
                  type="button"
                  onClick={() => pick(r)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: 0,
                    cursor: "pointer",
                    background: "transparent"
                  }}
                >
                  <span style={{ opacity: 0.85 }}>💬</span>
                  <span style={{ color: "#1B5228", fontWeight: 700 }}>
                    {r.display_subject || r.subject || "—"}
                    <span style={{ color: "#64748b", fontWeight: 500 }}>
                      {" "}— {r.institution_name || "—"}
                    </span>
                  </span>
                  <span style={{ fontFamily: "Orbitron, sans-serif", color: "#234a39" }}>
                    {r.vg_id || r.id}
                  </span>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* error */}
        {err && (
          <div
            role="alert"
            style={{
              maxWidth: 960, margin: "0 auto 12px",
              background:"#fff6f6", border:"2px solid #f3b8b8",
              color:"#7a1d1d", borderRadius:12, padding:"10px 12px",
              fontFamily:"'Exo 2', sans-serif"
            }}
          >
            {err}
          </div>
        )}

        {/* details */}
        {complaint && (
          <div
            style={{
              maxWidth: 980, margin: "0 auto",
              background:"#f9f9f9", border:"2px solid #1B5228",
              borderRadius:12, padding:16
            }}
          >
            <div style={{ textAlign:"center", marginBottom:10, borderBottom:"1px solid #ccc", paddingBottom:8 }}>
              <h3 style={{ margin:0, color:"#1B5228" }}>
                📌 {complaint.display_subject || complaint.subject || "Anonymous Complaint"}
              </h3>
              <div style={{ fontFamily:"Orbitron, sans-serif", marginTop:4, color:"#234a39" }}>
                Complaint ID: {(complaint.vg_id || complaint.id || "").replace(/(.{4})/g,"$1 ").trim()}
              </div>
              {complaint.institution_name && (
                <div style={{ marginTop:6, color:"#475569" }}>
                  Institution: <b style={{ color:"#1B5228" }}>{complaint.institution_name}</b>
                </div>
              )}

{/* Threat badges */}
{(() => {
  const lvl = threatLevelOf(complaint);
  const st  = threatStatusOf(complaint);
  const lvlP = levelColors(lvl || "");
  const stP  = statusColors(st || "");
  return (
    <div style={{ marginTop:10, display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
      {lvl && (
        <span style={badge("Threat Level", lvlP)}>
          <span role="img" aria-label="level">⚠️</span>
          <span>Threat Level: {lvl}</span>
        </span>
      )}
      {st && (
        <span style={badge("Threat Status", stP)}>
          <span role="img" aria-label="status">📍</span>
          <span>Threat Status: {st}</span>
        </span>
      )}
    </div>
  );
})()}

            </div>

            <div className="chat-thread-messages" ref={listRef} style={{ maxHeight: "60vh" }}>
              {messages.map((m) => {
                // normalize legacy fields -> our renderer shape
                const role = m.role || m.sender_type; // "user" | "responder" | "system"
                const content = m.text ?? m.content ?? "";
                const when = m.ts ?? m.timestamp;

                if (role === "system") {
                  return (
                    <div key={m.id} className="system-message">
                      <div className="system-bubble">
                        <div
                          className="system-text"
                          dangerouslySetInnerHTML={{ __html: String(content || "").replace(/\n/g, "<br/>") }}
                        />
                        <div className="system-time">{ts(when)}</div>
                      </div>
                    </div>
                  );
                }

                const side = role === "responder" ? "left" : "right";
                return (
                  <div key={m.id} className={`chat-bubble ${side}`}>
                    <div className="bubble-content">{content}</div>
                    <div className="bubble-timestamp">{ts(when)}</div>
                  </div>
                );
              })}

              {messages.length === 0 && (
                <div style={{ color:"#64748b", textAlign:"center", padding:"12px 0" }}>
                  No messages in this thread.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}