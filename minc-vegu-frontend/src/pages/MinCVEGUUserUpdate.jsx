// src/pages/MinCVEGUUserUpdate.jsx  v1.5 (F43)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, UNSAFE_NavigationContext } from "react-router-dom";
import "../styles/MinCVeguDashboard.css";
import "../styles/MinCDashboard.css";
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";
import { FaArrowLeft, FaSearch } from "react-icons/fa";
import { CONFIG } from "../utils/config";
import UsePageTitle from "../utils/UsePageTitle";

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

function coerceUTC(input) {
  if (typeof input !== "string") return input;
  let s = input.trim();
  if (/ UTC$/i.test(s)) s = s.replace(/ UTC$/i, "Z");
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s = s + "Z";
  return s;
}

function formatTsTZ(input, tz) {
  if (input === null || input === undefined || input === "") return "—";
  try {
    const d = typeof input === "number" ? new Date(input * 1000) : new Date(coerceUTC(input));
    if (Number.isNaN(d.getTime())) return String(input);
    const parts = new Intl.DateTimeFormat(undefined, {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, timeZone: tz || undefined, timeZoneName: "short",
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ${get("timeZoneName")}`;
  } catch {
    return String(input);
  }
}
const formatLocalTs = (val, tz) => formatTsTZ(val, tz);

const formatNowLocal = () => {
  const parts = new Intl.DateTimeFormat(undefined, {
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",
    hour12:false,timeZoneName:"short"
  }).formatToParts(new Date());
  const get = (t) => parts.find(p=>p.type===t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ${get("timeZoneName")}`;
};

const formatDateToISO = (dateString) => {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d)) return dateString;
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
};

const getSessionUserLabel = () => {
  try {
    const raw = sessionStorage.getItem("mincUser");
    const u = raw ? JSON.parse(raw) : null;
    return (u?.displayName || u?.mincId || "MinC Admin");
  } catch { return "MinC Admin"; }
};

// ---------- constants ----------
const STATUS_OPTIONS = ["active","pending","suspended","under investigation","expired"];

// Only these are editable (admins); end-users edit their profile elsewhere
const EDITABLE_FIELDS = new Set([
  "status",        // dropdown
  "dob"            // yyyy-mm-dd (date only)
  // admin_notes handled specially; updated_at on BE
]);

// ---------- component ----------
export default function MinCVEGUUserUpdate() {
  UsePageTitle("MinC VEGU User Update");

  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchAbortRef = useRef(null);

  const [userDoc, setUserDoc] = useState(null);
  const [etag, setEtag] = useState("");
  const [error, setError] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(null);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);

  const pendingActionRef = useRef(null);

  // session guard
  useEffect(() => {
    const u = sessionStorage.getItem("mincUser");
    if (!u) nav("/login", { replace: true });
  }, [nav]);

  const isLikelyUserId = useMemo(() => /^VG\d{7,}$/i.test(query.trim()), [query]);

  // search typeahead
  useEffect(() => {
    const q = query.trim();
    setResults([]);
    if (!q || isLikelyUserId) return;

    const t = setTimeout(async () => {
      try {
        if (searchAbortRef.current) searchAbortRef.current.abort();
        const ctrl = new AbortController();
        searchAbortRef.current = ctrl;

        setSearching(true);
        const url = makeUrl(CONFIG.PATHS.VEGU_USERS_SEARCH, `?q=${encodeURIComponent(q)}`);
        const { res, json } = await debugFetch("vegu-users-search(typeahead)", url, { method: "GET", signal: ctrl.signal });
        if (!res.ok || json.success !== true) { setResults([]); return; }
        setResults(Array.isArray(json.items) ? json.items.slice(0, 10) : []);
      } catch (e) {
        if (e.name !== "AbortError") console.error(e);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, isLikelyUserId]);

  // unsaved changes guard
  function buildPatch() {
    if (!userDoc || !draft) return {};
    const p = {};
    for (const k of EDITABLE_FIELDS) {
      if (draft[k] !== userDoc[k]) p[k] = draft[k];
    }
    return p;
  }
  function hasUnsavedChanges() {
    const p = buildPatch();
    return Object.keys(p).length > 0;
  }
  const dirty = editMode && (hasUnsavedChanges() || Boolean(newNote.trim()));
  useBlockNavigation(dirty, (proceed) => {
    pendingActionRef.current = proceed;
    setShowDiscard(true);
  });

  useEffect(() => {
    const handler = (e) => {
      if (!editMode) return;
      if (!(hasUnsavedChanges() || newNote.trim())) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editMode, newNote, userDoc, draft]);

  const seedDraft = (doc) => setDraft(doc ? { ...doc } : null);

  const lookupById = async (id) => {
    setError("");
    setUserDoc(null);
    setEtag("");
    setLoading(true);
    try {
      const urlGet = makeUrl(`${CONFIG.PATHS.VEGU_USERS_GET}/${encodeURIComponent(id)}`);
      let { res, json } = await debugFetch("vegu-users-get", urlGet);
      if (res.ok && json?.success && json?.user) {
        const r = normalizeUser(json.user);
        setUserDoc(r);
        seedDraft(r);
        setEtag(json.etag || "");
        return;
      }
      // fallback: search and take first
      const urlSearch = makeUrl(CONFIG.PATHS.VEGU_USERS_SEARCH, `?q=${encodeURIComponent(id)}`);
      ({ res, json } = await debugFetch("vegu-users-search(fallback)", urlSearch));
      if (res.ok && json?.success && Array.isArray(json.items) && json.items.length) {
        const item = normalizeUser(json.items[0]);
        setUserDoc(item);
        seedDraft(item);
        setEtag(json.etag || "");
        return;
      }
      setError(json?.error || "User not found.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Network error during lookup.");
    } finally {
      setLoading(false);
    }
  };

  async function confirmOr(proceedFn) {
    const isDirty = hasUnsavedChanges() || Boolean(newNote.trim());
    if (!editMode || !isDirty) { proceedFn?.(); return true; }
    pendingActionRef.current = proceedFn;
    setShowDiscard(true);
    return false;
  }

  function useBlockNavigation(when, onAttempt) {
    const { navigator } = React.useContext(UNSAFE_NavigationContext);
    React.useEffect(() => {
      if (!when) return;
      if (!navigator || typeof navigator.block !== "function") return;
      const unblock = navigator.block((tx) => {
        onAttempt(() => { unblock(); tx.retry(); });
      });
      return unblock;
    }, [when, navigator, onAttempt]);
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError("");
    const q = query.trim();
    if (!q) { setError("Please enter a User ID/email/keywords."); return; }

    if (isLikelyUserId) {
      await confirmOr(() => lookupById(q));
      return;
    }

    // search if no typeahead present
    let list = results;
    if (!list || list.length === 0) {
      try {
        setSearching(true);
        const url = makeUrl(CONFIG.PATHS.VEGU_USERS_SEARCH, `?q=${encodeURIComponent(q)}`);
        const { res, json } = await debugFetch("vegu-users-search", url);
        if (res.ok && json.success === true) list = json.items || [];
      } catch (e) {
        console.error(e);
      } finally {
        setSearching(false);
      }
    }
    if (list && list.length > 0) {
      await confirmOr(() => lookupById(list[0].vg_id || list[0].id));
    } else {
      setError("No matches. Try different keywords or a full VG User ID.");
    }
  };

  const pickResult = async (r) => {
    await confirmOr(async () => {
      const id = r.vg_id || r.id;
      setQuery(id);
      await lookupById(id);
      setResults([]);
    });
  };

  const updateDraft = (k, v) => setDraft(d => ({ ...(d || {}), [k]: v }));

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
    patch.admin_notes = (userDoc.admin_notes ? `${userDoc.admin_notes}\n` : "") + stamp;

    // (dob is already yyyy-mm-dd; status is plain; BE will set updated_at)
    setSaving(true);
    try {
      const url = makeUrl(CONFIG.PATHS.VEGU_USERS_UPDATE);
      const { res, json } = await debugFetch("vegu-users-update", url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vg_id: userDoc.vg_id, etag, patch })
      });

      if (res.status === 409 && json?.error === "etag_mismatch") {
        setSaveError("This record was modified by someone else. Please refresh and retry.");
        if (json.etag) {
          await lookupById(userDoc.vg_id);
          setEditMode(true);
        }
        return;
      }

      if (!res.ok || !json?.success) {
        setSaveError(json?.error || `Save failed (${res.status}).`);
        return;
      }

      const r = normalizeUser(json.user);
      setUserDoc(r);
      seedDraft(r);
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

  const notesDesc = useMemo(() => {
    const s = userDoc?.admin_notes || "";
    return s.split("\n").map(t => t.trim()).filter(Boolean).reverse();
  }, [userDoc?.admin_notes]);

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
          onClick={() => confirmOr(() => nav("/vegu/users"))}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && confirmOr(() => nav("/vegu/users"))}
          aria-label="Back to Users Dashboard"
        >
          <FaArrowLeft className="minc-back-icon" />
          <div className="minc-back-label">Back</div>
        </div>

        <h1 className="vegu-title">Update User</h1>

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
              if (isLikelyUserId || results.length === 0) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
              else if (e.key === "Enter" && selectedIdx >= 0) { e.preventDefault(); pickResult(results[selectedIdx]); }
            }}
            placeholder="Enter User ID/email or keywords…"
            aria-label="User ID/email/keywords"
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
            <FaSearch /> {isLikelyUserId ? "Lookup" : "Search"}
          </button>

          {/* Typeahead */}
          {!isLikelyUserId && (results.length > 0 || searching) && (
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
                    {(r.first_name || r.firstName || "") + (r.last_name || r.lastName ? ` ${r.last_name || r.lastName}` : "") || r.email || "—"}
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
        {userDoc && (
          <div
            style={{
              maxWidth: 980,
              margin: "12px auto 0",
              background: editMode ? "#FFFDF1" : "#E8F4F9",
              border: `2px solid ${editMode ? "#f59e0b" : "#ffb300"}`,
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 6px 20px rgba(0,0,0,.08)",
            }}
          >

            {editMode && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                  background: "#FFF5DD",
                  border: "1px solid #f59e0b",
                  color: "#92400e",
                  padding: "8px 10px",
                  borderRadius: 10,
                  fontWeight: 700,
                }}
              >
                <span aria-hidden="true">🔒</span>
                Editing user (read-only fields are locked)
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px,1fr))", gap:12 }}>
              {/* identity / read-only */}
              <Field label="VG User ID" value={userDoc.vg_id} readOnly />
              <Field label="Email" value={userDoc.email} readOnly />
              <Field label="Phone" value={userDoc.phone} readOnly />
              <Field label="Timezone" value={userDoc.timezone} readOnly />

              {/* profile (read-only here per admin policy) */}
              <Field label="First Name" value={userDoc.first_name} readOnly />
              <Field label="Middle Name" value={userDoc.middle_name} readOnly />
              <Field label="Last Name" value={userDoc.last_name} readOnly />
              <Field label="Gender" value={userDoc.gender} readOnly />
              <Field label="Address1" value={userDoc.address1} readOnly />
              <Field label="Address2" value={userDoc.address2} readOnly />
              <Field label="City" value={userDoc.city} readOnly />
              <Field label="State" value={userDoc.state} readOnly />
              <Field label="Postal Code" value={userDoc.postal_code} readOnly />
              <Field label="Country" value={userDoc.country} readOnly />

              {/* institution (read-only) */}
              <Field label="Institution Name" value={userDoc.institution_name} readOnly />
              <Field label="Institution VG ID" value={userDoc.institution_vg_id} readOnly />
              <Field label="Complaint Email" value={userDoc.complaint_email} readOnly />

              {/* editable by admin */}
              <RWSelect
                edit={editMode}
                label="Status"
                value={draft?.status || ""}
                onChange={(v) => updateDraft("status", v)}
                options={STATUS_OPTIONS}
              />

<RWDate
  edit={editMode}
  label="Date of Birth"
  value={draft?.dob || userDoc.dob || ""}
  onChange={(v) => updateDraft("dob", v)}   // still "YYYY-MM-DD"
/>

              {/* times */}
              <Field label="Created At (UTC)" value={formatLocalTs(userDoc.created_at || userDoc.createdAt, "UTC")} readOnly />
              <Field label="Last Login" value={formatLocalTs(userDoc.last_login || userDoc.lastLogin, userDoc.timezone)} readOnly />
              <Field label="Updated At" value={formatLocalTs(userDoc.updated_at || userDoc.updatedAt, userDoc.timezone)} readOnly />
            </div>

            {/* Admin notes */}
            {!editMode && userDoc?.admin_notes && (
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
                  onClick={() => { setEditMode(true); seedDraft(userDoc); setSaveError(""); }}
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
                        seedDraft(userDoc);
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
                  seedDraft(userDoc);
                  setNewNote("");
                  setSaveError("");
                  const run = pendingActionRef.current;
                  pendingActionRef.current = null;
                  run && run();
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

function RWDate({ edit, label, value, onChange, tz }) {
  if (!edit) return <Field label={label} value={value || "—"} readOnly />;

  const iso = (s) => {
    if (!s) return "";
    const t = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    // try MM/DD/YYYY → YYYY-MM-DD
    const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (mdy) {
      const [, m, d, y] = mdy;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    // last resort parse
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return "";
    return [
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
      String(d.getUTCDate()).padStart(2, "0"),
    ].join("-");
  };

  const val = iso(value);
  const dateRef = React.useRef(null);

  const pick = () => {
    // open native calendar, sync back as ISO
    try {
      // ensure the hidden input has the current ISO value
      if (dateRef.current) {
        dateRef.current.value = val || "";
        // showPicker is supported on modern Chrome/Safari; harmless if missing
        dateRef.current.showPicker?.();
        dateRef.current.focus();
      }
    } catch {}
  };

  const commit = (next) => onChange(iso(next));

  return (
    <div style={{ background:"#fff", border:"1px solid #cbd5e1", borderRadius:10, padding:"10px 12px" }}>
      <div style={{ fontSize:12, color:"#475569", marginBottom:4 }}>{label}</div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:8, alignItems:"center" }}>
        {/* ISO text field the admin types into */}
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{4}-\d{2}-\d{2}"
          placeholder="YYYY-MM-DD"
          value={val}
          onChange={(e) => commit(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          style={{ width:"100%", border:"1px solid #cbd5e1", borderRadius:8, padding:"8px 10px",
                   fontFamily:"'Exo 2', sans-serif", letterSpacing:"0.02em" }}
          aria-label={`${label} in YYYY-MM-DD`}
        />

        {/* Calendar button */}
        <button
          type="button"
          onClick={pick}
          aria-label="Open calendar"
          className="btn"
          style={{ border:"1px solid #cbd5e1", background:"#fff", borderRadius:8, padding:"8px 10px" }}
        >
          🗓️
        </button>
      </div>

      {/* Hidden native date input used only to provide the calendar UI */}
      <input
        ref={dateRef}
        type="date"
        style={{ position:"absolute", opacity:0, pointerEvents:"none", width:0, height:0 }}
        onChange={(e) => commit(e.target.value)}   // gives YYYY-MM-DD
      />

      {tz && <div style={{ fontSize:11, color:"#64748b", marginTop:6 }}>({tz})</div>}
    </div>
  );
}

// normalize/canonicalize record into props used above
function normalizeUser(d = {}) {
  return {
    id: d.id || d.vg_id || "",
    vg_id: d.vg_id || d.id || "",
    first_name: d.first_name ?? d.firstName ?? "",
    middle_name: d.middle_name ?? d.middleName ?? "",
    last_name: d.last_name ?? d.lastName ?? "",
    dob: d.dob || "",
    gender: d.gender || "",
    address1: d.address1 || "",
    address2: d.address2 || "",
    city: d.city || "",
    state: d.state || "",
    postal_code: d.postal_code || "",
    country: d.country || "",
    country_code: d.country_code || "",
    email: d.email || "",
    phone: d.phone || "",
    emergency_contact: d.emergency_contact || d.emergencyContact || null,
    type: d.type || "user_profile",
    email_verified: d.email_verified ?? d.emailVerified ?? false,
    phone_verified: d.phone_verified ?? d.phoneVerified ?? false,
    status: d.status || "",
    plan_type: d.plan_type || d.planType || "",
    institution_name: d.institution_name || d.institutionName || "",
    complaint_email: d.complaint_email || d.complaintEmail || "",
    institution_vg_id: d.institution_vg_id || d.institutionVgId || "",
    timezone: d.timezone || "",
    created_at: d.created_at || d.createdAt || "",
    last_login: d.last_login || d.lastLogin || "",
    updated_at: d.updated_at || d.updatedAt || d._ts || null,
    admin_notes: d.admin_notes ?? d.adminNotes ?? "",
  };
}