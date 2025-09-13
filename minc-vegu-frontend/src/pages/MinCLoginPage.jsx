// src/pages/MinCLoginPage.jsx
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/MinCGlobal.css";
import { CONFIG } from "../utils/config";
import MinCSpinnerOverlay from "../components/MinCSpinnerOverlay";
import UsePageTitle from "../utils/UsePageTitle";

// --- Strict identifier validation (case-insensitive) ---
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

const formatLockoutLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZoneName: "short"
  }).formatToParts(d);
  const get = (t) => (parts.find(p => p.type === t)?.value || "");
  const tz = get("timeZoneName");
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ${tz}`;
};

export default function MinCLoginPage() {
  UsePageTitle("MinC Portal Login");
  const navigate = useNavigate();

  // UI / flow
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // data
  const [identifier, setIdentifier] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [user, setUser] = useState(null);
  const [password, setPassword] = useState("");

  // OTP step
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // prefill remembered ID
  useEffect(() => {
    const saved = localStorage.getItem("mincRememberedIdentifier");
    if (saved) {
      setIdentifier(saved);
      setRememberMe(true);
    }
  }, []);

  // resend countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // helper: read error payloads consistently
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

  // STEP 1 — validate identifier exists; don’t show password if not found
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
        body: JSON.stringify({ identifier: c.normalized })
      });

      if (res.status === 404) { setError("MinC user not found."); return; }
      if (res.status === 403) {
        const j = await readErr(res);
        const untilIso = j.lockoutUntil || j.lockout_until;
        const until = untilIso ? ` until ${formatLockoutLocal(untilIso)}` : "";
        setError(`Account locked${until}`);
        return;
      }
      if (!res.ok) {
        const j = await readErr(res);
        setError(j.error || "Login init failed.");
        return;
      }

      const data = await res.json();
      setUser({
        mincId: data.mincId,
        email: data.email,
        failedAttempts: data.failedLoginCount ?? 0,
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

const safeJson = async (res) => {
  const text = await res.text();
  try { return { json: JSON.parse(text), text }; }
  catch { return { json: null, text }; }
};

const handleSubmitPassword = async (e) => {
  e.preventDefault();
  setError("");
  setLoading(true);

  try {
    // 1) Verify password
    const passUrl =
      `${CONFIG.API_BASE}${CONFIG.PATHS.PASS}` +
      (CONFIG.API_KEY ? `?code=${encodeURIComponent(CONFIG.API_KEY)}` : "");

    const idForCheck = user?.mincId || user?.email || identifier.trim();

    const res = await fetch(passUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: idForCheck, password }),
    });

    // handle known statuses
    if (res.status === 403) {
      const j = await readErr(res);
      const untilIso = j.lockoutUntil || j.lockout_until;
      const until = untilIso ? ` until ${formatLockoutLocal(untilIso)}` : "";
      setError(`Account locked${until}`);
      setStep(1);
      return;
    }
    if (res.status === 401) {
      const j = await readErr(res);
      const left = typeof j.attemptsLeft === "number" ? j.attemptsLeft : j.attempts_left;
      setError(
        typeof left === "number"
          ? `Incorrect password. You have ${left} more attempt${left === 1 ? "" : "s"} before lockout.`
          : (j.error || "Incorrect password.")
      );
      return;
    }
    if (res.status === 404) { setError("MinC user not found."); return; }
    if (!res.ok) {
      const j = await readErr(res);
      setError(j.error || "Error verifying password.");
      return;
    }

    // password OK; keep any refreshed user props if BE returned them
    // (no hard requirement; this is defensive)
    const { json: passJson } = await safeJson(res);
    if (passJson && passJson.email && (!user || !user.email)) {
      setUser((u) => ({ ...(u || {}), email: passJson.email }));
    }

    // 2) Send OTP
    const emailToUse = (user && user.email) || (classifyIdentifier(identifier).kind === "email" ? classifyIdentifier(identifier).normalized : null);
    if (!emailToUse) {
      setError("No email on file for OTP.");
      return;
    }

    const sendUrl =
      `${CONFIG.API_BASE}${CONFIG.PATHS.OTP_SEND}` +
      (CONFIG.API_KEY ? `?code=${encodeURIComponent(CONFIG.API_KEY)}` : "");

    console.debug("[MinC] OTP send →", sendUrl, "email:", emailToUse);

    const otpRes = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailToUse, context: "minc_login" }),
    });

    const { json: otpJson, text: otpRaw } = await safeJson(otpRes);
    console.debug("[MinC] OTP response raw:", otpRaw, "parsed:", otpJson);

    if (!otpRes.ok || !otpJson || otpJson.success !== true) {
      setError((otpJson && otpJson.error) || "Failed to send OTP.");
      return;
    }

    setResendCooldown(30);
    setStep(3);
  } catch (err) {
    console.error("[MinC] Passwd/OTP error", err);
    // keep this specific; it fires only on thrown network/JS errors
    setError("Error verifying password.");
  } finally {
    setLoading(false);
  }
};

  // STEP 3 — verify OTP and finalize login
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const url =
        `${CONFIG.API_BASE}${CONFIG.PATHS.OTP_VERIFY}` +
        (CONFIG.API_KEY ? `?code=${encodeURIComponent(CONFIG.API_KEY)}` : "");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, otp, context: "minc_login" }),
      });

      if (!res.ok) {
        const j = await readErr(res);
        setError(j.error || "OTP verification failed.");
        return;
      }

      // Success — keep the minimal session (same as before)
      sessionStorage.setItem("mincUser", JSON.stringify(user));
      navigate("/dashboard");
    } catch (err) {
      console.error("[MinC] OTP verify error", err);
      setError("Error verifying OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setLoading(true);
    try {
      const url =
        `${CONFIG.API_BASE}${CONFIG.PATHS.OTP_SEND}` +
        (CONFIG.API_KEY ? `?code=${encodeURIComponent(CONFIG.API_KEY)}` : "");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, context: "minc_login" }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        setError(j.error || "Failed to resend OTP.");
        return;
      }
      setResendCooldown(30);
    } catch (err) {
      console.error(err);
      setError("Failed to resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Full-screen spinner overlay (your component) */}
      <MinCSpinnerOverlay open={loading} />

      <div className="page-wrap">
        <div className="auth-card">
          <h1 className="auth-title">MinC Portal Login</h1>
          <p className="auth-sub">Sign in with your MINC ID (no spaces) or Email*</p>

          {error && (
            <div className="alert-error" role="alert" aria-live="assertive" id="login-error">
              {error}
            </div>
          )}

          {step === 1 && (
            <form className="auth-form" onSubmit={handleSubmitIdentifier}>
              <label className="label-lg" htmlFor="login-identifier">User ID*</label>
              <input
                id="login-identifier"
                name="identifier"
                className="input-lg"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby={error ? "login-error" : undefined}
              />

              <div className="row-between" style={{ marginTop: 4 }}>
                <label className="remember" htmlFor="remember-me">
                  <input
                    id="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Remember Me
                </label>

                <Link to="/reset-password" className="link-underline">
                  Forgot/Reset Password?
                </Link>
              </div>

              <button className="btn btn-primary btn-xl" disabled={loading}>
                {loading ? "Checking..." : "Continue"}
              </button>
            </form>
          )}

          {step === 2 && (
            <form className="auth-form" onSubmit={handleSubmitPassword}>
              <label className="label-lg" htmlFor="login-password">Password*</label>
              <input
                id="login-password"
                name="password"
                className="input-lg"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Your password"
                autoFocus
                autoComplete="current-password"
                aria-describedby={error ? "login-error" : undefined}
              />
              <button className="btn btn-primary btn-xl" disabled={loading}>
                {loading ? "Verifying..." : "NEXT"}
              </button>

              <div style={{ textAlign: "center", marginTop: 10 }}>
                <Link to="/login" className="link-underline">
                  Use a different account
                </Link>
              </div>
            </form>
          )}

          {step === 3 && (
            <form className="auth-form" onSubmit={handleVerifyOtp} style={{ textAlign: "center" }}>
              <div style={{ marginBottom: 8 }}>
                Enter the 5-digit OTP sent to <b>{user?.email}</b>
              </div>
              <input
                id="login-otp"
                name="otp"
                className="input-lg"
                type="text"
                maxLength={5}
                value={otp}
                onChange={(e) => {
                  const v = (e.target.value || "").replace(/[^0-9]/g, "").slice(0, 5);
                  setOtp(v);
                }}
                required
                placeholder="Email OTP"
                autoFocus
                inputMode="numeric"
                pattern="[0-9]{5}"
                autoComplete="one-time-code"
                aria-describedby={error ? "login-error" : undefined}
              />
              <div style={{ textAlign: "right", fontSize: 12, marginTop: 4 }}>
                {otp.length}/5
              </div>

              <button className="btn btn-primary btn-xl" disabled={loading}>
                {loading ? "Checking..." : "Verify OTP"}
              </button>

              {resendCooldown > 0 ? (
                <small style={{ display: "block", marginTop: 8 }}>Resend in {resendCooldown}s</small>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  className="link-underline"
                  style={{ marginTop: 8, background: "none", border: "none" }}
                >
                  Resend OTP
                </button>
              )}
            </form>
          )}

          <div style={{ textAlign: "center", marginTop: 14 }}>
            <Link to="/" className="link-ghost">
              Back to Landing
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}