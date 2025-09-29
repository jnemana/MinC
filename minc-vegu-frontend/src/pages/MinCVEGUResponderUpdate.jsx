// src/pages/MinCVEGUResponderUpdate.jsx  v1.4
// - No Logout on this screen
// - Search by Responder VG ID or keywords (name, email, phone)
// - Uses (to-be-wired) endpoints:
//     GET  /api/vegu-responders/{id}
//     GET  /api/vegu-responders-search?q=<text>

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

// local time → readable
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

export default function MinCVEGUResponderUpdate() {
  const nav = useNavigate();

  // session guard
  useEffect(() => {
    const u = sessionStorage.getItem("mincUser");
    if (!u) nav("/login", { replace: true });
  }, [nav]);

  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);

  const [qText, setQText] = useState("");
  const [responder, setResponder] = useState(null);
  const [error, setError] = useState("");

  // typeahead
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchAbortRef = useRef(null);

  const isLikelyId = useMemo(() => /^VG\d{5,}$/.test(qText.trim()), [qText]);

  // --- search as you type for keywords (not for full-id) ---
  useEffect(() => {
    const q = qText.trim();
    setResults([]);
    if (!q || isLikelyId) return;

    const t = setTimeout(async () => {
      try {
        if (searchAbortRef.current) searchAbortRef.current.abort();
        const ctrl = new AbortController();
        searchAbortRef.current = ctrl;

        setSearching(true);
        const url = makeUrl(CONFIG.PATHS.RESP_SEARCH, `?q=${encodeURIComponent(q)}`);
        const { res, json } = await debugFetch("responders-search(typeahead)", url, { method: "GET", signal: ctrl.signal });
        if (!res.ok || json.success !== true) { setResults([]); return; }
        // Expect: { success:true, items:[{ vg_id, first_name, last_name, email, phone, institution_id, institution_name, ... }] }
        setResults(Array.isArray(json.items) ? json.items.slice(0, 10) : []);
      } catch (e) {
        if (e.name !== "AbortError") console.error(e);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [qText, isLikelyId]);

  const lookupById = async (id) => {
    setError("");
    setResponder(null);
    setLoading(true);
    try {
      const urlGet = makeUrl(`${CONFIG.PATHS.RESP_GET}/${encodeURIComponent(id)}`);
      let { res, json } = await debugFetch("responders-get", urlGet);
      if (res.ok && json && json.success && json.responder) {
        setResponder(json.responder);
        return;
      }
      // fallback: search by q=id and pick first match
      const urlSearch = makeUrl(CONFIG.PATHS.RESP_SEARCH, `?q=${encodeURIComponent(id)}`);
      ({ res, json } = await debugFetch("responders-search(fallback)", urlSearch));
      if (res.ok && json && json.success && Array.isArray(json.items) && json.items.length) {
        setResponder(json.items[0]);
        return;
      }
      setError((json && json.error) || "Responder not found.");
    } catch (e) {
      console.error(e);
      setError(e.message || "Network error during lookup.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError("");
    const q = qText.trim();
    if (!q) { setError("Please enter a Responder ID or keywords."); return; }

    if (isLikelyId) { await lookupById(q); return; }

    // if no live typeahead results, perform a one-shot search
    let list = results;
    if (!list || list.length === 0) {
      try {
        setSearching(true);
        const url = makeUrl(CONFIG.PATHS.RESP_SEARCH, `?q=${encodeURIComponent(q)}`);
        const { res, json } = await debugFetch("responders-search", url);
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
    setQText(id);
    await lookupById(id);
    setResults([]);
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
          onClick={() => nav("/vegu/responders")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/vegu/responders")}
          aria-label="Back to Responders Dashboard"
        >
          <FaArrowLeft className="minc-back-icon" />
          <div className="minc-back-label">Back</div>
        </div>

        <h1 className="vegu-title">Update Responder</h1>

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
            value={qText}
            onChange={(e) => { setQText(e.target.value); setSelectedIdx(-1); }}
            onKeyDown={(e) => {
              if (isLikelyId || results.length === 0) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter" && selectedIdx >= 0) { e.preventDefault(); pickResult(results[selectedIdx]); }
            }}
            placeholder="Enter Responder ID (e.g., VG25001234) or keywords…"
            aria-label="Responder ID or search keywords"
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
                  <span style={{ opacity: 0.85 }}>🧑‍💼</span>
                  <span style={{ color: "#1B5228", fontWeight: 700 }}>
                    {(r.first_name || r.firstName || "—") + " " + (r.last_name || r.lastName || "")}
                    <span style={{ color: "#64748b", fontWeight: 500 }}>
                      {" "}— {r.email || r.primary_email || "—"} {r.phone ? `(${r.phone})` : ""}
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

        {/* Result (read-only preview for now) */}
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))",
                gap: 12,
              }}
            >
              <Field label="VG ID" value={responder.vg_id} />
              <Field label="First Name" value={responder.first_name || responder.firstName} />
              <Field label="Middle Name" value={responder.middle_name || responder.middleName} />
              <Field label="Last Name" value={responder.last_name || responder.lastName} />
              <Field label="Email" value={responder.email || responder.primary_email} />
              <Field label="Phone" value={responder.phone} />
              <Field label="Department" value={responder.department} />
              <Field label="Country" value={responder.country} />
              <Field label="Institution ID" value={responder.institution_id} />
              <Field label="Institution Name" value={responder.institution_name} />
              <Field label="City" value={responder.city} />
              <Field label="State" value={responder.state} />
              <Field label="Updated At" value={formatLocalTs(responder.updated_at ?? responder._ts)} />
            </div>

            <div style={{ textAlign: "right", marginTop: 12 }}>
              <button
                type="button"
                className="btn"
                onClick={() => alert("Edit form will be added next.")}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "2px solid #F1663D",
                  background: "#F5EE1F",
                  color: "#1B5228",
                  fontWeight: 800,
                }}
              >
                Edit…
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        padding: "10px 12px",
        minHeight: 52,
      }}
    >
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#1B5228", fontWeight: 700, wordBreak: "break-word" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}