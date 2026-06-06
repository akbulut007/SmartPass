const page = document.body.dataset.page;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindLogout();
  if (!isConfigured) showConfigWarning();
  if (!page) return;

  if (["user-login", "admin-login", "register"].includes(page)) {
    initLoginPage();
    if (typeof initAccessRequestWidgets === "function") initAccessRequestWidgets();
    return;
  }
  if (page === "reset-password") return initResetPasswordPage();
  if (page === "message-box") return initMessageBoxPage();
  if (page === "approve") return initMobileApproval();
  if (page === "scan") return initMobileApproval();

  const user = await requireAuthentication();
  if (!user) return;
  if (!enforceRoleAccess(user, page)) return;
  renderRoleNavigation(user);
  setSessionInfo(user);
  showAccessRestrictionMessage();

  if (page === "dashboard") return initDashboard();
  if (page === "my-card") return initMyIdentity(user);
  if (page === "users") return initUsers();
  if (page === "logs") return initLogs();
  if (page === "reports") return initReports();
  if (page === "requests") return initRequestsPage();
  if (page === "security") return initSecurityPage();
}
