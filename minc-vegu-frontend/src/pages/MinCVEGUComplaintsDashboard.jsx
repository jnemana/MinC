// src/pages/MinCVEGUComplaintsDashboard.jsx 1.6

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/MinCVeguDashboard.css";
import "../styles/MinCDashboard.css";
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";
import { FaArrowLeft, FaSearch } from "react-icons/fa";
import { CONFIG } from "../utils/config";
import UsePageTitle from "../utils/UsePageTitle";

// --- shared helpers (same style as Users) ---
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

export default function MinCVEGUComplaintsDashboard() {
  UsePageTitle("MinC Complaints");

  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  // search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [searching, setSearching] = useState(false);
  const searchAbortRef = useRef(null);
  const [error, setError] = useState("");

  // guard session
  useEffect(() => {
    const u = sessionStorage.getItem("mincUser");
    if (!u) nav("/login", { replace: true });
  }, [nav]);

  const looksLikeComplaintId = useMemo(() => /^VG\d+C\d{6,}$/i.test(query.trim()), [query]);

  // typeahead search (same cadence as Users)
  useEffect(() => {
    const q = query.trim();
    setResults([]);
    setError("");
    if (!q || looksLikeComplaintId) return;

    const t = setTimeout(async () => {
      try {
        if (searchAbortRef.current) searchAbortRef.current.abort();
        const ctrl = new AbortController();
        searchAbortRef.current = ctrl;

        setSearching(true);
        const url = makeUrl(CONFIG.PATHS.VEGU_COMPLAINTS_SEARCH, `?q=${encodeURIComponent(q)}`);
        const { res, json } = await debugFetch("vegu-complaints-search(typeahead)", url, { method: "GET", signal: ctrl.signal });
        if (!res.ok || json.success !== true) { setResults([]); return; }
        // keep it short like Users
        setResults(Array.isArray(json.items) ? json.items.slice(0, 10) : []);
      } catch (e) {
        if (e.name !== "AbortError") console.error(e);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, looksLikeComplaintId]);

  const goTo = (vgId) => nav(`/vegu/complaints/${encodeURIComponent(vgId)}`);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError("");
    const q = query.trim();
    if (!q) { setError("Enter complaint ID or keywords."); return; }

    if (looksLikeComplaintId) {
      setLoading(true);
      goTo(q);
      setLoading(false);
      return;
    }

    // use existing results, else fetch now
    let list = results;
    if (!list || list.length === 0) {
      try {
        setSearching(true);
        const url = makeUrl(CONFIG.PATHS.VEGU_COMPLAINTS_SEARCH, `?q=${encodeURIComponent(q)}`);
        const { res, json } = await debugFetch("vegu-complaints-search(form)", url);
        if (res.ok && json.success === true) list = json.items || [];
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }
    if (list && list.length > 0) {
      goTo(list[0].vg_id || list[0].id);
    } else {
      setError("No matches. Try different keywords or a full VG Complaint ID.");
    }
  };

  return (
    <div className="vegu-page">
      <MinCSpinnerOverlay open={loading} />

      <div className="vegu-card">
        {/* Back */}
        <div
          className="minc-back-container"
          role="button"
          tabIndex={0}
          onClick={() => nav("/vegu")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/vegu")}
          aria-label="Back to VEGU dashboard"
        >
          <FaArrowLeft className="minc-back-icon" />
          <div className="minc-back-label">Back</div>
        </div>

        <h1 className="vegu-title">Complaints</h1>

        {/* Search */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid", gridTemplateColumns: "1fr auto", gap: 10,
            maxWidth: 720, margin: "12px auto 6px", position: "relative",
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(-1); }}
            onKeyDown={(e) => {
              if (looksLikeComplaintId || results.length === 0) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
              else if (e.key === "Enter" && selectedIdx >= 0) { e.preventDefault(); goTo(results[selectedIdx].vg_id || results[selectedIdx].id); }
            }}
            placeholder="Complaint ID / institution / subject / message keywords…"
            aria-label="Complaint search"
            autoFocus
            style={{
              padding: "12px 14px", borderRadius: 12, border: "2px solid #9aa5b1",
              fontFamily: "'Exo 2', sans-serif", fontSize: "1rem",
            }}
          />
          <button
            type="submit"
            className="btn"
            style={{
              padding: "12px 18px", borderRadius: 12, border: "2px solid #F1663D",
              background: "#F5EE1F", color: "#1B5228", fontWeight: 800,
              display: "grid", gridAutoFlow: "column", alignItems: "center", gap: 8,
            }}
          >
            <FaSearch /> {looksLikeComplaintId ? "Lookup" : "Search"}
          </button>

          {/* Typeahead list */}
          {!looksLikeComplaintId && (results.length > 0 || searching) && (
            <div
              role="listbox"
              style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                background: "white", border: "2px solid #cbd5e1", borderRadius: 12,
                marginTop: 6, boxShadow: "0 10px 28px rgba(0,0,0,.12)", maxHeight: 320, overflowY: "auto",
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
                  onClick={() => goTo(r.vg_id || r.id)}
                  aria-selected={idx === selectedIdx}
                  style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10,
                    width: "100%", textAlign: "left", padding: "10px 12px", border: 0, cursor: "pointer",
                    background: idx === selectedIdx ? "#fffef2" : "transparent"
                  }}
                >
                  <span aria-hidden="true">🧾</span>
                  <span style={{ color: "#1B5228", fontWeight: 700 }}>
                    {(r.display_subject || r.subject || "—")}
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

        {error && (
          <div
            role="alert"
            style={{
              maxWidth: 720, margin: "0 auto 12px", background: "#fff6f6",
              border: "2px solid #f3b8b8", color: "#7a1d1d", borderRadius: 12, padding: "10px 12px",
              fontFamily: "'Exo 2', sans-serif",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}