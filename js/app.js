const page = document.body.dataset.page;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindLogout();
  if (!isConfigured) showConfigWarning();
  if (!page) return;

  if (page === "auth") return initLoginPage();
  if (page === "approve") return initMobileApproval();
  if (page === "scan") return initMobileApproval();

  const user = await requireAuthentication();
  if (!user) return;
  setSessionInfo(user);

  if (page === "dashboard") return initDashboard();
  if (page === "my-card") return initMyIdentity(user);
  if (page === "users") return initUsers();
  if (page === "logs") return initLogs();
  if (page === "reports") return initReports();
}
