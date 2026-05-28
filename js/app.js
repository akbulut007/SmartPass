const cfg = window.NFC_SUPABASE || window.QR_ACCESS_CONFIG || {};
const isConfigured = cfg.url && cfg.anonKey && !cfg.url.includes("YOUR_") && !cfg.anonKey.includes("YOUR_");
const db = isConfigured && window.supabase ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
const POLL_INTERVAL_MS = 1000;
const SESSION_DURATION_MS = 2 * 60 * 1000;
const DEFAULT_LOCATION = "Secure Login Approval";

const $ = (id) => document.getElementById(id);
const page = document.body.dataset.page;
let approvalPollTimer = null;
let countdownTimer = null;
let currentApprovalSession = null;
let currentApprovalCard = null;
let currentApprovalUrl = "";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindLogout();
  if (!isConfigured) showConfigWarning();

  if (page === "auth") return initAuth();
  if (page === "approve") return initMobileApproval();
  if (page === "scan") return initMobileApproval();

  const user = await requireSession();
  if (!user) return;
  setSessionInfo(user);

  if (page === "dashboard") return loadDashboard();
  if (page === "my-card") return loadMyCard(user);
  if (page === "users") return initUsers();
  if (page === "logs") return initLogs();
  if (page === "reports") return loadReports();
}

function showConfigWarning() {
  const el = document.createElement("div");
  el.className = "config-warning";
  el.textContent = "Supabase is not configured. Check js/supabase-config.js.";
  document.body.appendChild(el);
}

function bindLogout() {
  const btn = $("logoutBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    stopTimers();
    if (db) await db.auth.signOut();
    window.location.href = "index.html";
  });
}

function stopTimers() {
  if (approvalPollTimer) clearInterval(approvalPollTimer);
  if (countdownTimer) clearInterval(countdownTimer);
}

async function requireSession() {
  if (!db) {
    showPageError("Supabase client is not available. Check the Supabase CDN and config file.");
    return null;
  }
  const { data, error } = await db.auth.getSession();
  if (error) {
    showPageError(`Session error: ${error.message}`);
    return null;
  }
  const user = data.session?.user;
  if (!user) {
    window.location.href = "index.html";
    return null;
  }
  return user;
}

function setSessionInfo(user) {
  if ($("sessionInfo")) $("sessionInfo").textContent = user.email;
}

function initAuth() {
  db?.auth.getSession().then(({ data }) => {
    if (data.session?.user) window.location.href = "dashboard.html";
  });

  document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-auth-tab]").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
      btn.classList.add("active");
      $(`${btn.dataset.authTab}Form`)?.classList.add("active");
    });
  });

  $("loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");
    setMessage("authMessage", "Signing in...");
    const { error } = await db.auth.signInWithPassword({
      email: $("loginEmail").value.trim(),
      password: $("loginPassword").value
    });
    if (error) return setMessage("authMessage", error.message, "error");
    window.location.href = "dashboard.html";
  });

  $("signupForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");
    setMessage("authMessage", "Creating digital identity...");
    const fullName = $("signupName").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) return setMessage("authMessage", error.message, "error");
    if (data.user) await ensureUserCard(data.user, fullName);
    const { error: loginError } = await db.auth.signInWithPassword({ email, password });
    if (loginError) return setMessage("authMessage", "Account created. Disable email confirmation in Supabase Auth.", "error");
    window.location.href = "dashboard.html";
  });
}

async function ensureUserCard(user, suppliedName) {
  const { data: existing, error } = await db
    .from("users_cards")
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const fullName = suppliedName || user.user_metadata?.full_name || user.email.split("@")[0];
  const record = {
    user_id: user.id,
    email: user.email,
    full_name: fullName,
    uid: generateUid(),
    role: "student",
    status: "active"
  };
  const { data, error: insertError } = await db
    .from("users_cards")
    .insert(record)
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .single();
  if (insertError) throw insertError;
  return data;
}

async function loadMyCard(user) {
  setCardLoadingState("Preparing approval session...");
  try {
    const card = await ensureUserCard(user);
    renderIdentityCard(card);
    const session = await createApprovalSession(card);
    currentApprovalCard = card;
    currentApprovalSession = session;
    renderApprovalQr(session, card);
    bindSimulationControls();
    setApprovalState("waiting", "WAITING FOR MOBILE APPROVAL", "Scan the QR code with your phone and approve or reject this request.", "");
    startCountdown(session);
    startApprovalPolling(session.id);
  } catch (error) {
    const message = readableDbError(error);
    setCardErrorState(message);
    showPageError(message);
  }
}

