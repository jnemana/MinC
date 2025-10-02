// MinCVEGURevealUser.jsx  v1.7 

import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/MinCVeguDashboard.css";
import "../styles/MinCDashboard.css";
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";
import { FaArrowLeft, FaSearch } from "react-icons/fa";
import UsePageTitle from "../utils/UsePageTitle";
import { CONFIG } from "../utils/config";

const makeUrl = (path, tail = "") => {
  const base = CONFIG.API_BASE || "";
  const key  = CONFIG.API_KEY;
  const sep  = tail.includes("?") ? "&" : "?";
  const withKey = key ? `${tail}${sep}code=${encodeURIComponent(key)}` : tail || "";
  const url = `${base}${path}${withKey}`;
  console.debug("[MinC] calling:", url);
  return url;
};

const debugFetch = async (label, url, init = {}) => {
  console.log(`➡️ ${label} REQ`, url, init);
  const res = await fetch(url, init);
  const text = await res.text();
  console.log(`⬅️ ${label} RESP ${res.status}`, text);
  let json; try { json = JSON.parse(text); } catch { json = { parseError: true, text }; }
  return { res, json };
};

export default function MinCVEGURevealUser() {
  UsePageTitle("Reveal User");

  const nav = useNavigate();
  const { vg_id } = useParams();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState(null); // { complaint_vg_id, user_vg_id }
  const [input, setInput] = useState(vg_id || "");
  const inputRef = useRef(null);

  // Normalize helper
  const normalizeId = (s) => (s || "").toUpperCase().replace(/\s+/g, "");

  // Deep-link: if vg_id param present, auto-run once
  useEffect(() => {
    if (vg_id) {
      setInput(vg_id);
      void onReveal(); // fire and forget
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vg_id]);

  const onReveal = async (e) => {
    e?.preventDefault?.();
    setErr("");
    setInfo(null);

    const raw = inputRef.current ? inputRef.current.value : input;
    const id  = normalizeId(raw);

    if (!id) {
      setErr("Please enter a Complaint VG-ID.");
      return;
    }

    // Optional: soft client hint if the pattern *looks* wrong, but DO NOT BLOCK.
    // Classic complaint ids are VG25C + 7 digits. We just warn visually.
    const looksComplaint = /^VG\d+[A-Z]?\d*$/i.test(id); // permissive
    if (!looksComplaint) {
      // Show banner but continue; BE will return 404 if truly wrong.
      setErr("Please enter a valid Complaint VG-ID (e.g., VG25C0001141). We’ll still try your input.");
    }

    try {
      setLoading(true);
      const url = makeUrl(`${CONFIG.PATHS.VEGU_REVEAL_USER}/${encodeURIComponent(id)}`);
      const { res, json } = await debugFetch("vegu-reveal-user", url);

      if (!res.ok || json?.success !== true) {
        const msg = json?.error || `Lookup failed (${res.status})`;
        setErr(msg);
        setInfo(null);
        return;
      }

      setInfo({ complaint_vg_id: json.complaint_vg_id, user_vg_id: json.user_vg_id });
    } catch (e2) {
      console.error(e2);
      setErr(e2.message || "Reveal failed.");
    } finally {
      setLoading(false);
    }
  };

  const goUser = () => {
    if (info?.user_vg_id) {
      nav(`/vegu/users/update/${encodeURIComponent(info.user_vg_id)}`);
    }
  };

  return (
    <div className="vegu-page">
      <MinCSpinnerOverlay open={loading} />

      <div className="vegu-card">
        {/* Back to Complaints Actions */}
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

        <h1 className="vegu-title">Reveal User</h1>

        <form
          onSubmit={onReveal}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
            maxWidth: 900,
            margin: "0 auto 16px",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter Complaint VG-ID (e.g., VG25C0001141)…"
            aria-label="Complaint VG-ID"
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              border: "2px solid #94a3b8",
              fontFamily: "'Exo 2', sans-serif",
              fontSize: "1.05rem",
            }}
          />
          <button
            type="submit"
            className="btn"
            style={{
              padding: "14px 20px",
              borderRadius: 14,
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
            <FaSearch /> Reveal
          </button>
        </form>

        {/* Non-blocking hint/error */}
        {err && (
          <div
            role="alert"
            style={{
              maxWidth: 980, margin: "0 auto 12px",
              background:"#fff6f6", border:"2px solid #f3b8b8",
              color:"#7a1d1d", borderRadius:12, padding:"12px 14px",
              fontFamily:"'Exo 2', sans-serif"
            }}
          >
            {err}
          </div>
        )}

        {/* Result card */}
        {info && (
          <div
            style={{
              maxWidth: 980, margin: "0 auto",
              background:"#f9f9f9", border:"2px solid #1B5228",
              borderRadius:12, padding:16
            }}
          >
            <div style={{ textAlign:"center", marginBottom:12 }}>
              <div style={{ color:"#234a39", fontFamily:"Orbitron, sans-serif" }}>
                Complaint ID: <b>{info.complaint_vg_id}</b>
              </div>
              <div style={{ marginTop:8, fontSize:18 }}>
                Revealed User ID:{" "}
                <b style={{ color:"#1B5228" }}>{info.user_vg_id || "—"}</b>
              </div>
            </div>

            <div style={{ textAlign:"center" }}>
              <button
                className="btn"

                onClick={() => {
    if (info?.user_vg_id) {
      nav(`/vegu/users/update/${encodeURIComponent(info.user_vg_id)}`);
    }
  }}

                disabled={!info.user_vg_id}

                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "2px solid #1B5228",
                  background: info.user_vg_id ? "#e2f7ea" : "#e5e7eb",
                  color: "#1B5228",
                  fontWeight: 700,
                  cursor: info.user_vg_id ? "pointer" : "not-allowed"
                }}
              >
                Update the User
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}