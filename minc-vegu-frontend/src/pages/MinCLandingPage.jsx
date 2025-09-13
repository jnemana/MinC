import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
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

  const goLogin = () => {
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
            <Link to="/login" onClick={goLogin} className="btn btn-primary" role="button">
              LOGIN
            </Link>
            <Link to="/contact" className="btn btn-ghost" role="button">
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default MinCLandingPage;