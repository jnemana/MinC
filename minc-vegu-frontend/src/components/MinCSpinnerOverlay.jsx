// src/components/MinCSpinnerOverlay.jsx
import React from "react";
import "../styles/MinCSpinner.css";
import MinCIcon from "../assets/MinC_Icon.png";

export default function MinCSpinnerOverlay({
  open = false,
  pane = false,              // false = fullscreen, true = pane-level
  alt = "Loading MinC…",
}) {
  if (!open) return null;
  const cls = pane ? "minc-pane-overlay" : "minc-spinner-overlay";
  return (
    <div className={cls} role="alert" aria-busy="true" aria-live="polite">
      <img src={MinCIcon} alt={alt} className="minc-spinner__icon" />
    </div>
  );
}