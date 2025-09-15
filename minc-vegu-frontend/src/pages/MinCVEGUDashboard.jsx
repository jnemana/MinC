// src/pages/MinCVeguDashboard.jsx v1.2

import React, { useState } from "react";       
import { useNavigate } from "react-router-dom";
import "../styles/MinCVeguDashboard.css";
import instLogo from "../assets/minc-workplaces.png";
import userLogo from "../assets/minc-users.png";
import responderLogo from "../assets/minc-responders.png";
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";   // ← add

export default function MinCVeguDashboard() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);   

  // Tiny helper so we can show spinner (and later prefetch)
  const go = (path) => {
    setLoading(true);
    setTimeout(() => nav(path), 150);            
  };

  const kpis = [
    { key: "institutions", label: "Institutions", count: "—", onClick: () => go("/vegu/institutions"),
      icon: <img src={instLogo} alt="Institutions" /> },
    { key: "users",        label: "Users",        count: "—", onClick: () => go("/vegu/users"),
      icon: <img src={userLogo} alt="Users" /> },
    { key: "complaints",   label: "Complaints",   count: "—", onClick: () => go("/vegu/complaints"),
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 3h20v14H6l-4 4zM7 8h10M7 12h7"/>
        </svg>
      ) },
    { key: "responders",   label: "Responders",   count: "—", onClick: () => go("/vegu/responders"),
      icon: <img src={responderLogo} alt="Responders" /> },
  ];

  return (
    <div className="vegu-page">
      <MinCSpinnerOverlay open={loading} />     

      <div className="vegu-card">
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
    </div>
  );
}