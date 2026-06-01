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
  const active = cards.filter((card) => card.status === "active").length;
  const blocked = cards.filter((card) => card.status === "blocked").length;
  const totalFinished = counts.approved + counts.rejected + counts.expired;
  return { cards, counts, active, blocked, logs, totalFinished };
}

function renderReports(report) {
  const { cards, counts, blocked, logs, totalFinished } = report;
  setText("reportApproved", counts.approved);
  setText("reportRejected", counts.rejected);
  setText("reportBlocked", blocked);
  setText("reportTotalLogs", logs.length);
  setBar("approvedBar", "approvedBarText", counts.approved, totalFinished || 1);
  setBar("rejectedBar", "rejectedBarText", counts.rejected, totalFinished || 1);
  setBar("blockedBar", "blockedBarText", blocked, cards.length || 1);
}
