async function initReports() {
  if (document.body.dataset.page !== "reports") return;
  return loadReports();
}

async function loadReports() {
  const [cards, sessions] = await safeDataLoad(() => Promise.all([fetchCards(), fetchSessions()]), [[], []]);
  renderReports(calculateReports(cards, sessions));
}

function calculateReports(cards, sessions) {
  const counts = countStatuses(sessions);
  const active = cards.filter((card) => card.status === "active").length;
  const totalFinished = counts.approved + counts.rejected + counts.expired;
  return { cards, counts, active, totalFinished };
}

function renderReports(report) {
  const { cards, counts, active, totalFinished } = report;
  setText("reportApproved", counts.approved);
  setText("reportRejected", counts.rejected);
  setText("reportExpired", counts.expired);
  setText("reportActive", active);
  setText("reportGrantRate", totalFinished ? `${Math.round((counts.approved / totalFinished) * 100)}%` : "0%");
  setBar("approvedBar", "approvedBarText", counts.approved, totalFinished || 1);
  setBar("rejectedBar", "rejectedBarText", counts.rejected, totalFinished || 1);
  setBar("expiredBar", "expiredBarText", counts.expired, totalFinished || 1);
  setBar("activeBar", "activeBarText", active, cards.length || 1);
}
