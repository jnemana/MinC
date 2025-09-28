// src/pages/MinCVEGUInstitutionUpdate.jsx  v1.3

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/MinCVeguDashboard.css";
import "../styles/MinCDashboard.css";
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";
import { FaArrowLeft, FaSearch } from "react-icons/fa";
import { CONFIG } from "../utils/config";

const debugFetch = async (label, url, init = {}) => {
  console.log(`➡️ ${label} REQ`, url, init);
  const res = await fetch(url, init);
  const text = await res.text();
  console.log(`⬅️ ${label} RESP ${res.status}`, text);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { parseError: true, text };
  }
  return { res, json };
};

// --- dropdown vocab ---
const STATUS_OPTIONS = ["active","pending","locked","expired","suspended","paymentdue"];
const PLAN_OPTIONS   = ["free","paid","school district","enterprise","other"];

// NOTE: institution_type values in DB can be "Education"/"Educational Institution"
// or "Company"/"Company/Workplace". We handle both.
const EDUCATIONAL_INSTITUTION_CATEGORY_OPTIONS = [
  "School","College","University","Community College","Training Institution","Other"
];
const WORKPLACE_INSTITUTION_CATEGORY_OPTIONS = [
  "Consulting Services","Financial Services","Healthcare","Legal Services","Manufacturing","Retail","Technology","Other"
];

// --- FE rule: what is editable on this screen ---
const EDITABLE_FIELDS = new Set([
  "status","plan_type","institution_category",
  "address1","address2","city","state","postal_code",
  "complaint_phone",
  "primary_contact_name","primary_contact_phone","primary_contact_email",
  "website_url","comment"
  // NOTE: country not editable (partition key), complaint_email not editable, name not editable, institution_type read-only
]);

