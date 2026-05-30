const ORGANIZATION_ACCESS_CODE = "5545";
const ADMIN_EMAIL = "yusufakbulut522@gmail.com";
const ADMIN_ONLY_PAGES = ["dashboard", "users", "logs", "reports", "security"];
const ACCESS_RESTRICTED_MESSAGE = "Access restricted to administrators.";

function bindLogout() {
  const btn = $("logoutBtn");
  if (!btn) return;
  btn.addEventListener("click", logout);
}

async function logout() {
  stopTimers();
  if (db) await db.auth.signOut();
  window.location.href = "index.html";
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
      window.location.href = "index.html";
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

  document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-auth-tab]").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
      btn.classList.add("active");
      $(`${btn.dataset.authTab}Form`)?.classList.add("active");
    });
  });

  $("loginForm")?.addEventListener("submit", login);
  $("organizationAccessCode")?.addEventListener("input", sanitizeOrganizationAccessCode);
  $("signupForm")?.addEventListener("submit", register);
}

function initLoginPage() {
  initAuth();
}

function sanitizeOrganizationAccessCode(event) {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
}

async function login(event) {
  event.preventDefault();
  const code = $("organizationAccessCode")?.value.trim() || "";
  if (!code) return setMessage("authMessage", "Please enter organization access code.", "error");
  if (code !== ORGANIZATION_ACCESS_CODE) return setMessage("authMessage", "Invalid organization access code.", "error");
  if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");

  setMessage("authMessage", "Signing in...");
  const { error } = await db.auth.signInWithPassword({
    email: $("loginEmail").value.trim(),
    password: $("loginPassword").value
  });
  if (error) return setMessage("authMessage", error.message, "error");
  const user = await getCurrentUser();
  redirectToRoleHome(user);
}

async function register(event) {
  event.preventDefault();
  if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");
  setMessage("authMessage", "Creating digital identity...");
  try {
    const fullName = $("signupName").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) return setMessage("authMessage", error.message, "error");
    if (data.user) await ensureUserCard(data.user, fullName);
    const { error: loginError } = await db.auth.signInWithPassword({ email, password });
    if (loginError) return setMessage("authMessage", "Account created. Disable email confirmation in Supabase Auth.", "error");
    const user = await getCurrentUser();
    redirectToRoleHome(user);
  } catch (error) {
    setMessage("authMessage", readableDbError(error), "error");
  }
}
