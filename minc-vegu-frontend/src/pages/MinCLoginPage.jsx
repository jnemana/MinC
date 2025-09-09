// src/pages/MinCLoginPage.jsx
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/MinCGlobal.css";
import { CONFIG } from "../utils/config";

// Local validators (match BE)
const MINC_RE = /^(MM\d{2}[A-Z]\d{5})$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function classifyIdentifier(raw) {
  const s = (raw || "").trim();
  if (!s) return { kind: "empty" };
  if (MINC_RE.test(s)) return { kind: "minc", normalized: s.toUpperCase() };
  if (EMAIL_RE.test(s)) {
    const lower = s.toLowerCase();
    const dom = lower.split("@").pop();
    if ((CONFIG.ALLOWED_EMAIL_DOMAINS || []).includes(dom)) {
      return { kind: "email", normalized: lower };
    }
    return { kind: "email-disallowed" };
  }
  return { kind: "invalid" };
}

export default function MinCLoginPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [identifier, setIdentifier] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [user, setUser] = useState(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("mincRememberedIdentifier");
    if (saved) {
      setIdentifier(saved);
      setRememberMe(true);
    }
  }, []);

  const readErr = async (res) => {
    const ct = res.headers.get("content-type") || "";
    try {
      if (ct.includes("application/json")) return await res.json();
      const text = await res.text();
      return { error: text || "Unexpected error." };
    } catch {
      return { error: "Unexpected error." };
    }
  };

const formatLockoutLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  // Example: 2025-09-09 17:18:58 CDT
  const parts = new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZoneName: "short"
  }).formatToParts(d);

  const get = (t) => (parts.find(p => p.type === t)?.value || "");
  const tz = get("timeZoneName");
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ${tz}`;
};

  const handleSubmitIdentifier = async (e) => {
    e.preventDefault();
    setError("");

    const c = classifyIdentifier(identifier);
    if (c.kind === "empty" || c.kind === "invalid") {
      setError("Enter a valid MINC ID or Email address.");
      return;
    }
    if (c.kind === "email-disallowed") {
      setError("Invalid User ID");
      return;
    }

    setLoading(true);
    try {
      const url =
        `${CONFIG.API_BASE}${CONFIG.PATHS.INIT}` +
        (CONFIG.API_KEY ? `?code=${encodeURIComponent(CONFIG.API_KEY)}` : "");

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: c.normalized }),
      });

      if (res.status === 404) { setError("MinC user not found."); return; }

      if (res.status === 403) {
  const j = await readErr(res);
  const reason = (j.reason || "").toLowerCase();
  if (reason === "locked" || j.lockoutUntil) {
    const until = j.lockoutUntil ? ` until ${formatLockoutLocal(j.lockoutUntil)}` : "";
    setError(`Account locked${until}`);
  } else {
    setError(j.error || "Account is not active. Contact MinC Support.");
  }
  return;
}

      if (!res.ok) {
        const j = await readErr(res);
        setError(j.error || "Login init failed.");
        return;
      }

      const data = await res.json();
      setUser({
        mincId: data.minc_id,
        email: data.email,
        failedAttempts: data.failed_attempts ?? 0,
        lockoutUntil: data.lockoutUntil ?? null,
      });

      if (rememberMe) {
        localStorage.setItem("mincRememberedIdentifier", identifier.trim());
      } else {
        localStorage.removeItem("mincRememberedIdentifier");
      }

      setStep(2);
    } catch (err) {
      console.error("[MinC] init error", err);
      setError("Server error during sign-in.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPassword = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const url =
        `${CONFIG.API_BASE}${CONFIG.PATHS.PASS}` +
        (CONFIG.API_KEY ? `?code=${encodeURIComponent(CONFIG.API_KEY)}` : "");

      const idForCheck = user?.mincId || user?.email || identifier.trim();

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: idForCheck, password }),
      });

if (res.status === 403) {
  const j = await readErr(res);
  const reason = (j.reason || "").toLowerCase();
  if (reason === "locked" || j.lockoutUntil) {
    const until = j.lockoutUntil ? ` until ${formatLockoutLocal(j.lockoutUntil)}` : "";
    setError(`Account locked${until}`);
    setStep(1);
  } else {
    setError(j.error || "Account is not active. Contact MinC Support.");
    setStep(1); // or keep at step 1 already
  }
  return;
}

if (res.status === 401) {
  const j = await readErr(res);
  const left = typeof j.attemptsLeft === "number" ? j.attemptsLeft : j.attempts_left;
  if (typeof left === "number") {
    setError(`Incorrect password. You have ${left} more attempt${left === 1 ? "" : "s"} before lockout.`);
  } else {
    setError(j.error || "Incorrect password.");
  }
  return;
}

      if (res.status === 404) { setError("MinC user not found."); return; }
      if (!res.ok) {
        const j = await readErr(res);
        setError(j.error || "Error verifying password.");
        return;
      }

      sessionStorage.setItem("mincUser", JSON.stringify(user));
      navigate("/dashboard");
    } catch (err) {
      console.error("[MinC] Passwd error", err);
      setError("Error verifying password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrap">
      <div className="auth-card">
        <h1 className="auth-title">MinC Portal Login</h1>
        <p className="auth-sub">Sign in with your MINC ID (no spaces) or Email*</p>

        {error && <div className="alert-error">{error}</div>}

        {step === 1 && (
          <form className="auth-form" onSubmit={handleSubmitIdentifier}>
            <label className="label-lg">User ID*</label>
            <input
              className="input-lg"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoFocus
            />
            <div className="row-between" style={{ marginTop: 4 }}>
              <label className="remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember Me
              </label>
              <Link to="/reset-password" className="link-underline">Forgot/Reset Password?</Link>
            </div>
            <button className="btn btn-primary btn-xl" disabled={loading}>
              {loading ? "Checking..." : "Continue"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form className="auth-form" onSubmit={handleSubmitPassword}>
            <label className="label-lg">Password*</label>
            <input
              className="input-lg"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Your password"
              autoFocus
            />
            <button className="btn btn-primary btn-xl" disabled={loading}>
              {loading ? "Verifying..." : "Continue"}
            </button>
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <Link to="/login" className="link-underline">Use a different account</Link>
            </div>
          </form>
        )}

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <Link to="/" className="link-ghost">Back to Landing</Link>
        </div>
      </div>
    </div>
  );
}