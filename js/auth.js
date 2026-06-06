const ADMIN_ONLY_PAGES = ["dashboard", "users", "logs", "reports", "requests", "security"];
const ACCESS_RESTRICTED_MESSAGE = "Administrator access required.";
const PUBLIC_REGISTRATION_ROLES = ["student", "staff", "visitor"];
const PASSWORD_RESET_REDIRECT_URL = "https://akbulut007.github.io/NFC1/reset-password.html";

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
  initPasswordResetModal();
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

function initPasswordResetModal() {
  document.querySelectorAll("[data-open-password-reset]").forEach((button) => {
    button.addEventListener("click", openPasswordResetModal);
  });
}

function ensurePasswordResetModal() {
  let modal = $("passwordResetModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "passwordResetModal";
  modal.className = "access-request-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="access-request-backdrop" data-close-password-reset></div>
    <section class="access-request-panel glass-panel" role="dialog" aria-modal="true" aria-labelledby="passwordResetTitle">
      <div class="access-request-header">
        <div>
          <p class="eyebrow">SmartPass</p>
          <h2 id="passwordResetTitle">Reset Password</h2>
        </div>
        <button class="ghost-btn request-close-btn" type="button" data-close-password-reset>Close</button>
      </div>
      <form id="passwordResetForm" class="access-request-form" novalidate>
        <label>Email
          <input type="email" id="passwordResetEmail" required autocomplete="email" placeholder="name@example.com">
        </label>
        <button class="primary-btn" type="submit">Send Reset Link</button>
        <p id="passwordResetMessage" class="form-message" aria-live="polite"></p>
      </form>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-password-reset]").forEach((button) => {
    button.addEventListener("click", closePasswordResetModal);
  });
  modal.querySelector("#passwordResetForm")?.addEventListener("submit", submitPasswordResetRequest);
  return modal;
}

function openPasswordResetModal() {
  const modal = ensurePasswordResetModal();
  const loginEmail = $("userLoginEmail")?.value || $("adminLoginEmail")?.value || "";
  $("passwordResetEmail").value = loginEmail.trim().toLowerCase();
  setMessage("passwordResetMessage", "");
  modal.hidden = false;
  $("passwordResetEmail")?.focus();
}

function closePasswordResetModal() {
  const modal = $("passwordResetModal");
  if (modal) modal.hidden = true;
}

async function submitPasswordResetRequest(event) {
  event.preventDefault();
  const email = $("passwordResetEmail")?.value.trim().toLowerCase() || "";
  if (!email) return setMessage("passwordResetMessage", "Please enter your email.", "error");
  if (!isValidEmail(email)) return setMessage("passwordResetMessage", "Please enter a valid email address.", "error");
  if (!db) return setMessage("passwordResetMessage", "Configure Supabase first.", "error");

  setMessage("passwordResetMessage", "Sending reset link...");
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: PASSWORD_RESET_REDIRECT_URL
  });
  if (error) return setMessage("passwordResetMessage", error.message, "error");
  setMessage("passwordResetMessage", "Password reset link sent. Check your email.");
}

function initResetPasswordPage() {
  $("resetPasswordForm")?.addEventListener("submit", submitNewPassword);
}

async function submitNewPassword(event) {
  event.preventDefault();
  const newPassword = $("newPassword")?.value || "";
  const confirmPassword = $("confirmNewPassword")?.value || "";
  if (!newPassword) return setMessage("resetPasswordMessage", "Please enter a new password.", "error");
  if (newPassword.length < 6) return setMessage("resetPasswordMessage", "Password must be at least 6 characters.", "error");
  if (newPassword !== confirmPassword) return setMessage("resetPasswordMessage", "Passwords do not match.", "error");
  if (!db) return setMessage("resetPasswordMessage", "Configure Supabase first.", "error");

  setMessage("resetPasswordMessage", "Updating password...");
  const { error } = await db.auth.updateUser({ password: newPassword });
  if (error) return setMessage("resetPasswordMessage", error.message, "error");
  await db.auth.signOut();
  setMessage("resetPasswordMessage", "Password updated. You can now log in.");
  setTimeout(() => {
    window.location.href = "user-login.html";
  }, 1800);
}
