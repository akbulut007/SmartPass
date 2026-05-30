const ORGANIZATION_ACCESS_CODE = "5545";
const ADMIN_ACCESS_CODE = "9999";
const ADMIN_EMAIL = "yusufakbulut522@gmail.com";
const ADMIN_ONLY_PAGES = ["dashboard", "users", "logs", "reports", "security"];
const ACCESS_RESTRICTED_MESSAGE = "Administrator access required.";

function bindLogout() {
  const btn = $("logoutBtn");
  if (!btn) return;
  btn.addEventListener("click", logout);
}

async function logout() {
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
  return user?.email?.toLowerCase() === ADMIN_EMAIL ? "admin" : "student";
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
        ["security.html", "Security"]
      ]
    : [["my-card.html", "My Identity"]];
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
  db?.auth.getSession().then(({ data }) => {
    if (data.session?.user) redirectToRoleHome(data.session.user);
  });

  showAuthRedirectMessage();
  $("userLoginForm")?.addEventListener("submit", userLogin);
  $("adminLoginForm")?.addEventListener("submit", adminLogin);
  $("registerForm")?.addEventListener("submit", register);
  $("organizationAccessCode")?.addEventListener("input", sanitizeOrganizationAccessCode);
  $("adminAccessCode")?.addEventListener("input", sanitizeOrganizationAccessCode);
}

function initLoginPage() {
  initAuth();
}

function sanitizeOrganizationAccessCode(event) {
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

async function userLogin(event) {
  event.preventDefault();
  const code = $("organizationAccessCode")?.value.trim() || "";
  if (!code) return setMessage("authMessage", "Please enter organization access code.", "error");
  if (code !== ORGANIZATION_ACCESS_CODE) return setMessage("authMessage", "Invalid organization access code.", "error");
  if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");
  const email = $("userLoginEmail").value.trim().toLowerCase();
  if (email === ADMIN_EMAIL) return setMessage("authMessage", "Please use Admin Login.", "error");

  setMessage("authMessage", "Signing in...");
  const { error } = await db.auth.signInWithPassword({
    email,
    password: $("userLoginPassword").value
  });
  if (error) return setMessage("authMessage", error.message, "error");
  window.location.href = "my-card.html";
}

async function adminLogin(event) {
  event.preventDefault();
  const email = $("adminLoginEmail").value.trim().toLowerCase();
  const code = $("adminAccessCode")?.value.trim() || "";
  if (email !== ADMIN_EMAIL || code !== ADMIN_ACCESS_CODE) return setMessage("authMessage", "Access denied", "error");
  if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");

  setMessage("authMessage", "Signing in...");
  const { error } = await db.auth.signInWithPassword({
    email,
    password: $("adminLoginPassword").value
  });
  if (error) return setMessage("authMessage", "Access denied", "error");
  const user = await getCurrentUser();
  if (!isAdminUser(user)) {
    await db.auth.signOut();
    return setMessage("authMessage", "Access denied", "error");
  }
  window.location.href = "dashboard.html";
}

async function register(event) {
  event.preventDefault();
  if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");
  const fullName = $("registerName").value.trim();
  const email = $("registerEmail").value.trim();
  const password = $("registerPassword").value;
  const confirmPassword = $("registerConfirmPassword").value;
  if (!fullName) return setMessage("authMessage", "Please enter your full name.", "error");
  if (!isValidEmail(email)) return setMessage("authMessage", "Please enter a valid email address.", "error");
  if (password.length < 6) return setMessage("authMessage", "Password must be at least 6 characters.", "error");
  if (password !== confirmPassword) return setMessage("authMessage", "Passwords do not match.", "error");
  if (email.toLowerCase() === ADMIN_EMAIL) return setMessage("authMessage", "Administrator account cannot be created here.", "error");

  setMessage("authMessage", "Creating user account...");
  try {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) return setMessage("authMessage", error.message, "error");
    const sessionUser = await getCurrentUser();
    if (data.user && sessionUser) await ensureUserCard(sessionUser, fullName);
    if (sessionUser) await db.auth.signOut();
    sessionStorage.setItem("authMessage", "Registration successful. Please sign in.");
    window.location.href = "user-login.html";
  } catch (error) {
    setMessage("authMessage", readableDbError(error), "error");
  }
}
