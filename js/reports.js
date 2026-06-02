var currentReport = null;

async function initReports() {
  if (document.body.dataset.page !== "reports") return;
  $("exportReportBtn")?.addEventListener("click", exportReportCsv);
  return loadReports();
}

async function loadReports() {
  const [cards, sessions, logs] = await safeDataLoad(() => Promise.all([fetchCards(), fetchSessions(), fetchLogs()]), [[], [], []]);
  renderReports(calculateReports(cards, sessions, logs));
}

function calculateReports(cards, sessions, logs) {
  const counts = countStatuses(sessions);
  const blocked = cards.filter((card) => card.status === "blocked").length;
  const totalDecisions = counts.approved + counts.rejected;
  const approvalRate = percentage(counts.approved, totalDecisions);
  const rejectionRate = percentage(counts.rejected, totalDecisions);
  const dailyRows = buildDailyReportRows(logs).slice(0, 5);
  return { counts, blocked, logs, approvalRate, rejectionRate, dailyRows };
}

function renderReports(report) {
  currentReport = report;
  const { counts, blocked, logs, approvalRate, rejectionRate, dailyRows } = report;
  setText("reportApproved", counts.approved);
  setText("reportRejected", counts.rejected);
  setText("reportBlocked", blocked);
  setText("reportTotalLogs", logs.length);
  setText("approvalRate", `${approvalRate}%`);
  setText("rejectionRate", `${rejectionRate}%`);
  setText("blockedUserCount", blocked);
  setText("totalAccessEvents", logs.length);
  renderReportMix(counts, logs.length);
  renderReportTable(dailyRows);
}

function buildDailyReportRows(logs) {
  const grouped = logs.reduce((rows, log) => {
    const date = formatReportDate(log.created_at);
    if (!rows[date]) rows[date] = { date, approved: 0, rejected: 0, total: 0 };
    const result = normalizeResult(log.result);
    if (result === "approved") rows[date].approved += 1;
    if (result === "rejected") rows[date].rejected += 1;
    rows[date].total += 1;
    return rows;
  }, {});
  return Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderReportTable(rows) {
  const target = $("reportTable");
  if (!target) return;
  target.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.date)}</td>
      <td><span class="badge approved">${row.approved}</span></td>
      <td><span class="badge rejected">${row.rejected}</span></td>
      <td>${row.total}</td>
    </tr>`).join("") || `<tr><td colspan="4">No report data.</td></tr>`;
}

function renderReportMix(counts, totalLogs) {
  const otherEvents = Math.max(0, totalLogs - counts.approved - counts.rejected);
  const totalMix = Math.max(1, counts.approved + counts.rejected + otherEvents);
  const approvedWidth = percentage(counts.approved, totalMix);
  const rejectedWidth = percentage(counts.rejected, totalMix);
  const otherWidth = Math.max(0, 100 - approvedWidth - rejectedWidth);
  setBarWidth("approvedMixBar", approvedWidth);
  setBarWidth("rejectedMixBar", rejectedWidth);
  setBarWidth("otherMixBar", otherWidth);
}

function setBarWidth(id, width) {
  const element = $(id);
  if (!element) return;
  element.style.width = `${width}%`;
}

function percentage(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatReportDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function exportReportCsv() {
  if (!currentReport) return;
  const rows = [
    ["Metric", "Value"],
    ["Approved", currentReport.counts.approved],
    ["Rejected", currentReport.counts.rejected],
    ["Blocked Users", currentReport.blocked],
    ["Total Logs", currentReport.logs.length],
    ["Approval Rate", `${currentReport.approvalRate}%`],
    ["Rejection Rate", `${currentReport.rejectionRate}%`],
    [],
    ["Date", "Approved", "Rejected", "Total Events"],
    ...currentReport.dailyRows.map((row) => [row.date, row.approved, row.rejected, row.total])
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `smartpass-report-${formatReportDate(new Date().toISOString())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
