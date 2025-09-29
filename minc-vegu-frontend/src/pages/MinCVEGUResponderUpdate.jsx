// src/pages/MinCVEGUResponderUpdate.jsx  v1.4 (F42)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/MinCVeguDashboard.css";
import "../styles/MinCDashboard.css";
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";
import { FaArrowLeft, FaSearch } from "react-icons/fa";
import { CONFIG } from "../utils/config";

// ---------- helpers ----------
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

// time formatting in responder's timezone
function formatTsTZ(input, tz) {
  if (input === null || input === undefined || input === "") return "—";
  let d;
  try {
    // allow epoch seconds
    if (typeof input === "number") d = new Date(input * 1000);
    else d = new Date(input);
    if (Number.isNaN(d.getTime())) return String(input);

    const parts = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: tz || undefined,
      timeZoneName: "short",
    }).formatToParts(d);

    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ${get("timeZoneName")}`;
  } catch {
    return String(input);
  }
}

const formatNowLocal = () => {
  const parts = new Intl.DateTimeFormat(undefined, {
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",
    hour12:false,timeZoneName:"short"
  }).formatToParts(new Date());
  const get = (t) => parts.find(p=>p.type===t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ${get("timeZoneName")}`;
};

const getSessionUserLabel = () => {
  try {
    const raw = sessionStorage.getItem("mincUser");
    const u = raw ? JSON.parse(raw) : null;
    return (u?.displayName || u?.mincId || "MinC Admin");
  } catch { return "MinC Admin"; }
};

// ---------- constants ----------
const STATUS_OPTIONS = ["active","pending","suspended","locked","expired"];

// Only these are editable on this screen
const EDITABLE_FIELDS = new Set([
  "firstName","middleName","lastName",
  "phone","country","department","status"
  // admin_notes is handled specially; updated_at is set on BE
]);

