const PUBLIC_BASE_URL = "https://nfc11.netlify.app";
const APPROVE_BASE_URL = `${PUBLIC_BASE_URL}/approve.html`;
const POLL_INTERVAL_MS = 3000;
const SESSION_DURATION_MS = 2 * 60 * 1000;
const DEFAULT_LOCATION = "Secure Login Approval";

const $ = (id) => document.getElementById(id);

function showConfigWarning() {
  const el = document.createElement("div");
  el.className = "config-warning";
  el.textContent = "Supabase is not configured. Check js/config.js.";
  document.body.appendChild(el);
}

function stopTimers() {
  if (typeof approvalPollTimer !== "undefined" && approvalPollTimer) {
    clearInterval(approvalPollTimer);
    approvalPollTimer = null;
  }
  if (typeof countdownTimer !== "undefined" && countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (typeof isApprovalPollingActive !== "undefined") isApprovalPollingActive = false;
  if (typeof isApprovalPollInFlight !== "undefined") isApprovalPollInFlight = false;
}

function getDeviceLabel() {
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "iPhone";
  if (/android/i.test(ua)) return "Android";
  if (/windows|macintosh|linux/i.test(ua)) return "Desktop";
  return "Unknown";
}

function detectDevice() {
  return getDeviceLabel();
}

function generateUid() {
  const part = crypto.getRandomValues(new Uint32Array(1))[0].toString(16).toUpperCase().padStart(8, "0").slice(0, 8);
  return `QR-${part}`;
}

function generateUID() {
  return generateUid();
}

function setMessage(id, text, type = "success") {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = `form-message ${type}`;
}

function setText(id, value) {
  if ($(id)) $(id).textContent = value;
}

function setBar(id, textId, value, max) {
  if (!$(id) || !$(textId)) return;
  $(id).style.width = `${Math.max(4, Math.round((value / max) * 100))}%`;
  $(textId).textContent = value;
}

async function safeDataLoad(loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    showPageError(readableDbError(error));
    return fallback;
  }
}

function showToast(message, type = "success") {
  showPageError(message);
  const el = $("pageError");
  if (el) el.classList.add(type);
}

function showPageError(message) {
  const existing = $("pageError");
  const el = existing || document.createElement("div");
  el.id = "pageError";
  el.className = "page-error";
  el.textContent = message;
  if (!existing) {
    const main = document.querySelector(".app-main, .approve-shell, .auth-shell") || document.body;
    main.prepend(el);
  }
}

function readableDbError(error) {
  const raw = error?.message || String(error || "Unknown error");
  if (raw.includes("relation") && raw.includes("does not exist")) return "Supabase table is missing. Run supabase-schema.sql in the Supabase SQL Editor.";
  if (raw.includes("row-level security") || raw.includes("violates row-level security")) return "Supabase RLS policy blocked this operation. Run the policies in supabase-schema.sql.";
  if (raw.includes("permission denied")) return "Supabase permission denied. Check users_cards, approval_sessions, and access_logs policies.";
  return raw;
}

function dotClass(result) {
  if (result === "approved") return "online";
  if (result === "rejected") return "danger";
  if (result === "expired") return "neutral";
  return "warning";
}

function formatDuration(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function title(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (match) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[match]));
}
