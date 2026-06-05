const ACCESS_REQUEST_STATUSES = ["reviewed", "approved", "rejected"];
var accessRequestsCache = [];
var accessRequestCardsByEmail = new Map();
var activeRequestFilter = "all";

function initRequestsPage() {
  if (document.body.dataset.page !== "requests") return;
  $("refreshRequestsBtn")?.addEventListener("click", () => loadAccessRequestsTable({ resetFilters: true }));
  $("requestsSearchInput")?.addEventListener("input", renderFilteredAccessRequestsTable);
  $("requestsQuickFilters")?.addEventListener("click", updateRequestQuickFilter);
  $("requestsTable")?.addEventListener("click", updateRequestStatusFromTable);
  return loadAccessRequestsTable();
}

async function loadAccessRequestsTable(options = {}) {
  setMessage("requestsMessage", "Loading...");
  const [requests, cards] = await safeDataLoad(() => Promise.all([fetchAccessRequests(), fetchCards()]), [[], []]);
  accessRequestsCache = requests;
  accessRequestCardsByEmail = new Map(cards.map((card) => [String(card.email || "").toLowerCase(), card]));
  if (options.resetFilters) resetRequestFilters();
  renderFilteredAccessRequestsTable();
}

function renderFilteredAccessRequestsTable() {
  const query = ($("requestsSearchInput")?.value || "").trim().toLowerCase();
  const requests = filterAccessRequests(accessRequestsCache, query, activeRequestFilter);
  $("requestsTable").innerHTML = requests.map((request) => {
    const card = accessRequestCardsByEmail.get(String(request.email || "").toLowerCase());
    const approvedInfo = request.status === "approved"
      ? `<small class="request-access-result">${card?.access_code ? `Access code: ${escapeHtml(card.access_code)}` : "No registered account found for this email."}</small>`
      : "";
    return `
      <tr>
        <td>${escapeHtml(request.full_name)}</td>
        <td>${escapeHtml(request.email)}</td>
        <td>${escapeHtml(formatRequestType(request.request_type))}</td>
        <td>${escapeHtml(request.reason || "-")}</td>
        <td><span class="badge ${escapeHtml(request.status)}">${escapeHtml(request.status.toUpperCase())}</span>${approvedInfo}</td>
        <td>${formatDate(request.created_at)}</td>
        <td><div class="request-actions">
          ${ACCESS_REQUEST_STATUSES.map((status) => `<button class="ghost-btn" type="button" data-request-id="${request.id}" data-request-status="${status}" ${request.status === status ? "disabled" : ""}>${requestActionLabel(status)}</button>`).join("")}
        </div></td>
      </tr>`;
  }).join("") || `<tr><td colspan="7">${query || activeRequestFilter !== "all" ? "No matching requests found." : "No requests found."}</td></tr>`;
  if ($("requestsResultCount")) $("requestsResultCount").textContent = `Showing ${requests.length} of ${accessRequestsCache.length} requests`;
  setMessage("requestsMessage", accessRequestsCache.length ? `Showing ${requests.length} of ${accessRequestsCache.length} requests` : "No requests found.");
}

function filterAccessRequests(requests, query, quickFilter) {
  return requests.filter((request) => matchesRequestQuickFilter(request, quickFilter) && matchesRequestSearch(request, query));
}

function matchesRequestSearch(request, query) {
  if (!query) return true;
  return [
    request.full_name,
    request.email,
    request.request_type,
    formatRequestType(request.request_type),
    request.status,
    request.reason,
    request.created_at,
    formatDate(request.created_at)
  ].some((value) => String(value || "").toLowerCase().includes(query));
}

function matchesRequestQuickFilter(request, quickFilter) {
  if (!quickFilter || quickFilter === "all") return true;
  return String(request.status || "").toLowerCase() === quickFilter;
}

function updateRequestQuickFilter(event) {
  const button = event.target.closest("[data-request-filter]");
  if (!button) return;
  activeRequestFilter = button.dataset.requestFilter || "all";
  document.querySelectorAll("[data-request-filter]").forEach((item) => item.classList.toggle("active", item === button));
  renderFilteredAccessRequestsTable();
}

function resetRequestFilters() {
  activeRequestFilter = "all";
  if ($("requestsSearchInput")) $("requestsSearchInput").value = "";
  document.querySelectorAll("[data-request-filter]").forEach((item) => item.classList.toggle("active", item.dataset.requestFilter === "all"));
}

function formatRequestType(value) {
  if (value === "access_code") return "Access Code";
  return title(value || "other");
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
