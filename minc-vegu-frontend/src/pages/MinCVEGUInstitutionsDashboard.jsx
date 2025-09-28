// src/pages/MinCVEGUInstitutionsDashboard.jsx  v1.3 (slim actions)

// MinC → VEGU → Institutions (landing page with slim action cards)
// Routes:
//   • /vegu/institutions              (this page)
//   • /vegu/institutions/update       (next step page — to be implemented)

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/MinCVeguDashboard.css";  // grid + slim actions + back/logout
import "../styles/MinCDashboard.css";      // modal styles
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";
import { FaArrowLeft, FaSignOutAlt } from "react-icons/fa";
import instLogo from "../assets/minc-workplaces.png";

export default function MinCVeguInstitutionsDashboard() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // session guard
  useEffect(() => {
    const u = sessionStorage.getItem("mincUser");
    if (!u) nav("/login", { replace: true });
  }, [nav]);

  const go = (path) => {
    setLoading(true);
    setTimeout(() => nav(path), 150);
  };

  return (
    <div className="vegu-page">
      <MinCSpinnerOverlay open={loading} />

      <div className="vegu-card">
        {/* Back (inside card, top-left) */}
<div
  className="minc-back-container"
  role="button"
  tabIndex={0}
  onClick={() => nav("/minc-vegu-dashboard")}
  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/minc-vegu-dashboard")}
  aria-label="Back to MinC VEGU Main Dashboard"
>
  <FaArrowLeft className="minc-back-icon" />
  <div className="minc-back-label">Back</div>
</div>

        {/* Logout (inside card, top-right) */}
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

        <h1 className="vegu-title">Institutions Actions</h1>

        {/* Slim action cards */}
<div className="minc-menu-list">
  <button
    className="minc-menu-item"
    onClick={() => go("/vegu/institutions/update")}
    aria-label="Update Institution"
  >
    <span className="minc-menu-icon">🏢</span>
    <span className="minc-menu-label">Update Institution</span>
  </button>
</div>
      </div>

      {/* Confirm Logout modal */}
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