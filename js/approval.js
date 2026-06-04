var approvalPollTimer = null;
var countdownTimer = null;
var currentApprovalSession = null;
var currentApprovalCard = null;
var currentApprovalUrl = "";
var isApprovalPollingActive = false;
var isApprovalPollInFlight = false;
var mobileApprovalSession = null;
var mobileApprovalCard = null;

function initMyIdentity(user) {
  return loadMyCard(user);
}

async function loadMyCard(user) {
  setCardLoadingState("Loading");
  try {
    const card = await ensureUserCard(user);
    renderIdentityCard(card);
    renderApprovalSessionPanel();
    const session = await createApprovalSession(card);
    currentApprovalCard = card;
    currentApprovalSession = session;
    renderApprovalQr(session, card);
    setApprovalState("waiting", "Waiting", "Waiting for approval.", `Session expires in: ${formatDuration(new Date(session.expires_at).getTime() - Date.now())}`);
    startCountdown(session);
    startApprovalPolling(session.id);
  } catch (error) {
    const message = readableDbError(error);
    setCardErrorState(message);
    showPageError(message);
  }
}

function renderApprovalSessionPanel() {
  if ($("approvalPanel")) $("approvalPanel").hidden = false;
}

function renderIdentityCard(card) {
  $("cardName").textContent = card.full_name;
  $("cardEmail").textContent = card.email;
  $("cardUid").textContent = card.uid;
  $("cardRole").textContent = title(card.role);
  $("cardStatus").textContent = title(card.status);
  $("cardStatusDetail").textContent = title(card.status);
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
      setApprovalState("expired", "Expired", "This session has expired.", "");
      stopTimers();
      return;
    }
    if (session.status === "approved") {
      currentApprovalSession = session;
      setApprovalState("approved", "Approved", "This session was approved.", "Access approved.");
      stopTimers();
    } else if (session.status === "rejected") {
      currentApprovalSession = session;
      setApprovalState("rejected", "Rejected", "This session was rejected.", "Access rejected.");
      stopTimers();
    } else if (session.status === "expired") {
      setApprovalState("expired", "Expired", "This session has expired.", "");
      stopTimers();
    } else {
      const remaining = Math.max(0, new Date(session.expires_at).getTime() - Date.now());
      setApprovalState("waiting", "Waiting", "Waiting for approval.", `Session expires in: ${formatDuration(remaining)}`);
    }
  } catch (error) {
    const message = readableDbError(error);
    setApprovalState("waiting", "Waiting", message, "");
    showPageError(message);
  } finally {
    isApprovalPollInFlight = false;
  }
}

