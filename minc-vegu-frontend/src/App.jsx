import React from "react";
import "./styles/Landing.css";

function App() {
  return (
    <div className="landing-wrap">
      <div className="landing-card">
        {/* Use your MinC logo here */}
        <img src="/minc-logo.png" alt="MinC Logo" className="landing-logo" />

        <h1 className="landing-title">MinC</h1>
        <p className="landing-subtitle">
          Administrative & Business Control Panel
        </p>

        <div className="btn-row">
          <a href="/login" className="btn btn-primary">Login</a>
          <a href="/register" className="btn btn-secondary">Register</a>
          <a href="/contact" className="btn btn-ghost">Contact</a>
        </div>

        <p className="powered">Powered by Mihir Mobile Solutions</p>
      </div>
    </div>
  );
}

export default App;