const OTHER_PREFIX = "Other - ";
function splitOtherCategory(raw) {
  const s = raw || "";
  if (s.startsWith(OTHER_PREFIX)) {
    return { base: "Other", detail: s.slice(OTHER_PREFIX.length) };
  }
  return { base: s, detail: "" };
}
function joinOtherCategory(base, detail) {
  if ((base || "").toLowerCase() === "other") {
    const d = (detail || "").trim();
    return d ? `${OTHER_PREFIX}${d}` : "Other";
  }
  return base || "";
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

// ---- local time formatter (YYYY-MM-DD HH:mm:ss TZ) ----
function formatLocalTs(input) {
  if (input === null || input === undefined || input === "") return "—";
  let d;
  try {
    if (typeof input === "number") d = new Date(input * 1000);
    else d = new Date(input);
    if (Number.isNaN(d.getTime())) return String(input);
    const parts = new Intl.DateTimeFormat(undefined, {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, timeZoneName: "short",
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ${get("timeZoneName")}`;
  } catch {
    return String(input);
  }
}

// Build URLs consistently with the rest of the app
const makeUrl = (path, qs = "") => {
  const base = CONFIG.API_BASE || "";
  const key  = CONFIG.API_KEY;
  const sep  = qs.includes("?") ? "&" : "?";
  const withKey = key ? `${qs}${sep}code=${encodeURIComponent(key)}` : qs || "";
  const url = `${base}${path}${withKey}`;
  console.debug("[MinC] calling:", url);
  return url;
};

export default function MinCVEGUInstitutionUpdate() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [showNotesFull, setShowNotesFull] = useState(false);

  const [instId, setInstId] = useState(""); // text in the input (can be ID or keyword)
  const [etag, setEtag] = useState("");
  const [inst, setInst] = useState(null);
  const [error, setError] = useState("");

  // search state
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchAbortRef = useRef(null);

  // edit mode state
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(null);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // NEW: discard confirm
  const [showDiscard, setShowDiscard] = useState(false);

  const notesPreview = (txt = "") =>
  txt.trim().split("\n").slice(-3).join("\n"); // last 3 lines

  // session guard
  useEffect(() => {
    const u = sessionStorage.getItem("mincUser");
    if (!u) nav("/login", { replace: true });
  }, [nav]);

useEffect(() => {
  if (!showDiscard) return;
  const onKey = (e) => e.key === "Escape" && setShowDiscard(false);
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [showDiscard]);

  const isLikelyId = useMemo(() => /^VG\d{5,}$/.test(instId.trim()), [instId]);

  // --- search as you type (keywords or partial ID) ---
  useEffect(() => {
    const q = instId.trim();
    setResults([]);
    if (!q || isLikelyId) return;

    const t = setTimeout(async () => {
      try {
        if (searchAbortRef.current) searchAbortRef.current.abort();
        const ctrl = new AbortController();
        searchAbortRef.current = ctrl;

        setSearching(true);
        const url = makeUrl(CONFIG.PATHS.VEGU_INST_SEARCH, `?q=${encodeURIComponent(q)}`);
        const { res, json } = await debugFetch("vegu-institutions-search(typeahead)", url, { method: "GET", signal: ctrl.signal });
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
  }, [instId, isLikelyId]);

  const seedDraftFromDoc = (doc) => {
    const { base, detail } = splitOtherCategory(doc.institution_category);
    setDraft({ ...doc, _cat_base: base, _cat_detail: detail });
  };

  const lookupById = async (id) => {
    setError("");
    setInst(null);
    setEtag("");
    setLoading(true);
    try {
      // Preferred: dedicated GET by ID
      const urlGet = makeUrl(`${CONFIG.PATHS.VEGU_INST_GET}/${encodeURIComponent(id)}`);
      let { res, json } = await debugFetch("vegu-institutions-get", urlGet);
      if (res.ok && json && json.success && json.institution) {
        setInst(json.institution || null);
        seedDraftFromDoc(json.institution);
        setEtag(json.etag || "");
        return;
      }
      // Fallback: search by q=id and take first match
      const urlSearch = makeUrl(CONFIG.PATHS.VEGU_INST_SEARCH, `?q=${encodeURIComponent(id)}`);
      ({ res, json } = await debugFetch("vegu-institutions-search(fallback)", urlSearch));
      if (res.ok && json && json.success && Array.isArray(json.items) && json.items.length) {
        const item = json.items[0];
        setInst(item);
        setEtag(json.etag || "");
        seedDraftFromDoc(item);
        return;
      }
      setError((json && json.error) || "Institution not found.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Network error during lookup.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    const q = instId.trim();
    setError("");

    if (!q) {
      setError("Please enter an Institution ID or keywords.");
      return;
    }
    if (isLikelyId) {
      await lookupById(q);
      return;
    }

    let list = results;
    if (!list || list.length === 0) {
      try {
        setSearching(true);
        const url = makeUrl(CONFIG.PATHS.VEGU_INST_SEARCH, `?q=${encodeURIComponent(q)}`);
        const { res, json } = await debugFetch("vegu-institutions-search", url);
        if (res.ok && json.success === true) list = json.items || [];
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }
    if (list && list.length > 0) {
      await lookupById(list[0].vg_id || list[0].id);
    } else {
      setError("No matches. Try different keywords or a full VG ID.");
    }
  };

  const pickResult = async (r) => {
    const id = r.vg_id || r.id;
    setInstId(id);
    await lookupById(id);
    setResults([]);
  };

  const updateDraft = (field, value) => {
    setDraft(d => ({ ...(d || {}), [field]: value }));
  };

  // reverse-chronology admin notes (newest first)
const notesDesc = React.useMemo(() => {
  const s = inst?.admin_notes || "";
  return s
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .reverse();
}, [inst?.admin_notes]);

  // category options based on (read-only) institution_type
  const typeKey = (inst?.institution_type || "").toLowerCase();
  const isEdu = typeKey.startsWith("education");  // "Education" or "Educational Institution"
  const isCompany = typeKey.startsWith("company");
  const categoryOptions = isEdu
    ? EDUCATIONAL_INSTITUTION_CATEGORY_OPTIONS
    : (isCompany ? WORKPLACE_INSTITUTION_CATEGORY_OPTIONS : []);

  // plan/category detail toggles
  const needsPlanDetail = (draft?.plan_type || "").toLowerCase() === "other";
  const needsCatDetail  = (draft?._cat_base || "").toLowerCase() === "other";

  // build patch (only changed & editable)
  const buildPatch = () => {
    if (!inst || !draft) return {};
    const p = {};

    for (const k of EDITABLE_FIELDS) {
      if (k === "institution_category") continue; // handled below
      if (draft[k] !== inst[k]) p[k] = draft[k];
    }

    // Plan: fold detail when "other"
    if ((draft?.plan_type || "").toLowerCase() === "other" && draft._plan_detail?.trim()) {
      p.plan_type = `Other - ${draft._plan_detail.trim()}`;
    }

    // Category: recompose from base/detail, then diff vs original
    const recomposed = joinOtherCategory(draft._cat_base, draft._cat_detail);
    if (recomposed !== (inst.institution_category || "")) {
      p.institution_category = recomposed;
    }

    return p;
  };

  const hasUnsavedChanges = () => {
  const p = buildPatch();
  // note text itself shouldn't block cancel if no field changed
  return Object.keys(p).length > 0;
  };

  const handleSave = async () => {
    setSaveError("");
    const patch = buildPatch();
    const hasChanges = Object.keys(patch).length > 0;

    if (!hasChanges) { setEditMode(false); return; }

    if (!newNote.trim()) {
      setSaveError("Admin note is required to save changes.");
      return;
    }

    const stamp = `[${formatNowLocal()}] ${getSessionUserLabel()}: ${newNote.trim()}`;
    const mergedNotes = (inst.admin_notes ? `${inst.admin_notes}\n` : "") + stamp;
    patch.admin_notes = mergedNotes;

    setSaving(true);
    try {
      const url = makeUrl(CONFIG.PATHS.VEGU_INST_UPDATE);
      const { res, json } = await debugFetch("vegu-institutions-update", url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vg_id: inst.vg_id, etag, patch })
      });

      if (res.status === 409 && json?.error === "etag_mismatch") {
        setSaveError("This record was modified by someone else. Please refresh and retry.");
        if (json.etag) {
          await lookupById(inst.vg_id); // refresh with latest
          setEditMode(true);
        }
        return;
      }

      if (!res.ok || !json?.success) {
        setSaveError(json?.error || `Save failed (${res.status}).`);
        return;
      }

      setInst(json.institution);
      seedDraftFromDoc(json.institution);
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

  return (
    <div className="vegu-page">
      <MinCSpinnerOverlay open={loading} />

      <div className="vegu-card">
        {/* Back only (no Logout on this screen) */}
        <div
          className="minc-back-container"
          role="button"
          tabIndex={0}
          onClick={() => nav("/vegu/institutions")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/vegu/institutions")}
          aria-label="Back to Institutions Dashboard"
        >
          <FaArrowLeft className="minc-back-icon" />
          <div className="minc-back-label">Back</div>
        </div>

        <h1 className="vegu-title">Update Institution</h1>

        {/* Lookup/Search */}
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
            value={instId}
            onChange={(e) => { setInstId(e.target.value); setSelectedIdx(-1); }}
            onKeyDown={(e) => {
              if (isLikelyId || results.length === 0) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter" && selectedIdx >= 0) { e.preventDefault(); pickResult(results[selectedIdx]); }
            }}
            placeholder="Enter Institution ID (e.g., VG25001055) or keywords…"
            aria-label="Institution ID or search keywords"
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
            <FaSearch /> {isLikelyId ? "Lookup" : "Search"}
          </button>

          {/* Typeahead dropdown */}
          {!isLikelyId && (results.length > 0 || searching) && (
            <div
              role="listbox"
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
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
                  key={r.id || r.vg_id}
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
                  <span style={{ opacity: 0.85 }}>🏢</span>
                  <span style={{ color: "#1B5228", fontWeight: 700 }}>
                    {r.name || "—"}
                    <span style={{ color: "#64748b", fontWeight: 500 }}>
                      {" "}— {r.city || "—"}, {r.country || "—"}
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
        {inst && (
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))",
                gap: 12,
              }}
            >
              {/* Non-editable on this screen */}
              <Field label="Name" value={inst.name} readOnly={editMode} />
              <Field label="VG ID" value={inst.vg_id} readOnly={editMode} />
              <Field label="Country" value={inst.country} readOnly={editMode} />
              <Field label="Complaint Email" value={inst.complaint_email} readOnly={editMode} />

              {/* Editable dropdowns */}
              <RWSelect
                edit={editMode}
                label="Status"
                value={draft?.status ?? inst?.status ?? ""}
                onChange={(v)=>updateDraft("status", v)}
                options={STATUS_OPTIONS}
              />
              <RWSelect
                edit={editMode}
                label="Plan"
                value={draft?.plan_type ?? inst?.plan_type ?? ""}
                onChange={(v)=>updateDraft("plan_type", v)}
                options={PLAN_OPTIONS}
              />
              {editMode && needsPlanDetail && (
                <InputRow
                  label="Plan detail (when Other)"
                  value={draft?._plan_detail || ""}
                  onChange={(v)=>updateDraft("_plan_detail", v)}
                  placeholder="e.g., Free for 3 months"
                />
              )}

              {/* Institution Type — read-only in edit mode */}
              <Field label="Institution Type" value={inst?.institution_type || "—"} readOnly={editMode} />

              {/* Institution Category — context-aware + Other detail */}
              {!editMode ? (
                <Field label="Institution Category" value={inst.institution_category} />
              ) : (
                <>
                  <SelectRow
                    label="Institution Category"
                    value={draft?._cat_base || ""}
                    onChange={(v)=>{ updateDraft("_cat_base", v); if (v !== "Other") updateDraft("_cat_detail", ""); }}
                    options={categoryOptions}
                  />
                  {(draft?._cat_base || "").toLowerCase() === "other" && (
                    <InputRow
                      label="Please specify"
                      value={draft?._cat_detail || ""}
                      onChange={(v)=>updateDraft("_cat_detail", v)}
                      placeholder="e.g., Online University"
                    />
                  )}
                </>
              )}

              {/* text inputs */}
              <RWField edit={editMode} label="Address1" value={draft?.address1 || ""} onChange={(v)=>updateDraft("address1", v)} />
              <RWField edit={editMode} label="Address2" value={draft?.address2 || ""} onChange={(v)=>updateDraft("address2", v)} />
              <RWField edit={editMode} label="City" value={draft?.city || ""} onChange={(v)=>updateDraft("city", v)} />
              <RWField edit={editMode} label="State" value={draft?.state || ""} onChange={(v)=>updateDraft("state", v)} />
              <RWField edit={editMode} label="Postal Code" value={draft?.postal_code || ""} onChange={(v)=>updateDraft("postal_code", v)} />
              <RWField edit={editMode} label="Complaint Phone" value={draft?.complaint_phone || ""} onChange={(v)=>updateDraft("complaint_phone", v)} />
              <RWField edit={editMode} label="Primary Contact Name" value={draft?.primary_contact_name || ""} onChange={(v)=>updateDraft("primary_contact_name", v)} />
              <RWField edit={editMode} label="Primary Contact Phone" value={draft?.primary_contact_phone || ""} onChange={(v)=>updateDraft("primary_contact_phone", v)} />
              <RWField edit={editMode} label="Primary Contact Email" value={draft?.primary_contact_email || ""} onChange={(v)=>updateDraft("primary_contact_email", v)} />
              <RWField edit={editMode} label="Website" value={draft?.website_url || ""} onChange={(v)=>updateDraft("website_url", v)} />
              <RWTextArea edit={editMode} label="Institution Comments" value={draft?.comment || ""} onChange={(v)=>updateDraft("comment", v)} rows={2} />

              {/* read-only */}
              <Field label="Updated At" value={formatLocalTs(inst.updated_at ?? inst._ts)} />
            </div>

            {/* Read-only Admin Notes in view mode */}
{!editMode && inst?.admin_notes && (
  <div
    style={{
      marginTop: 12,
      background: "#fff",
      border: "1px solid #cbd5e1",
      borderRadius: 10,
      padding: "10px 12px",
    }}
  >
    <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>
      Admin Notes
    </div>
    <pre
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        fontFamily: "inherit",
        color: "#1B5228",
      }}
    >
      {inst.admin_notes
        .trim()
        .split("\n")
        .filter(Boolean)            // drop empty lines
        .reverse()                  // newest first
        .join("\n")}
    </pre>
  </div>
)}

            {/* Admin Notes entry (only in edit mode) */}
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
            <div style={{ textAlign: "right", marginTop: 12, display:"flex", gap:10, justifyContent:"flex-end" }}>
              {!editMode ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => { setEditMode(true); seedDraftFromDoc(inst); setSaveError(""); }}
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
    if (hasUnsavedChanges() || newNote.trim()) {
      setShowDiscard(true);               // <-- open dialog
    } else {
      setEditMode(false);                 // nothing to lose; just exit
      setDraft(inst ? { ...inst } : null);
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

            {/* Save error */}
            {saveError && (
              <div role="alert" style={{ marginTop:10, background:"#fff6f6", border:"2px solid #f3b8b8", color:"#7a1d1d", borderRadius:12, padding:"10px 12px", fontFamily:"'Exo 2', sans-serif" }}>
                {saveError}
              </div>
            )}
          </div>
        )}
      </div>
      {showDiscard && (
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="discard-title"
    onClick={(e) => {
      // close only on backdrop click
      if (e.target === e.currentTarget) setShowDiscard(false);
    }}
    style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.35)",
      display: "grid", placeItems: "center", zIndex: 1000
    }}
  >
    <div
      style={{
        background: "white", borderRadius: 14, padding: 18, maxWidth: 520, width: "92%",
        boxShadow: "0 14px 40px rgba(0,0,0,.25)", border: "2px solid #cbd5e1"
      }}
    >
      <div id="discard-title" style={{ fontWeight: 800, color: "#1B5228", marginBottom: 8 }}>
        Discard changes?
      </div>
      <div style={{ color: "#334155", marginBottom: 14 }}>
        You have unsaved edits. If you leave now, your changes will be lost.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
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
            setDraft(inst ? { ...inst } : null);
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

function Field({ label, value, readOnly = false }) {
  const base = {
    background: "white",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    minHeight: 52,
  };
  const ro = readOnly ? {
    background: "#f7fafc",
    border: "1px dashed #cbd5e1",
  } : {};
  return (
    <div style={{ ...base, ...ro }} aria-readonly={readOnly ? "true" : undefined}>
      <div style={{ fontSize: 12, color: readOnly ? "#718096" : "#475569", marginBottom: 4, display:"flex", gap:6, alignItems:"center" }}>
        {readOnly && <span aria-hidden="true">🔒</span>}
        {label}
      </div>
      <div style={{ color: readOnly ? "#2f855a" : "#1B5228", fontWeight: 700, wordBreak: "break-word" }}>
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

// read/write versions of a field
function RWField({ edit, label, value, onChange, placeholder }) {
  return edit
    ? <InputRow label={label} value={value} onChange={onChange} placeholder={placeholder} />
    : <Field label={label} value={value} />;
}

function RWSelect({ edit, label, value, onChange, options }) {
  return edit
    ? <SelectRow label={label} value={value} onChange={onChange} options={options} />
    : <Field label={label} value={value} />;
}

function RWTextArea({ edit, label, value, onChange, rows=3, required=false, placeholder }) {
  return edit
    ? <TextAreaRow label={label} value={value} onChange={onChange} rows={rows} required={required} placeholder={placeholder} />
    : <Field label={label} value={value} />;
}