function startCountdown(session) {
  if (countdownTimer) clearInterval(countdownTimer);
  const tick = () => {
    const remaining = Math.max(0, new Date(session.expires_at).getTime() - Date.now());
    if ($("sessionCountdown")) $("sessionCountdown").textContent = formatDuration(remaining);
    if ($("approvalSubdetail") && session.status === "waiting") $("approvalSubdetail").textContent = `Session expires in: ${formatDuration(remaining)}`;
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
  const card = session?.uid ? await fetchCardByUid(session.uid) : null;
  await insertAccessLog(session, card, "expired", "qr_approval_expired");
}

function setApprovalState(state, titleText, detailText, subdetailText = "") {
  const panel = $("approvalPanel");
  if (panel) {
    const previousState = panel.dataset.approvalState || "";
    panel.dataset.approvalState = state;
    panel.className = `approval-panel glass-panel ${state}`;
    if (previousState && previousState !== state && ["approved", "rejected", "expired"].includes(state)) {
      panel.classList.add(`status-animate-${state}`);
      window.setTimeout(() => panel.classList.remove(`status-animate-${state}`), 900);
    }
  }
  if ($("approvalStatusBadge")) {
    $("approvalStatusBadge").className = `approval-status-badge ${state}`;
    $("approvalStatusBadge").textContent = title(state);
  }
  if ($("approvalIcon")) {
    $("approvalIcon").className = `approval-icon ${state}`;
    $("approvalIcon").textContent = state === "approved" ? "✓" : state === "rejected" ? "×" : state === "expired" ? "!" : "...";
  }
  if ($("approvalStatus")) $("approvalStatus").textContent = titleText;
  if ($("approvalDetail")) $("approvalDetail").textContent = detailText;
  if ($("approvalSubdetail")) $("approvalSubdetail").textContent = subdetailText;
  document.body.classList.toggle("access-approved", state === "approved");
  document.body.classList.toggle("access-denied", state === "rejected");
  document.body.classList.toggle("access-expired", state === "expired");
  if (state !== "waiting") document.body.classList.remove("access-waiting");
  if (state === "waiting") document.body.classList.add("access-waiting");
}

async function initMobileApproval() {
  const sessionId = new URLSearchParams(window.location.search).get("session");
  if (!sessionId) return setMobileApprovalState("rejected", "Missing session", "Invalid approval request.", "!");
  if (!db) return setMobileApprovalState("rejected", "Offline", "Service unavailable.", "!");

  $("mobileSessionId").textContent = sessionId;
  disableMobileButtons();
  $("mobileApproveBtn")?.addEventListener("click", () => completeMobileSession(sessionId, "approved"));
  $("mobileRejectBtn")?.addEventListener("click", () => completeMobileSession(sessionId, "rejected"));
  await loadMobileApprovalSession(sessionId);
}

async function loadMobileApprovalSession(sessionId) {
  try {
    const session = await fetchApprovalSession(sessionId);
    if (!session) {
      disableMobileButtons();
      return setMobileApprovalState("rejected", "Session not found", "Invalid or expired request.", "!");
    }
    mobileApprovalSession = session;
    mobileApprovalCard = await fetchCardByUid(session.uid);
    renderMobileApprovalIdentity(mobileApprovalCard, session);
    $("mobileSessionStatus").textContent = title(normalizeResult(session.status));
    if (session.status === "waiting" && isExpired(session)) {
      await expireSession(session);
      disableMobileButtons();
      return setMobileApprovalState("expired", "Expired", "This session has expired.", "--");
    }
    if (session.status === "approved") {
      disableMobileButtons();
      return setMobileApprovalState("approved", "Approved", "This session has already been approved.", "OK");
    }
    if (session.status === "rejected") {
      disableMobileButtons();
      return setMobileApprovalState("rejected", "Rejected", "This session has already been rejected.", "NO");
    }
    if (session.status === "expired") {
      disableMobileButtons();
      return setMobileApprovalState("expired", "Expired", "This session has expired.", "--");
    }
    enableMobileButtons();
    setMobileApprovalState("waiting", "Waiting", "Review the identity information before approving access.", "QR");
  } catch (error) {
    disableMobileButtons();
    setMobileApprovalState("rejected", "Load failed", readableDbError(error), "!");
  }
}

function renderMobileApprovalIdentity(card, session) {
  if ($("mobileCardName")) $("mobileCardName").textContent = card?.full_name || "-";
  if ($("mobileCardEmail")) $("mobileCardEmail").textContent = card?.email || "-";
  if ($("mobileCardUid")) $("mobileCardUid").textContent = card?.uid || session?.uid || "-";
  if ($("mobileSessionCountdown")) $("mobileSessionCountdown").textContent = formatDuration(Math.max(0, new Date(session.expires_at).getTime() - Date.now()));
  startMobileCountdown(session);
}

function startMobileCountdown(session) {
  if (countdownTimer) clearInterval(countdownTimer);
  const tick = async () => {
    const remaining = Math.max(0, new Date(session.expires_at).getTime() - Date.now());
    if ($("mobileSessionCountdown")) $("mobileSessionCountdown").textContent = formatDuration(remaining);
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      if (mobileApprovalSession?.status === "waiting") {
        await expireSession(mobileApprovalSession);
        mobileApprovalSession.status = "expired";
        disableMobileButtons();
        setMobileApprovalState("expired", "Expired", "This session has expired.", "--");
      }
    }
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

async function completeMobileSession(sessionId, result) {
  disableMobileButtons();
  setMobileApprovalState("waiting", "Confirming", "Updating request...", "...");
  try {
    const session = await fetchApprovalSession(sessionId);
    if (!session) throw new Error("Approval session was not found.");
    if (session.status !== "waiting") throw new Error(`Session is already ${session.status}.`);
    if (isExpired(session)) {
      await expireSession(session);
      disableMobileButtons();
      return setMobileApprovalState("expired", "Expired", "This session has expired.", "--");
    }
    const card = await fetchCardByUid(session.uid);
    const update = { status: result };
    if (result === "approved") update.approved_at = new Date().toISOString();
    const updatedSession = await updateApprovalSession(sessionId, update);
    if (updatedSession?.status !== result) throw new Error("Database update failed.");
    await insertAccessLog(updatedSession, card, result, result === "approved" ? "qr_approval_success" : "qr_approval_rejected", result === "approved" ? "Mobile approval" : "Mobile rejection");
    if (result === "approved") {
      setMobileApprovalState("approved", "Approved", "Session approved.", "OK");
    } else {
      setMobileApprovalState("rejected", "Rejected", "Session rejected.", "NO");
    }
  } catch (error) {
    disableMobileButtons();
    setMobileApprovalState("rejected", "Approval failed", readableDbError(error), "!");
  }
}

function disableMobileButtons() {
  if ($("approveActions")) $("approveActions").hidden = true;
  if ($("mobileApproveBtn")) $("mobileApproveBtn").disabled = true;
  if ($("mobileRejectBtn")) $("mobileRejectBtn").disabled = true;
}

function enableMobileButtons() {
  if ($("approveActions")) $("approveActions").hidden = false;
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
  renderApprovalSessionPanel();
  $("cardStatus").textContent = text;
  $("cardName").textContent = "Loading...";
  $("cardEmail").textContent = "-";
  $("cardUid").textContent = "-";
  $("cardRole").textContent = "-";
  $("cardStatusDetail").textContent = "-";
  $("qrLink").textContent = "";
  $("qrImage").hidden = true;
  $("qrImage").removeAttribute("tabindex");
  if ($("sessionCountdown")) $("sessionCountdown").textContent = "--:--";
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
}
