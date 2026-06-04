function buildApprovalUrl(sessionId) {
  return `${getApproveBaseUrl()}?session=${encodeURIComponent(sessionId)}`;
}

function getApproveBaseUrl() {
  return APPROVE_BASE_URL;
}

function generateQRCode(approvalUrl, card) {
  $("qrImage").src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(approvalUrl)}`;
  $("qrImage").hidden = false;
  $("qrImage").removeAttribute("tabindex");
  $("qrImage").title = "Scan this QR code";
  if (card) $("qrImage").alt = `QR approval link for ${card.full_name}`;
}

function openApprovalPage() {
  if (!currentApprovalUrl) {
    showPageError("Approval page link is not ready yet.");
    return;
  }
  window.open(currentApprovalUrl, "_blank");
}

function renderApprovalQr(session, card) {
  if (!session?.id) throw new Error("Session could not be created.");
  const approvalUrl = buildApprovalUrl(session.id);
  currentApprovalUrl = approvalUrl;
  $("approvalSessionId").textContent = session.id;
  $("approvalCreatedAt").textContent = formatDate(session.created_at);
  if ($("approvalDevice")) $("approvalDevice").textContent = session.device || "Desktop";
  generateQRCode(approvalUrl, card);
  $("qrLink").textContent = approvalUrl;
  if ($("approvalOpenLink")) {
    $("approvalOpenLink").hidden = false;
  }
}
