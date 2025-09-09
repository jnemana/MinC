// src/utils/authValidators.js
import { CONFIG } from "./config";

const MINC_RE  = /^(MM\d{2}[A-Z]\d{5})$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function classifyIdentifier(raw) {
  const s = (raw || "").trim();
  if (!s) return { kind: "empty" };

  if (MINC_RE.test(s)) {
    return { kind: "minc", normalized: s.toUpperCase() };
  }

  if (EMAIL_RE.test(s)) {
    const lower = s.toLowerCase();
    const dom = lower.split("@").pop();
    const allowed = new Set(CONFIG.ALLOWED_EMAIL_DOMAINS || []);
    return allowed.has(dom)
      ? { kind: "email", normalized: lower }
      : { kind: "email-disallowed" };
  }

  return { kind: "invalid" };
}