// ---------- component ----------
export default function MinCVEGUResponderUpdate() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchAbortRef = useRef(null);

  const [responder, setResponder] = useState(null);
  const [etag, setEtag] = useState("");
  const [error, setError] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(null);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);

  // session guard
  useEffect(() => {
    const u = sessionStorage.getItem("mincUser");
    if (!u) nav("/login", { replace: true });
  }, [nav]);

  const isLikelyResponderId = useMemo(() => /^VG\d{2}R\d{6,}$/i.test(query.trim()), [query]);

  // typeahead search (by vg_id, email, names, institution_name keywords)
  useEffect(() => {
    const q = query.trim();
    setResults([]);
    if (!q || isLikelyResponderId) return;

    const t = setTimeout(async () => {
      try {
        if (searchAbortRef.current) searchAbortRef.current.abort();
        const ctrl = new AbortController();
        searchAbortRef.current = ctrl;

        setSearching(true);
        const url = makeUrl(CONFIG.PATHS.VEGU_RESP_SEARCH, `?q=${encodeURIComponent(q)}`);
        const { res, json } = await debugFetch("vegu-responders-search(typeahead)", url, { method: "GET", signal: ctrl.signal });
        if (!res.ok || json.success !== true) {
          setResults([]);
          return;
        }
        setResults(Array.isArray(json.items) ? json.items.slice(0, 10) : []);
      } catch (e) {
        if (e.name !== "AbortError") console.error(e);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, isLikelyResponderId]);

  const seedDraft = (doc) => setDraft(doc ? { ...doc } : null);

  const lookupById = async (id) => {
    setError("");
    setResponder(null);
    setEtag("");
    setLoading(true);
    try {
      const urlGet = makeUrl(`${CONFIG.PATHS.VEGU_RESP_GET}/${encodeURIComponent(id)}`);
      let { res, json } = await debugFetch("vegu-responders-get", urlGet);
      if (res.ok && json?.success && json?.responder) {
        setResponder(json.responder);
        seedDraft(json.responder);
        setEtag(json.etag || "");
        return;
      }
      // fallback: search and take first
      const urlSearch = makeUrl(CONFIG.PATHS.VEGU_RESP_SEARCH, `?q=${encodeURIComponent(id)}`);
      ({ res, json } = await debugFetch("vegu-responders-search(fallback)", urlSearch));
      if (res.ok && json?.success && Array.isArray(json.items) && json.items.length) {
        const item = json.items[0];
        setResponder(item);
        seedDraft(item);
        setEtag(json.etag || "");
        return;
      }
      setError(json?.error || "Responder not found.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Network error during lookup.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError("");
    const q = query.trim();
    if (!q) { setError("Please enter a Responder ID/email/keywords."); return; }

    if (isLikelyResponderId) {
      await lookupById(q);
      return;
    }

    // if we already have results, use them; otherwise do a quick search
    let list = results;
    if (!list || list.length === 0) {
      try {
        setSearching(true);
        const url = makeUrl(CONFIG.PATHS.VEGU_RESP_SEARCH, `?q=${encodeURIComponent(q)}`);
        const { res, json } = await debugFetch("vegu-responders-search", url);
        if (res.ok && json.success === true) list = json.items || [];
      } catch (e) {
        console.error(e);
      } finally {
        setSearching(false);
      }
    }
    if (list && list.length > 0) {
      await lookupById(list[0].vg_id || list[0].id);
    } else {
      setError("No matches. Try different keywords or a full VG Responder ID.");
    }
  };

  const pickResult = async (r) => {
    const id = r.vg_id || r.id;
    setQuery(id);
    await lookupById(id);
    setResults([]);
  };

  const updateDraft = (k, v) => setDraft(d => ({ ...(d || {}), [k]: v }));

  const buildPatch = () => {
    if (!responder || !draft) return {};
    const p = {};
    for (const k of EDITABLE_FIELDS) {
      if (draft[k] !== responder[k]) p[k] = draft[k];
    }
    return p;
  };

  const hasUnsavedChanges = () => Object.keys(buildPatch()).length > 0;

  const handleSave = async () => {
    setSaveError("");
    const patch = buildPatch();
    const changed = Object.keys(patch).length > 0;

    if (!changed) { setEditMode(false); return; }

    if (!newNote.trim()) {
      setSaveError("Admin note is required to save changes.");
      return;
    }

    const stamp = `[${formatNowLocal()}] ${getSessionUserLabel()}: ${newNote.trim()}`;
    patch.admin_notes = (responder.admin_notes ? `${responder.admin_notes}\n` : "") + stamp;

    setSaving(true);
    try {
      const url = makeUrl(CONFIG.PATHS.VEGU_RESP_UPDATE);
      const { res, json } = await debugFetch("vegu-responders-update", url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vg_id: responder.vg_id, etag, patch })
      });

      if (res.status === 409 && json?.error === "etag_mismatch") {
        setSaveError("This record was modified by someone else. Please refresh and retry.");
        if (json.etag) {
          await lookupById(responder.vg_id); // refresh
          setEditMode(true);
        }
        return;
      }

      if (!res.ok || !json?.success) {
        setSaveError(json?.error || `Save failed (${res.status}).`);
        return;
      }

      setResponder(json.responder);
      seedDraft(json.responder);
      setEtag(json.etag || "");
      setNewNote("");
      setEditMode(false);
    } catch (e) {
      console.error(e);
      setSaveError(e.message || "Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  // reverse-chronology notes for view
  const notesDesc = useMemo(() => {
    const s = responder?.admin_notes || "";
    return s.split("\n").map(t => t.trim()).filter(Boolean).reverse();
  }, [responder?.admin_notes]);

  // ---------- UI ----------
  return (
    <div className="vegu-page">
      <MinCSpinnerOverlay open={loading} />

      <div className="vegu-card">
        {/* Back */}
        <div
          className="minc-back-container"
          role="button"
          tabIndex={0}
          onClick={() => nav("/vegu/responders")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/vegu/responders")}
          aria-label="Back to Responders Dashboard"
        >
          <FaArrowLeft className="minc-back-icon" />
          <div className="minc-back-label">Back</div>
        </div>

        <h1 className="vegu-title">Update Responder</h1>

        {/* Search */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
            maxWidth: 720,
            margin: "12px auto 6px",
            position: "relative",
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(-1); }}
            onKeyDown={(e) => {
              if (isLikelyResponderId || results.length === 0) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
              else if (e.key === "Enter" && selectedIdx >= 0) { e.preventDefault(); pickResult(results[selectedIdx]); }
            }}
            placeholder="Enter Responder ID/email or keywords…"
            aria-label="Responder ID/email/keywords"
            autoFocus
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
            <FaSearch /> {isLikelyResponderId ? "Lookup" : "Search"}
          </button>

          {/* Typeahead */}
          {!isLikelyResponderId && (results.length > 0 || searching) && (
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
              {results.map((r, idx) => (
                <button
                  key={r.vg_id || r.id}
                  type="button"
                  onClick={() => pickResult(r)}
                  aria-selected={idx === selectedIdx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: 0,
                    cursor: "pointer",
                    background: idx === selectedIdx ? "#fffef2" : "transparent"
                  }}
                >
                  <span style={{ opacity: 0.85 }}>👤</span>
                  <span style={{ color: "#1B5228", fontWeight: 700 }}>
                    {(r.firstName || "") + (r.lastName ? ` ${r.lastName}` : "") || r.email || "—"}
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

        {/* Error */}
        {error && (
          <div
            role="alert"
            style={{
              maxWidth: 720,
              margin: "0 auto 12px",
              background: "#fff6f6",
              border: "2px solid #f3b8b8",
              color: "#7a1d1d",
              borderRadius: 12,
              padding: "10px 12px",
              fontFamily: "'Exo 2', sans-serif",
            }}
          >
            {error}
          </div>
        )}

        {/* Result */}
        {responder && (
          <div
            style={{
              maxWidth: 980,
              margin: "12px auto 0",
              background: "#E8F4F9",
              border: "2px solid #ffb300",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 6px 20px rgba(0,0,0,.08)",
            }}
          >
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px,1fr))", gap:12 }}>
              {/* read-only essentials */}
              <Field label="VG Responder ID" value={responder.vg_id} readOnly={editMode} />
              <Field label="Email" value={responder.email} readOnly={editMode} />
              <Field label="Institution Name" value={responder.institution_name} readOnly={editMode} />
              <Field label="Institution ID" value={responder.institution_id} readOnly={editMode} />
              <Field label="Timezone" value={responder.timezone} readOnly={editMode} />

              {/* editable */}
              <RWField  edit={editMode} label="First Name"  value={draft?.firstName || ""} onChange={(v)=>updateDraft("firstName", v)} />
              <RWField  edit={editMode} label="Middle Name" value={draft?.middleName || ""} onChange={(v)=>updateDraft("middleName", v)} />
              <RWField  edit={editMode} label="Last Name"   value={draft?.lastName || ""} onChange={(v)=>updateDraft("lastName", v)} />
              <RWField  edit={editMode} label="Phone"       value={draft?.phone || ""} onChange={(v)=>updateDraft("phone", v)} />
              <RWField  edit={editMode} label="Country"     value={draft?.country || ""} onChange={(v)=>updateDraft("country", v)} />
              <RWField  edit={editMode} label="Department"  value={draft?.department || ""} onChange={(v)=>updateDraft("department", v)} />
              <RWSelect edit={editMode} label="Status"      value={draft?.status || ""} onChange={(v)=>updateDraft("status", v)} options={STATUS_OPTIONS} />

              {/* times (rendered in responder's timezone) */}
              <Field label="Local Created At" value={formatTsTZ(responder.local_created_at, responder.timezone)} />
              <Field label="Created At (UTC)" value={formatTsTZ(responder.created_at, responder.timezone)} />
              <Field label="Last Login" value={formatTsTZ(responder.last_login, responder.timezone)} />
              <Field label="Reset Locked Until" value={formatTsTZ(responder.reset_locked_until, responder.timezone)} />
              <Field label="Updated At" value={formatTsTZ(responder.updated_at ?? responder._ts, responder.timezone)} />
            </div>

            {/* Admin notes */}
            {!editMode && responder?.admin_notes && (
              <div style={{ marginTop:12, background:"#fff", border:"1px solid #cbd5e1", borderRadius:10, padding:"10px 12px" }}>
                <div style={{ fontSize:12, color:"#475569", marginBottom:4 }}>Admin Notes</div>
                <pre style={{ margin:0, whiteSpace:"pre-wrap", fontFamily:"inherit", color:"#1B5228" }}>
                  {notesDesc.join("\n")}
                </pre>
              </div>
            )}

            {editMode && (
              <>
                {notesDesc.length > 0 && (
                  <div style={{ background:"#fff", border:"1px solid #cbd5e1", borderRadius:10, padding:"10px 12px", marginTop:12 }}>
                    <div style={{ fontSize:12, color:"#475569", marginBottom:4 }}>Existing Admin Notes</div>
                    <pre style={{ margin:0, whiteSpace:"pre-wrap", fontFamily:"inherit", color:"#1B5228" }}>
                      {notesDesc.join("\n")}
                    </pre>
                  </div>
                )}
                <TextAreaRow
                  label="New Admin Note (required to save changes)"
                  value={newNote}
                  onChange={setNewNote}
                  placeholder="Brief reason for the change…"
                  rows={3}
                  required
                />
              </>
            )}

            {/* Actions */}
            <div style={{ textAlign:"right", marginTop:12, display:"flex", gap:10, justifyContent:"flex-end" }}>
              {!editMode ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => { setEditMode(true); seedDraft(responder); setSaveError(""); }}
                  style={{ padding:"10px 16px", borderRadius:10, border:"2px solid #F1663D", background:"#F5EE1F", color:"#1B5228", fontWeight:800 }}
                >
                  Update…
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (hasUnsavedChanges() || newNote.trim()) setShowDiscard(true);
                      else {
                        setEditMode(false);
                        seedDraft(responder);
                        setNewNote("");
                        setSaveError("");
                      }
                    }}
                    style={{ padding:"10px 16px", borderRadius:10, border:"2px solid #cbd5e1", background:"#fff", color:"#334155", fontWeight:700 }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleSave}
                    style={{ padding:"10px 16px", borderRadius:10, border:"2px solid #F1663D", background:"#F5EE1F", color:"#1B5228", fontWeight:800 }}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </>
              )}
            </div>

            {saveError && (
              <div role="alert" style={{ marginTop:10, background:"#fff6f6", border:"2px solid #f3b8b8", color:"#7a1d1d", borderRadius:12, padding:"10px 12px", fontFamily:"'Exo 2', sans-serif" }}>
                {saveError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Discard dialog */}
      {showDiscard && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDiscard(false); }}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.35)", display:"grid", placeItems:"center", zIndex:1000 }}
        >
          <div style={{ background:"white", borderRadius:14, padding:18, maxWidth:520, width:"92%", boxShadow:"0 14px 40px rgba(0,0,0,.25)", border:"2px solid #cbd5e1" }}>
            <div id="discard-title" style={{ fontWeight:800, color:"#1B5228", marginBottom:8 }}>Discard changes?</div>
            <div style={{ color:"#334155", marginBottom:14 }}>You have unsaved edits. If you leave now, your changes will be lost.</div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button
                type="button"
                onClick={() => setShowDiscard(false)}
                className="btn"
                style={{ padding:"10px 16px", borderRadius:10, border:"2px solid #cbd5e1", background:"#fff", color:"#334155", fontWeight:700 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscard(false);
                  setEditMode(false);
                  seedDraft(responder);
                  setNewNote("");
                  setSaveError("");
                }}
                className="btn"
                style={{ padding:"10px 16px", borderRadius:10, border:"2px solid #F1663D", background:"#F5EE1F", color:"#1B5228", fontWeight:800 }}
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- small building blocks ----------
function Field({ label, value, readOnly = false }) {
  const base = {
    background: "white",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    minHeight: 52,
  };
  const ro = readOnly ? { background:"#f7fafc", border:"1px dashed #cbd5e1" } : {};
  return (
    <div style={{ ...base, ...ro }} aria-readonly={readOnly ? "true" : undefined}>
      <div style={{ fontSize:12, color: readOnly ? "#718096" : "#475569", marginBottom:4, display:"flex", gap:6, alignItems:"center" }}>
        {readOnly && <span aria-hidden="true">🔒</span>}
        {label}
      </div>
      <div style={{ color: readOnly ? "#2f855a" : "#1B5228", fontWeight:700, wordBreak:"break-word" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function InputRow({ label, value, onChange, placeholder="" }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #cbd5e1", borderRadius:10, padding:"10px 12px" }}>
      <div style={{ fontSize:12, color:"#475569", marginBottom:4 }}>{label}</div>
      <input
        value={value || ""}
        onChange={(e)=>onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width:"100%", border:"1px solid #cbd5e1", borderRadius:8, padding:"8px 10px", fontFamily:"'Exo 2', sans-serif" }}
      />
    </div>
  );
}

function TextAreaRow({ label, value, onChange, rows=3, required=false, placeholder="" }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #cbd5e1", borderRadius:10, padding:"10px 12px" }}>
      <div style={{ fontSize:12, color:"#475569", marginBottom:4 }}>
        {label}{required ? " *" : ""}
      </div>
      <textarea
        value={value || ""}
        onChange={(e)=>onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{ width:"100%", border:"1px solid #cbd5e1", borderRadius:8, padding:"8px 10px", fontFamily:"'Exo 2', sans-serif", resize:"vertical" }}
      />
    </div>
  );
}

function SelectRow({ label, value, onChange, options=[] }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #cbd5e1", borderRadius:10, padding:"10px 12px" }}>
      <div style={{ fontSize:12, color:"#475569", marginBottom:4 }}>{label}</div>
      <select
        value={value || ""}
        onChange={(e)=>onChange(e.target.value)}
        style={{ width:"100%", border:"1px solid #cbd5e1", borderRadius:8, padding:"8px 10px", fontFamily:"'Exo 2', sans-serif" }}
      >
        <option value="">— Select —</option>
        {options.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
      </select>
    </div>
  );
}

function RWField({ edit, label, value, onChange, placeholder }) {
  return edit ? <InputRow label={label} value={value} onChange={onChange} placeholder={placeholder} /> : <Field label={label} value={value} />;
}
function RWSelect({ edit, label, value, onChange, options }) {
  return edit ? <SelectRow label={label} value={value} onChange={onChange} options={options} /> : <Field label={label} value={value} />;
}