const ADMIN_ONLY_PAGES = ["dashboard", "users", "logs", "reports", "requests", "security"];
const ACCESS_RESTRICTED_MESSAGE = "Administrator access required.";
const PUBLIC_REGISTRATION_ROLES = ["student", "staff", "visitor"];

function bindLogout() {
  const btn = $("logoutBtn");
  if (!btn) return;
  btn.addEventListener("click", logout);
}

async function logout() {
  try {
    const user = await getCurrentUser();
    await logAuthActivity("logout", user);
  } catch (error) {
    console.warn("[SmartPass] Logout activity log failed", error);
  }
  stopTimers();
  if (db) await db.auth.signOut();
  window.location.href = "user-login.html";
}

async function getCurrentUser() {
  if (!db) return null;
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  return data.session?.user || null;
}

async function requireSession() {
  if (!db) {
    showPageError("Supabase client is not available. Check the Supabase CDN and config file.");
    return null;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = "user-login.html";
      return null;
    }
    user.smartPassCard = await getUserCard(user);
    return user;
  } catch (error) {
    showPageError(`Session error: ${error.message}`);
    return null;
  }
}

async function requireAuthentication() {
  return requireSession();
}

function setSessionInfo(user) {
  if ($("sessionInfo")) $("sessionInfo").textContent = user.email;
}

function getUserRole(user) {
  return user?.smartPassCard?.role === "admin" ? "admin" : "student";
}

function isAdminUser(user) {
  return getUserRole(user) === "admin";
}

function getRoleHomePage(user) {
  return isAdminUser(user) ? "dashboard.html" : "my-card.html";
}

function redirectToRoleHome(user) {
  window.location.href = getRoleHomePage(user);
}

function enforceRoleAccess(user, pageName) {
  if (!ADMIN_ONLY_PAGES.includes(pageName) || isAdminUser(user)) return true;
  sessionStorage.setItem("accessRestrictedMessage", ACCESS_RESTRICTED_MESSAGE);
  window.location.href = "my-card.html";
  return false;
}

function renderRoleNavigation(user) {
  const nav = document.querySelector(".sidebar nav");
  if (!nav) return;
  const links = isAdminUser(user)
    ? [
        ["dashboard.html", "Dashboard"],
        ["my-card.html", "My Identity"],
        ["users.html", "Users"],
        ["logs.html", "Logs"],
        ["reports.html", "Reports"],
        ["requests.html", "Requests"],
        ["security.html", "Security"]
      ]
    : [
        ["my-card.html", "My Identity"],
        ["messages.html", "My Messages"]
      ];
  const currentFile = `${location.pathname.split("/").pop() || "dashboard.html"}`;
  nav.innerHTML = links.map(([href, label]) => `<a href="${href}" class="${href === currentFile ? "active" : ""}">${label}</a>`).join("");
  const logo = document.querySelector(".sidebar .logo");
  if (logo) logo.href = getRoleHomePage(user);
}

function showAccessRestrictionMessage() {
  const message = sessionStorage.getItem("accessRestrictedMessage");
  if (!message) return;
  sessionStorage.removeItem("accessRestrictedMessage");
  showPageError(message);
}

function initAuth() {
  db?.auth.getSession().then(async ({ data }) => {
    if (data.session?.user) {
      data.session.user.smartPassCard = await getUserCard(data.session.user);
      redirectToRoleHome(data.session.user);
    }
  });

  showAuthRedirectMessage();
  $("userLoginForm")?.addEventListener("submit", userLogin);
  $("adminLoginForm")?.addEventListener("submit", adminLogin);
  $("registerForm")?.addEventListener("submit", register);
  $("personalAccessCode")?.addEventListener("input", sanitizeAccessCode);
  $("adminPersonalAccessCode")?.addEventListener("input", sanitizeAccessCode);
}

function initLoginPage() {
  initAuth();
}

function sanitizeAccessCode(event) {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showAuthRedirectMessage() {
  const message = sessionStorage.getItem("authMessage");
  if (!message) return;
  sessionStorage.removeItem("authMessage");
  setMessage("authMessage", message);
}
