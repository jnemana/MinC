import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/MinCGlobal.css";
import "../styles/MinCSpinner.css";
import mincLogo from '../assets/minc-logo.png';
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";

function MinCLandingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Welcome to MinC Portal";
  }, []);

  const goLogin = (e) => {
    e.preventDefault();
    setLoading(true);
    navigate("/login");
  };

  return (
    <>
      <MinCSpinnerOverlay open={loading} />
      <div className="landing-wrap">
        <div className="landing-card">
          <img src={mincLogo} alt="MinC Logo" className="landing-logo" />
          <div className="btn-row">
            <a href="/login" onClick={goLogin} className="btn btn-primary">LOGIN</a>
            <a href="/contact" className="btn btn-ghost">Contact Support</a>
          </div>
        </div>
      </div>
    </>
  );
}

export default MinCLandingPage;