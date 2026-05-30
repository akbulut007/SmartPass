function initLogs() {
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

function filterLogs(logs, predicate) {
  return logs.filter(predicate);
}

