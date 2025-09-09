// Prefer env vars; fall back to local defaults for dev
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:7071";
const API_KEY  = import.meta.env.VITE_API_KEY  ?? "";             // Azure Function key
const OTP_FIXED = import.meta.env.VITE_OTP_FIXED ?? "";           // e.g. "12345" for QA only
const SESSION_TIMEOUT_MS = Number(import.meta.env.VITE_SESSION_TIMEOUT_MS ?? 900_000);

// Switch these as needed
export const BASE_URL = "http://localhost:7071";
export const REACT_FUNCTION_KEY = ""; // when running local; set for Azure App if needed

// Messaging & timeouts
export const LOCKOUT_SUPPORT_TEXT = "Contact MinC Support.";
export const REQUEST_TIMEOUT_MS = 20000;

export const CONFIG = {
  API_BASE,
  API_KEY,
  OTP_FIXED,
  SESSION_TIMEOUT_MS,
  ALLOWED_EMAIL_DOMAINS: ["mihirmobile.com", "vegu.me"],
  PATHS: {
    INIT: "/api/minc-login-init",
    PASS: "/api/minc-login-password",
    OTP_SEND: "/api/send-email-otp",
    OTP_VERIFY: "/api/verify-email-otp",
  }
};
