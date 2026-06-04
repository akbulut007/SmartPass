var logsCache = [];
var activeLogFilter = "all";

function initLogs() {
  if (document.body.dataset.page !== "logs") return;
  $("refreshLogsBtn")?.addEventListener("click", () => loadLogsTable({ resetFilters: true }));
  $("logsSearchInput")?.addEventListener("input", renderFilteredLogsTable);
  $("logsQuickFilters")?.addEventListener("click", updateLogQuickFilter);
  loadLogsTable();
}

async function loadLogsTable(options = {}) {
  const [logs, cards] = await safeDataLoad(() => Promise.all([fetchLogs(), fetchCards()]), [[], []]);
  logsCache = hydrateLogsWithCards(logs, cards);
  if (options.resetFilters) resetLogFilters();
  renderFilteredLogsTable();
}

function renderLogsTable(logs, emptyText = "No logs found.") {
  $("logsTable").innerHTML = logs.map((log) => {
    const result = normalizeResult(log.result);
    const eventType = log.location || DEFAULT_LOCATION;
    return `
      <tr>
        <td>${formatDate(log.created_at)}</td>
        <td>${escapeHtml(log.full_name || "-")}</td>
        <td>${escapeHtml(log.email || "-")}</td>
        <td>${escapeHtml(log.uid || log.card_uid || "-")}</td>
        <td><span class="event-type ${result}">${escapeHtml(formatEventType(eventType))}</span></td>
        <td><span class="badge ${result}">${escapeHtml(result.toUpperCase())}</span></td>
        <td>${escapeHtml(log.device || "Unknown")}</td>
      </tr>`;
  }).join("") || `<tr><td colspan="7">${emptyText}</td></tr>`;
}

function renderFilteredLogsTable() {
  const query = ($("logsSearchInput")?.value || "").trim().toLowerCase();
  const logs = filterLogs(logsCache, query, activeLogFilter);
  renderLogsTable(logs, query || activeLogFilter !== "all" ? "No matching logs found." : "No logs found.");
  if ($("logsResultCount")) $("logsResultCount").textContent = `Showing ${logs.length} of ${logsCache.length} logs`;
}

function hydrateLogsWithCards(logs, cards) {
  const cardsByEmail = new Map(cards.map((card) => [String(card.email || "").toLowerCase(), card]));
  const cardsByUid = new Map(cards.map((card) => [String(card.uid || "").toLowerCase(), card]));
  return logs.map((log) => {
    const card = cardsByEmail.get(String(log.email || "").toLowerCase())
      || cardsByUid.get(String(log.uid || log.card_uid || "").toLowerCase());
    return { ...log, full_name: card?.full_name || log.full_name || "" };
  });
}

function filterLogs(logs, query, quickFilter) {
  return logs.filter((log) => matchesLogQuickFilter(log, quickFilter) && matchesLogSearch(log, query));
}

function matchesLogSearch(log, query) {
  if (!query) return true;
  const result = normalizeResult(log.result);
  const eventType = log.location || DEFAULT_LOCATION;
  return [
    log.full_name,
    log.email,
    log.uid,
    log.card_uid,
    result,
    log.device,
    eventType,
    log.created_at,
    formatDate(log.created_at)
  ].some((value) => String(value || "").toLowerCase().includes(query));
}

function matchesLogQuickFilter(log, quickFilter) {
  if (!quickFilter || quickFilter === "all") return true;
  const result = normalizeResult(log.result);
  const eventType = String(log.location || DEFAULT_LOCATION).toLowerCase();
  if (quickFilter === "approved") return result === "approved";
  if (quickFilter === "rejected") return result === "rejected";
  if (quickFilter === "login") return eventType.includes("login");
  if (quickFilter === "blocked") return result.includes("blocked") || eventType.includes("blocked");
  return true;
}

function updateLogQuickFilter(event) {
  const button = event.target.closest("[data-log-filter]");
  if (!button) return;
  activeLogFilter = button.dataset.logFilter || "all";
  document.querySelectorAll("[data-log-filter]").forEach((item) => item.classList.toggle("active", item === button));
  renderFilteredLogsTable();
}

function resetLogFilters() {
  activeLogFilter = "all";
  if ($("logsSearchInput")) $("logsSearchInput").value = "";
  document.querySelectorAll("[data-log-filter]").forEach((item) => item.classList.toggle("active", item.dataset.logFilter === "all"));
}

function formatEventType(value) {
  return String(value || "-").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
