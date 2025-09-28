// src/pages/MinCVeguDashboard.jsx v1.3

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/MinCVeguDashboard.css";
import "../styles/MinCDashboard.css";                  // reuse modal styles
import instLogo from "../assets/minc-workplaces.png";
import userLogo from "../assets/minc-users.png";
import responderLogo from "../assets/minc-responders.png";
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";
import { FaArrowLeft, FaSignOutAlt } from "react-icons/fa";

export default function MinCVeguDashboard() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // guard: if no session, bounce to login
  useEffect(() => {
    const u = sessionStorage.getItem("mincUser");
    if (!u) nav("/login", { replace: true });
  }, [nav]);

  const go = (path) => {
    setLoading(true);
    setTimeout(() => nav(path), 150);
  };

  const kpis = [
    { key: "institutions", label: "Institutions", count: "—", onClick: () => go("/vegu/institutions"), icon: <img src={instLogo} alt="Institutions" /> },
    { key: "users",        label: "Users",        count: "—", onClick: () => go("/vegu/users"),        icon: <img src={userLogo} alt="Users" /> },
    { key: "complaints",   label: "Complaints",   count: "—", onClick: () => go("/vegu/complaints"),
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 3h20v14H6l-4 4zM7 8h10M7 12h7"/>
        </svg>
      ) },
    { key: "responders",   label: "Responders",   count: "—", onClick: () => go("/vegu/responders"),   icon: <img src={responderLogo} alt="Responders" /> },
  ];

  return (
    <div className="vegu-page">
      <MinCSpinnerOverlay open={loading} />

      <div className="vegu-card">
        {/* 🔴 Back (inside card, top-left) */}
        <div
          className="minc-back-container"
          role="button"
          tabIndex={0}
          onClick={() => nav("/dashboard", { replace: true })}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/dashboard", { replace: true })}
          aria-label="Back to MinC Main Dashboard"
        >
          <FaArrowLeft className="minc-back-icon" />
          <div className="minc-back-label">Back</div>
        </div>

        {/* 🔴 Logout (inside card, top-right) */}
        <div
          className="minc-logout-container"
          role="button"
          tabIndex={0}
          onClick={() => setShowLogoutModal(true)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShowLogoutModal(true)}
          aria-label="Logout"
        >
          <FaSignOutAlt className="minc-logout-icon" />
          <div className="minc-logout-label">Logout</div>
        </div>

        <h1 className="vegu-title">MinC VEGU Main Dashboard</h1>

        <div className="vegu-kpi-grid">
          {kpis.map(({ key, label, count, onClick, icon }) => (
            <button key={key} className="vegu-kpi" onClick={onClick} aria-label={`Open ${label}`}>
              <div className="vegu-kpi-icon">{icon}</div>
              <div className="vegu-kpi-meta">
                <div className="vegu-kpi-count">{count}</div>
                <div className="vegu-kpi-label">{label}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Confirm Logout modal (reuses .minc-modal styles) */}
      {showLogoutModal && (
        <div className="minc-modal-backdrop" onClick={() => setShowLogoutModal(false)}>
          <div
            className="minc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="logout-modal-title" className="minc-modal-title">Confirm Logout</h3>
            <p className="minc-modal-text">Are you sure you want to logout?</p>
            <div className="minc-modal-actions">
              <button
                className="btn btn-danger"
                onClick={() => {
                  sessionStorage.clear();
                  setLoading(true);
                  nav("/login", { replace: true });
                }}
              >
                Yes, Logout
              </button>
              <button className="btn btn-secondary" onClick={() => setShowLogoutModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}