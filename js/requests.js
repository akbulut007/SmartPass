const ACCESS_REQUEST_STATUSES = ["reviewed", "approved", "rejected"];

function initAccessRequestWidgets() {
  document.querySelectorAll("[data-open-access-request]").forEach((button) => {
    button.addEventListener("click", openAccessRequestModal);
  });
}

function ensureAccessRequestModal() {
  let modal = $("accessRequestModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "accessRequestModal";
  modal.className = "access-request-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="access-request-backdrop" data-close-access-request></div>
    <section class="access-request-panel glass-panel" role="dialog" aria-modal="true" aria-labelledby="accessRequestTitle">
      <div class="access-request-header">
        <div>
          <p class="eyebrow">SmartPass</p>
          <h2 id="accessRequestTitle">Request Access Code</h2>
        </div>
        <button class="ghost-btn request-close-btn" type="button" data-close-access-request>Close</button>
      </div>
      <form id="accessRequestForm" class="access-request-form" novalidate>
        <label>Full Name
          <input type="text" id="requestFullName" autocomplete="name" placeholder="Ada Lovelace">
        </label>
        <label>Email
          <input type="email" id="requestEmail" autocomplete="email" placeholder="student@university.edu">
        </label>
        <label>Request Type
          <input type="text" value="Access Code" disabled>
        </label>
        <label>Reason for request
          <textarea id="requestReason" rows="4" placeholder="Tell us why you need an access code"></textarea>
        </label>
        <button class="primary-btn" type="submit">Submit Request</button>
        <p id="accessRequestMessage" class="form-message" aria-live="polite"></p>
      </form>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-access-request]").forEach((button) => {
    button.addEventListener("click", closeAccessRequestModal);
  });
  modal.querySelector("#accessRequestForm")?.addEventListener("submit", submitAccessRequest);
  return modal;
}

function openAccessRequestModal() {
  const modal = ensureAccessRequestModal();
  modal.hidden = false;
  $("accessRequestMessage").textContent = "";
  $("requestFullName")?.focus();
}

function closeAccessRequestModal() {
  const modal = $("accessRequestModal");
  if (modal) modal.hidden = true;
}

async function submitAccessRequest(event) {
  event.preventDefault();
  const fullName = $("requestFullName").value.trim();
  const email = $("requestEmail").value.trim().toLowerCase();
  const reason = $("requestReason").value.trim();

  if (!fullName) return setMessage("accessRequestMessage", "Please enter your full name.", "error");
  if (!email) return setMessage("accessRequestMessage", "Please enter your email.", "error");
  if (!isValidEmail(email)) return setMessage("accessRequestMessage", "Please enter a valid email address.", "error");
  if (!db) return setMessage("accessRequestMessage", "Configure Supabase first.", "error");

  setMessage("accessRequestMessage", "Submitting request...");
  try {
    const card = await fetchCardByEmail(email);
    if (!card) {
      return setMessage("accessRequestMessage", "No registered account was found for this email. Please register before requesting an access code.", "error");
    }
    const pendingRequest = await fetchPendingAccessRequestByEmail(email);
    if (pendingRequest) {
      return setMessage("accessRequestMessage", "You already have a pending access code request.", "error");
    }
    await createAccessRequest({ full_name: fullName, email, reason });
    event.target.reset();
    setMessage("accessRequestMessage", "Your request has been submitted. An administrator will review it.");
  } catch (error) {
    setMessage("accessRequestMessage", readableDbError(error), "error");
  }
}

function initRequestsPage() {
  if (document.body.dataset.page !== "requests") return;
  $("refreshRequestsBtn")?.addEventListener("click", loadAccessRequestsTable);
  $("requestsTable")?.addEventListener("click", updateRequestStatusFromTable);
  return loadAccessRequestsTable();
}

async function loadAccessRequestsTable() {
  setMessage("requestsMessage", "Loading...");
  const [requests, cards] = await safeDataLoad(() => Promise.all([fetchAccessRequests(), fetchCards()]), [[], []]);
  const cardByEmail = new Map(cards.map((card) => [String(card.email || "").toLowerCase(), card]));
  $("requestsTable").innerHTML = requests.map((request) => {
    const card = cardByEmail.get(String(request.email || "").toLowerCase());
    const approvedInfo = request.status === "approved"
      ? `<small class="request-access-result">${card?.access_code ? `Access code: ${escapeHtml(card.access_code)}` : "No registered account found for this email."}</small>`
      : "";
    return `
      <tr>
        <td>${escapeHtml(request.full_name)}</td>
        <td>${escapeHtml(request.email)}</td>
        <td>${escapeHtml(request.reason || "-")}</td>
        <td><span class="badge ${escapeHtml(request.status)}">${escapeHtml(request.status.toUpperCase())}</span>${approvedInfo}</td>
        <td>${formatDate(request.created_at)}</td>
        <td><div class="request-actions">
          ${ACCESS_REQUEST_STATUSES.map((status) => `<button class="ghost-btn" type="button" data-request-id="${request.id}" data-request-status="${status}" ${request.status === status ? "disabled" : ""}>${requestActionLabel(status)}</button>`).join("")}
        </div></td>
      </tr>`;
  }).join("") || `<tr><td colspan="6">No requests found.</td></tr>`;
  setMessage("requestsMessage", requests.length ? `${requests.length} requests` : "No requests found.");
}

function requestActionLabel(status) {
  if (status === "reviewed") return "Mark as Reviewed";
  if (status === "approved") return "Approve";
  return "Reject";
}

async function updateRequestStatusFromTable(event) {
  const button = event.target.closest("[data-request-id]");
  if (!button) return;
  button.disabled = true;
  setMessage("requestsMessage", "Updating request...");
  try {
    await updateAccessRequestStatus(button.dataset.requestId, button.dataset.requestStatus);
    await loadAccessRequestsTable();
    setMessage("requestsMessage", "Request updated.");
  } catch (error) {
    button.disabled = false;
    showPageError(readableDbError(error));
  }
}
