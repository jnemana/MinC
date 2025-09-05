import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Landing.css";
import mincLogo from '../assets/minc-logo.png';

function MinCLandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-wrap">
      <div className="landing-card">
          <img src={mincLogo} alt="MinC Logo" className="landing-logo" />
        <div className="btn-row">
          <a href="/login" className="btn btn-primary">LOGIN</a>
          <a href="/contact" className="btn btn-ghost">Contact Support</a>
        </div>
      </div>
    </div>
  );
}

export default MinCLandingPage;