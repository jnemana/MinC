// src/pages/MinCMainDashboard.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import MMSLogo from "../assets/MMS_Logo.png";
import VEGULogo from "../assets/VEGU_Logo.png";
import "../styles/MinCDashboard.css";

export default function MinCMainDashboard() {
  const nav = useNavigate();
  const [showDialog, setShowDialog] = useState(false);

  return (
    <div className="minc-page">
      <div>
        <h1 className="minc-title">MinC Main Dashboard</h1>

        <div className="minc-brand-grid">
          {/* MMS Card */}
          <div
            className="minc-brand-card"
            onClick={() => setShowDialog(true)}
            aria-label="Open MMS (coming soon)"
          >
            <img src={MMSLogo} alt="MMS" className="minc-brand-logo" />
          </div>

          {/* VEGU Card */}
          <div
            className="minc-brand-card"
            onClick={() => nav("/minc-vegu-dashboard")}
            aria-label="Open VEGU"
          >
            <img src={VEGULogo} alt="VEGU" className="minc-brand-logo" />
          </div>
        </div>
      </div>

      {/* Simple modal for MMS */}
      {showDialog && (
        <div className="minc-modal-backdrop" onClick={() => setShowDialog(false)}>
          <div className="minc-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Heads up</h3>
            <p>This feature is coming soon.</p>
            <button onClick={() => setShowDialog(false)}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}