function initLogs() {
  if (document.body.dataset.page !== "logs") return;
  $("refreshLogsBtn")?.addEventListener("click", loadLogsTable);
  loadLogsTable();
}

async function loadLogsTable() {
  const logs = await safeDataLoad(fetchLogs, []);
  renderLogsTable(logs);
}

function renderLogsTable(logs) {
  $("logsTable").innerHTML = logs.map((log) => {
    const result = normalizeResult(log.result);
    const eventType = log.location || DEFAULT_LOCATION;
    return `
      <tr>
        <td>${formatDate(log.created_at)}</td>
        <td><span class="event-type ${result}">${escapeHtml(formatEventType(eventType))}</span></td>
        <td>${escapeHtml(log.email || "-")}</td>
        <td>${escapeHtml(log.uid || log.card_uid || "-")}</td>
        <td><span class="badge ${result}">${escapeHtml(result.toUpperCase())}</span></td>
        <td>${escapeHtml(log.device || "Unknown")}</td>
        <td>${escapeHtml(eventType)}</td>
      </tr>`;
  }).join("") || `<tr><td colspan="7">No logs found.</td></tr>`;
}

function filterLogs(logs, predicate) {
  return logs.filter(predicate);
}

function formatEventType(value) {
  return String(value || "-").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
