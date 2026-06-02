async function initReports() {
  if (document.body.dataset.page !== "reports") return;
  return loadReports();
}

async function loadReports() {
  const [cards, sessions, logs] = await safeDataLoad(() => Promise.all([fetchCards(), fetchSessions(), fetchLogs()]), [[], [], []]);
  renderReports(calculateReports(cards, sessions, logs));
}

function calculateReports(cards, sessions, logs) {
  const counts = countStatuses(sessions);
  const blocked = cards.filter((card) => card.status === "blocked").length;
  return { counts, blocked, logs };
}

function renderReports(report) {
  const { counts, blocked, logs } = report;
  setText("reportApproved", counts.approved);
  setText("reportRejected", counts.rejected);
  setText("reportBlocked", blocked);
  setText("reportTotalLogs", logs.length);
}