function renderIdentityCard(card) {
  $("cardName").textContent = card.full_name;
  $("cardEmail").textContent = card.email;
  $("cardUid").textContent = card.uid;
  $("cardRole").textContent = title(card.role);
  $("cardStatus").textContent = title(card.status);
  $("cardStatusDetail").textContent = title(card.status);
}

async function createApprovalSession(card) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const record = {
    user_id: card.user_id,
    uid: card.uid,
    status: "waiting",
    expires_at: expiresAt,
    device: getDeviceLabel()
  };
  console.log("[SmartPass] Creating approval session", record);
  const { data, error } = await db
    .from("approval_sessions")
    .insert(record)
    .select("id,user_id,uid,status,created_at,expires_at,device,approved_at")
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("Session could not be created.");
  return data;
}

function renderApprovalQr(session, card) {
  if (!session?.id) throw new Error("Session could not be created.");
  const approvalUrl = buildApprovalUrl(session.id);
  console.log("[SmartPass] QR approval URL", approvalUrl);
  currentApprovalUrl = approvalUrl;
  $("approvalSessionId").textContent = session.id;
  $("approvalCreatedAt").textContent = formatDate(session.created_at);
  if ($("approvalDevice")) $("approvalDevice").textContent = session.device || "Desktop";
  $("qrImage").src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(approvalUrl)}`;
  $("qrImage").hidden = false;
  $("qrImage").alt = `QR approval link for ${card.full_name}`;
  $("qrLink").textContent = approvalUrl;
  if ($("approvalOpenLink")) {
    $("approvalOpenLink").hidden = false;
  }
}

function bindSimulationControls() {
  $("simulateApproveBtn")?.addEventListener("click", () => simulateDesktopDecision("approved"));
  $("simulateRejectBtn")?.addEventListener("click", () => simulateDesktopDecision("rejected"));
  $("approvalOpenLink")?.addEventListener("click", () => {
    if (!currentApprovalUrl) {
      showPageError("Approval page link is not ready yet.");
      return;
    }
    console.log("[SmartPass] Opening approval page", currentApprovalUrl);
    window.open(currentApprovalUrl, "_blank");
  });
}

async function simulateDesktopDecision(result) {
  if (!currentApprovalSession?.id) {
    showPageError("Session could not be created.");
    return;
  }
  disableSimulationButtons();
  const isApproved = result === "approved";
  console.log("[SmartPass] Desktop simulation started", { sessionId: currentApprovalSession.id, result });
  try {
    const update = {
      status: result,
      device: "Desktop Simulation",
      approved_at: new Date().toISOString()
    };
    const { data: updatedSession, error } = await db
      .from("approval_sessions")
      .update(update)
      .eq("id", currentApprovalSession.id)
      .select("id,status,uid,user_id,created_at,expires_at,device,approved_at")
      .single();
    if (error) throw error;
    if (updatedSession?.status !== result) throw new Error("Database update failed.");
    currentApprovalSession = updatedSession;
    await insertAccessLog(updatedSession, currentApprovalCard, result);
    stopTimers();
    if (isApproved) {
      setApprovalState("approved", "SUCCESS", "ACCESS APPROVED", "Mobile verification completed");
    } else {
      setApprovalState("rejected", "ACCESS DENIED", "Mobile verification rejected", "");
    }
    console.log("[SmartPass] Desktop simulation completed", { sessionId: updatedSession.id, result });
  } catch (error) {
    enableSimulationButtons();
    showPageError(readableDbError(error));
    console.error("[SmartPass] Desktop simulation failed", error);
  }
}

function disableSimulationButtons() {
  if ($("simulateApproveBtn")) $("simulateApproveBtn").disabled = true;
  if ($("simulateRejectBtn")) $("simulateRejectBtn").disabled = true;
}

function enableSimulationButtons() {
  if ($("simulateApproveBtn")) $("simulateApproveBtn").disabled = false;
  if ($("simulateRejectBtn")) $("simulateRejectBtn").disabled = false;
}

function startApprovalPolling(sessionId) {
  if (approvalPollTimer) clearInterval(approvalPollTimer);
  approvalPollTimer = setInterval(() => checkApprovalStatus(sessionId), POLL_INTERVAL_MS);
  checkApprovalStatus(sessionId);
}

async function checkApprovalStatus(sessionId) {
  try {
    const session = await fetchApprovalSession(sessionId);
    if (!session) throw new Error("Approval session was not found.");
    console.log("[SmartPass] Desktop poll", { sessionId, status: session.status });
    if (session.status === "waiting" && isExpired(session)) {
      await expireSession(session);
      setApprovalState("expired", "SESSION EXPIRED", "Mobile verification window has closed.", "");
      stopTimers();
      return;
    }
    if (session.status === "approved") {
      currentApprovalSession = session;
      setApprovalState("approved", "SUCCESS", "ACCESS APPROVED", "Mobile verification completed");
      stopTimers();
    } else if (session.status === "rejected") {
      currentApprovalSession = session;
      setApprovalState("rejected", "ACCESS DENIED", "Mobile verification rejected", "");
      stopTimers();
    } else if (session.status === "expired") {
      setApprovalState("expired", "SESSION EXPIRED", "Mobile verification window has closed.", "");
      stopTimers();
    } else {
      setApprovalState("waiting", "WAITING FOR MOBILE APPROVAL", "Desktop is polling Supabase every 1 second.", "");
    }
  } catch (error) {
    const message = readableDbError(error);
    setApprovalState("waiting", "WAITING FOR MOBILE APPROVAL", message, "");
    showPageError(message);
  }
}

function startCountdown(session) {
  if (countdownTimer) clearInterval(countdownTimer);
  const tick = () => {
    const remaining = Math.max(0, new Date(session.expires_at).getTime() - Date.now());
    if ($("sessionCountdown")) $("sessionCountdown").textContent = `Session expires in: ${formatDuration(remaining)}`;
    if (remaining <= 0) clearInterval(countdownTimer);
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

async function expireSession(session) {
  console.log("[SmartPass] Expiring session", session.id);
  const { error } = await db
    .from("approval_sessions")
    .update({ status: "expired" })
    .eq("id", session.id)
    .eq("status", "waiting");
  if (error) throw error;
  await insertAccessLog(session, null, "expired");
}

function setApprovalState(state, titleText, detailText, subdetailText = "") {
  const panel = $("approvalPanel");
  if (panel) panel.className = `approval-panel glass-panel ${state}`;
  if ($("approvalIcon")) {
    $("approvalIcon").className = `approval-icon ${state}`;
    $("approvalIcon").textContent = state === "approved" ? "OK" : state === "rejected" ? "NO" : state === "expired" ? "--" : "...";
  }
  if ($("approvalStatus")) $("approvalStatus").textContent = titleText;
  if ($("approvalDetail")) $("approvalDetail").textContent = detailText;
  if ($("approvalSubdetail")) $("approvalSubdetail").textContent = subdetailText;
  document.body.classList.toggle("access-approved", state === "approved");
  document.body.classList.toggle("access-denied", state === "rejected");
  document.body.classList.toggle("access-expired", state === "expired");
  if (state !== "waiting") document.body.classList.remove("access-waiting");
  if (state === "waiting") document.body.classList.add("access-waiting");
  if (["approved", "rejected", "expired"].includes(state)) disableSimulationButtons();
}

async function initMobileApproval() {
  const sessionId = new URLSearchParams(window.location.search).get("session");
  if (!sessionId) return setMobileApprovalState("rejected", "Missing session", "The QR approval link does not include a session ID.", "!");
  if (!db) return setMobileApprovalState("rejected", "Offline", "Supabase is not configured for this approval page.", "!");

  $("mobileSessionId").textContent = sessionId;
  $("mobileApproveBtn")?.addEventListener("click", () => completeMobileSession(sessionId, "approved"));
  $("mobileRejectBtn")?.addEventListener("click", () => completeMobileSession(sessionId, "rejected"));
  await loadMobileApprovalSession(sessionId);
}

async function loadMobileApprovalSession(sessionId) {
  try {
    const session = await fetchApprovalSession(sessionId);
    if (!session) {
      disableMobileButtons();
      return setMobileApprovalState("rejected", "Session not found", "This approval session is invalid or no longer available.", "!");
    }
    $("mobileSessionStatus").textContent = title(normalizeResult(session.status));
    if (session.status === "waiting" && isExpired(session)) {
      await expireSession(session);
      disableMobileButtons();
      return setMobileApprovalState("expired", "SESSION EXPIRED", "This approval request has expired.", "--");
    }
    if (session.status === "approved") {
      disableMobileButtons();
      return setMobileApprovalState("approved", "ACCESS CONFIRMED", "This login request has already been approved.", "OK");
    }
    if (session.status === "rejected") {
      disableMobileButtons();
      return setMobileApprovalState("rejected", "ACCESS DENIED", "This login request was rejected.", "NO");
    }
    if (session.status === "expired") {
      disableMobileButtons();
      return setMobileApprovalState("expired", "SESSION EXPIRED", "This approval request has expired.", "--");
    }
    setMobileApprovalState("waiting", "Waiting", "Approve or reject this secure login request.", "QR");
  } catch (error) {
    disableMobileButtons();
    setMobileApprovalState("rejected", "Load failed", readableDbError(error), "!");
  }
}

async function completeMobileSession(sessionId, result) {
  disableMobileButtons();
  setMobileApprovalState("waiting", "Confirming", "Updating the approval session in Supabase...", "...");
  try {
    const session = await fetchApprovalSession(sessionId);
    if (!session) throw new Error("Approval session was not found.");
    if (session.status !== "waiting") throw new Error(`Session is already ${session.status}.`);
    if (isExpired(session)) {
      await expireSession(session);
      return setMobileApprovalState("expired", "SESSION EXPIRED", "This approval request has expired.", "--");
    }
    const card = await fetchCardByUid(session.uid);
    const update = {
      status: result,
      device: getDeviceLabel(),
      approved_at: new Date().toISOString()
    };
    console.log("[SmartPass] Updating approval session", sessionId, update);
    const { data: updatedSession, error: updateError } = await db
      .from("approval_sessions")
      .update(update)
      .eq("id", sessionId)
      .select("id,status,uid,user_id,created_at,expires_at,device,approved_at")
      .single();
    if (updateError) throw updateError;
    if (updatedSession?.status !== result) throw new Error("Database update failed.");
    await insertAccessLog(updatedSession, card, result);
    if (result === "approved") {
      setMobileApprovalState("approved", "ACCESS CONFIRMED", "The desktop screen will turn green within 2 seconds.", "OK");
    } else {
      setMobileApprovalState("rejected", "ACCESS DENIED", "The desktop screen will show the rejected state within 2 seconds.", "NO");
    }
  } catch (error) {
    enableMobileButtons();
    setMobileApprovalState("rejected", "Approval failed", readableDbError(error), "!");
  }
}

function disableMobileButtons() {
  if ($("mobileApproveBtn")) $("mobileApproveBtn").disabled = true;
  if ($("mobileRejectBtn")) $("mobileRejectBtn").disabled = true;
}

function enableMobileButtons() {
  if ($("mobileApproveBtn")) $("mobileApproveBtn").disabled = false;
  if ($("mobileRejectBtn")) $("mobileRejectBtn").disabled = false;
}

function setMobileApprovalState(state, statusText, messageText, markText) {
  const panel = document.querySelector(".approve-panel");
  if (panel) panel.className = `approve-panel glass-panel ${state}`;
  if ($("mobileSessionStatus")) $("mobileSessionStatus").textContent = statusText;
  if ($("mobileApprovalMessage")) $("mobileApprovalMessage").textContent = messageText;
  if ($("approveStatusMark")) $("approveStatusMark").textContent = markText;
}

async function insertAccessLog(session, card, result) {
  const row = {
    uid: session.uid,
    card_uid: session.uid,
    email: card?.email || null,
    result,
    device: getDeviceLabel(),
    location: DEFAULT_LOCATION
  };
  console.log("[SmartPass] Inserting access log", row);
  const { error } = await db.from("access_logs").insert(row);
  if (error) throw error;
}

async function loadDashboard() {
  const [cards, sessions, logs] = await safeDataLoad(() => Promise.all([fetchCards(), fetchSessions(), fetchLogs()]), [[], [], []]);
  const counts = countStatuses(sessions);
  setText("totalUsers", cards.length);
  setText("activeIdentities", cards.filter((card) => card.status === "active").length);
  setText("pendingApprovals", counts.waiting);
  setText("approvedSessions", counts.approved);
  setText("rejectedSessions", counts.rejected);
  setText("expiredSessions", counts.expired);
  setText("approvedLogins", counts.approved);
  setText("deniedLogins", counts.rejected);
  setText("activeSessions", counts.waiting);
  renderLatestApproval(logs[0]);
  renderRecentApprovals(logs.slice(0, 8));
}

function renderLatestApproval(latest) {
  if (!$("latestAuth")) return;
  $("latestAuth").innerHTML = latest ? `
    <div class="event-card ${normalizeResult(latest.result)}">
      <strong>${escapeHtml(String(latest.result).toUpperCase())}</strong>
      <span>${escapeHtml(latest.email || "Unknown user")} via ${escapeHtml(latest.device || "Unknown device")}</span>
      <small>${escapeHtml(latest.uid || latest.card_uid || "-")} - ${escapeHtml(latest.location || DEFAULT_LOCATION)} - ${formatDate(latest.created_at)}</small>
    </div>` : "No approval logs yet.";
}

function renderRecentApprovals(logs) {
  const target = $("recentApprovals");
  if (!target) return;
  target.innerHTML = logs.map((log) => {
    const result = normalizeResult(log.result);
    return `
      <div class="mini-event ${result}">
        <span class="status-dot ${dotClass(result)}"></span>
        <div>
          <strong>${escapeHtml(log.email || "Unknown")}</strong>
          <small>${escapeHtml(log.uid || log.card_uid || "-")} - ${formatDate(log.created_at)}</small>
        </div>
        <b>${escapeHtml(result.toUpperCase())}</b>
      </div>`;
  }).join("") || `<p>No recent activity.</p>`;
}

function initUsers() {
  $("generateUidBtn")?.addEventListener("click", () => $("newUid").value = generateUid());
  $("refreshUsersBtn")?.addEventListener("click", loadUsersTable);
  $("usersTable")?.addEventListener("change", updateCardFromTable);
  if ($("newUid")) $("newUid").value = generateUid();
  $("addUserForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const record = {
      user_id: null,
      full_name: $("newFullName").value.trim(),
      email: $("newEmail").value.trim(),
      uid: $("newUid").value.trim(),
      role: $("newRole").value,
      status: $("newStatus").value
    };
    const { error } = await db.from("users_cards").insert(record);
    if (error) return setMessage("userFormMessage", readableDbError(error), "error");
    event.target.reset();
    $("newUid").value = generateUid();
    setMessage("userFormMessage", "Digital identity saved.");
    loadUsersTable();
  });
  loadUsersTable();
}

async function loadUsersTable() {
  const cards = await safeDataLoad(fetchCards, []);
  $("usersTable").innerHTML = cards.map((card) => `
    <tr>
      <td>${escapeHtml(card.full_name)}</td>
      <td>${escapeHtml(card.email)}</td>
      <td>${escapeHtml(card.uid)}</td>
      <td><select class="table-select" data-card-id="${card.id}" data-field="role">${["student", "employee", "admin", "guest"].map((role) => `<option value="${role}" ${role === card.role ? "selected" : ""}>${title(role)}</option>`).join("")}</select></td>
      <td><select class="table-select ${card.status}" data-card-id="${card.id}" data-field="status">${["active", "blocked", "expired"].map((status) => `<option value="${status}" ${status === card.status ? "selected" : ""}>${title(status)}</option>`).join("")}</select></td>
      <td>${formatDate(card.created_at)}</td>
    </tr>`).join("") || `<tr><td colspan="6">No digital identities found.</td></tr>`;
}

async function updateCardFromTable(event) {
  const select = event.target.closest("[data-card-id]");
  if (!select) return;
  const { cardId, field } = select.dataset;
  const { error } = await db.from("users_cards").update({ [field]: select.value }).eq("id", cardId);
  if (error) return showPageError(readableDbError(error));
  select.className = `table-select ${select.value}`;
}

function initLogs() {
  $("refreshLogsBtn")?.addEventListener("click", loadLogsTable);
  loadLogsTable();
}

async function loadLogsTable() {
  const logs = await safeDataLoad(fetchLogs, []);
  $("logsTable").innerHTML = logs.map((log) => {
    const result = normalizeResult(log.result);
    return `
      <tr>
        <td>${formatDate(log.created_at)}</td>
        <td>${escapeHtml(log.email || "-")}</td>
        <td>${escapeHtml(log.uid || log.card_uid || "-")}</td>
        <td><span class="badge ${result}">${escapeHtml(result.toUpperCase())}</span></td>
        <td>${escapeHtml(log.device || "Unknown")}</td>
        <td>${escapeHtml(log.location || DEFAULT_LOCATION)}</td>
      </tr>`;
  }).join("") || `<tr><td colspan="6">No logs found.</td></tr>`;
}

async function loadReports() {
  const [cards, sessions] = await safeDataLoad(() => Promise.all([fetchCards(), fetchSessions()]), [[], []]);
  const counts = countStatuses(sessions);
  const active = cards.filter((card) => card.status === "active").length;
  const totalFinished = counts.approved + counts.rejected + counts.expired;
  setText("reportApproved", counts.approved);
  setText("reportRejected", counts.rejected);
  setText("reportExpired", counts.expired);
  setText("reportActive", active);
  setText("reportGrantRate", totalFinished ? `${Math.round((counts.approved / totalFinished) * 100)}%` : "0%");
  setBar("approvedBar", "approvedBarText", counts.approved, totalFinished || 1);
  setBar("rejectedBar", "rejectedBarText", counts.rejected, totalFinished || 1);
  setBar("expiredBar", "expiredBarText", counts.expired, totalFinished || 1);
  setBar("activeBar", "activeBarText", active, cards.length || 1);
}

async function fetchApprovalSession(sessionId) {
  const { data, error } = await db
    .from("approval_sessions")
    .select("id,user_id,uid,status,created_at,expires_at,device,approved_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchCardByUid(uid) {
  const { data, error } = await db
    .from("users_cards")
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .eq("uid", uid)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchCards() {
  const { data, error } = await db
    .from("users_cards")
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchSessions() {
  const { data, error } = await db
    .from("approval_sessions")
    .select("id,user_id,uid,status,created_at,expires_at,device,approved_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

async function fetchLogs() {
  const { data, error } = await db
    .from("access_logs")
    .select("id,uid,card_uid,email,result,device,location,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

function buildApprovalUrl(sessionId) {
  return `${getApproveBaseUrl()}?session=${encodeURIComponent(sessionId)}`;
}

function getApproveBaseUrl() {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    const path = window.location.pathname.replace(/[^/]*$/, "approve.html");
    return `${window.location.origin}${path}`;
  }
  return "approve.html";
}

function isExpired(session) {
  return Boolean(session.expires_at && new Date(session.expires_at).getTime() <= Date.now());
}

function countStatuses(sessions) {
  return sessions.reduce((acc, session) => {
    const status = normalizeResult(session.status);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { waiting: 0, approved: 0, rejected: 0, expired: 0 });
}

function normalizeResult(result) {
  const value = String(result || "").toLowerCase();
  if (value === "denied") return "rejected";
  if (value === "granted") return "approved";
  return value;
}

function getDeviceLabel() {
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "iPhone";
  if (/android/i.test(ua)) return "Android";
  if (/windows|macintosh|linux/i.test(ua)) return "Desktop";
  return "Unknown";
}

function generateUid() {
  const part = crypto.getRandomValues(new Uint32Array(1))[0].toString(16).toUpperCase().padStart(8, "0").slice(0, 8);
  return `QR-${part}`;
}

function setCardLoadingState(text) {
  $("cardStatus").textContent = text;
  $("cardName").textContent = "Loading...";
  $("cardEmail").textContent = "Checking Supabase session and digital identity registry";
  $("cardUid").textContent = "-";
  $("cardRole").textContent = "-";
  $("cardStatusDetail").textContent = "-";
  $("qrLink").textContent = "QR will appear after the approval session is created.";
  $("qrImage").hidden = true;
  if ($("approvalOpenLink")) $("approvalOpenLink").hidden = true;
  if ($("sessionCountdown")) $("sessionCountdown").textContent = "Session expires in: --:--";
}

function setCardErrorState(message) {
  $("cardStatus").textContent = "Error";
  $("cardName").textContent = "Identity unavailable";
  $("cardEmail").textContent = message;
  $("cardUid").textContent = "Check database";
  $("cardRole").textContent = "-";
  $("cardStatusDetail").textContent = "-";
  $("qrLink").textContent = "QR cannot be generated until the identity record is available.";
  $("qrImage").hidden = true;
  if ($("approvalOpenLink")) $("approvalOpenLink").hidden = true;
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
