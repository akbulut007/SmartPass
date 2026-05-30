var approvalPollTimer = null;
var countdownTimer = null;
var currentApprovalSession = null;
var currentApprovalCard = null;
var currentApprovalUrl = "";
var isApprovalPollingActive = false;
var isApprovalPollInFlight = false;

function initMyIdentity(user) {
  return loadMyCard(user);
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
    setApprovalState("waiting", "WAITING FOR APPROVAL", "", "");
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

function bindSimulationControls() {
  $("simulateApproveBtn")?.addEventListener("click", () => simulateDesktopDecision("approved"));
  $("simulateRejectBtn")?.addEventListener("click", () => simulateDesktopDecision("rejected"));
  $("approvalOpenLink")?.addEventListener("click", openApprovalPage);
  $("qrImage")?.addEventListener("click", openApprovalPage);
  $("qrImage")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openApprovalPage();
    }
  });
}

async function simulateDesktopDecision(result) {
  if (!currentApprovalSession?.id) {
    showPageError("Session could not be created.");
    return;
  }
  disableSimulationButtons();
  const isApproved = result === "approved";
  try {
    const update = {
      status: result,
      device: "Desktop Simulation",
      approved_at: new Date().toISOString()
    };
    const updatedSession = await updateApprovalSession(currentApprovalSession.id, update);
    if (updatedSession?.status !== result) throw new Error("Database update failed.");
    currentApprovalSession = updatedSession;
    await insertAccessLog(updatedSession, currentApprovalCard, result, isApproved ? "simulate_approval" : "simulate_reject");
    stopTimers();
    if (isApproved) {
      setApprovalState("approved", "SUCCESS", "ACCESS APPROVED", "Mobile verification completed");
    } else {
      setApprovalState("rejected", "ACCESS DENIED", "", "");
    }
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
  if (document.body.dataset.page !== "my-card") return;
  if (approvalPollTimer) clearInterval(approvalPollTimer);
  isApprovalPollingActive = true;
  approvalPollTimer = setInterval(() => checkApprovalStatus(sessionId), POLL_INTERVAL_MS);
  checkApprovalStatus(sessionId);
}

async function checkApprovalStatus(sessionId) {
  if (!isApprovalPollingActive || document.body.dataset.page !== "my-card" || isApprovalPollInFlight) return;
  isApprovalPollInFlight = true;
  try {
    const session = await fetchApprovalSession(sessionId);
    if (!session) throw new Error("Approval session was not found.");
    if (session.status === "waiting" && isExpired(session)) {
      await expireSession(session);
      setApprovalState("expired", "SESSION EXPIRED", "", "");
      stopTimers();
      return;
    }
    if (session.status === "approved") {
      currentApprovalSession = session;
      setApprovalState("approved", "SUCCESS", "ACCESS APPROVED", "Mobile verification completed");
      stopTimers();
    } else if (session.status === "rejected") {
      currentApprovalSession = session;
      setApprovalState("rejected", "ACCESS DENIED", "", "");
      stopTimers();
    } else if (session.status === "expired") {
      setApprovalState("expired", "SESSION EXPIRED", "", "");
      stopTimers();
    } else {
      setApprovalState("waiting", "WAITING FOR APPROVAL", "", "");
    }
  } catch (error) {
    const message = readableDbError(error);
    setApprovalState("waiting", "WAITING FOR APPROVAL", message, "");
    showPageError(message);
  } finally {
    isApprovalPollInFlight = false;
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
  const { error } = await db
    .from("approval_sessions")
    .update({ status: "expired" })
    .eq("id", session.id)
    .eq("status", "waiting");
  if (error) throw error;
  await insertAccessLog(session, null, "expired", "qr_approval_expired");
}

function setApprovalState(state, titleText, detailText, subdetailText = "") {
  const panel = $("approvalPanel");
  if (panel) panel.className = `approval-panel glass-panel ${state}`;
  if ($("approvalStatusBadge")) {
    $("approvalStatusBadge").className = `approval-status-badge ${state}`;
    $("approvalStatusBadge").textContent = title(state);
  }
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
    const updatedSession = await updateApprovalSession(sessionId, update);
    if (updatedSession?.status !== result) throw new Error("Database update failed.");
    await insertAccessLog(updatedSession, card, result, result === "approved" ? "qr_approval_success" : "qr_approval_rejected");
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

function isExpired(session) {
  return Boolean(session.expires_at && new Date(session.expires_at).getTime() <= Date.now());
}

function normalizeResult(result) {
  const value = String(result || "").toLowerCase();
  if (value === "denied") return "rejected";
  if (value === "granted") return "approved";
  return value;
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
  $("qrImage").removeAttribute("tabindex");
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
  $("qrImage").removeAttribute("tabindex");
  if ($("approvalOpenLink")) $("approvalOpenLink").hidden = true;
}
