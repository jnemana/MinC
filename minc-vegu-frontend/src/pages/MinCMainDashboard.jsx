// src/pages/MinCMainDashboard.jsx v1.1

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaSignOutAlt } from "react-icons/fa";
import MMSLogo from "../assets/MMS_Logo.png";
import VEGULogo from "../assets/VEGU_Logo.png";
import "../styles/MinCDashboard.css";

export default function MinCMainDashboard() {
  const nav = useNavigate();
  const [showDialog, setShowDialog] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const rawUser = sessionStorage.getItem("mincUser");
  const user = rawUser ? JSON.parse(rawUser) : null;

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  return (
    <div className="minc-page">
      <div className="minc-dashboard-card">

        {/* Logout button (top-right) */}
        <div
          className="logout-container"
          role="button"
          tabIndex={0}
          onClick={handleLogout}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") && handleLogout()
          }
          aria-label="Logout"
        >
          <FaSignOutAlt className="logout-button" title="Logout" />
          <div className="logout-label">Logout</div>
        </div>

        <h1 className="minc-title">MinC Dashboard</h1>

        {user && (
          <div className="minc-user-info">
            <div className="minc-user-name">{user.displayName}</div>
            <div className="minc-user-roles">
              {(user.roles || []).join(", ")}
            </div>
          </div>
        )}

        <div className="minc-brand-grid">
          <div
            className="minc-brand-card"
            onClick={() => setShowDialog(true)}
            aria-label="Open MMS (coming soon)"
          >
            <img src={MMSLogo} alt="MMS" className="minc-brand-logo" />
          </div>
          <div
            className="minc-brand-card"
            onClick={() => nav("/minc-vegu-dashboard")}
            aria-label="Open VEGU"
          >
            <img src={VEGULogo} alt="VEGU" className="minc-brand-logo" />
          </div>
        </div>
      </div>

      {/* Logout Modal */}
      {showLogoutModal && (
        <div className="minc-modal-backdrop" onClick={() => setShowLogoutModal(false)}>
          <div
            className="minc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="logout-modal-title" className="minc-modal-title">
              Confirm Logout
            </h3>
            <p className="minc-modal-text">Are you sure you want to logout?</p>
            <div className="minc-modal-actions">
              <button
                className="btn btn-danger"
                onClick={() => {
                  sessionStorage.clear();
                  nav("/login", { replace: true });
                }}
              >
                Yes, Logout
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MMS Coming Soon Modal */}
      {showDialog && (
        <div
          className="minc-modal-backdrop"
          onClick={() => setShowDialog(false)}
        >
          <div
            className="minc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mms-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="mms-modal-title" className="minc-modal-title">
              Heads up
            </h3>
            <p className="minc-modal-text">This feature is coming soon.</p>
            <div className="minc-modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => setShowDialog(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}