const ADMIN_ONLY_PAGES = ["dashboard", "users", "logs", "reports", "security"];
const ACCESS_RESTRICTED_MESSAGE = "Administrator access required.";

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

async function userLogin(event) {
  event.preventDefault();
  const code = $("personalAccessCode")?.value.trim() || "";
  const email = $("userLoginEmail").value.trim().toLowerCase();
  if (!code) {
    await logActivity("user_login_failed", { email, location: "user_login_failed" });
    return setMessage("authMessage", "Please enter personal access code.", "error");
  }
  if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");

  setMessage("authMessage", "Signing in...");
  const { error } = await db.auth.signInWithPassword({
    email,
    password: $("userLoginPassword").value
  });
  if (error) {
    await logActivity("user_login_failed", { email, location: "user_login_failed" });
    return setMessage("authMessage", error.message, "error");
  }
  try {
    const user = await getCurrentUser();
    const card = await getUserCard(user);
    user.smartPassCard = card;
    const validationMessage = await validatePersonalAccessCode(user, card, code, "user_login_failed");
    if (validationMessage) return setMessage("authMessage", validationMessage, "error");
    await logActivity("user_login_success", { email: user.email, uid: card.uid, location: "user_login_success" });
    window.location.href = getRoleHomePage(user);
  } catch (error) {
    await db.auth.signOut();
    return setMessage("authMessage", readableDbError(error), "error");
  }
}

async function validatePersonalAccessCode(user, card, code, failedLocation) {
  if (!card?.access_code) {
    await logActivity(failedLocation, { email: user.email, uid: card?.uid, location: failedLocation });
    await db.auth.signOut();
    return "No access code assigned. Contact administrator.";
  }
  if (card.access_code !== code) {
    await logActivity(failedLocation, { email: user.email, uid: card.uid, location: failedLocation });
    await db.auth.signOut();
    return "Invalid personal access code.";
  }
  if (card.status === "blocked") {
    await logActivity("blocked_user_login_attempt", { email: user.email, uid: card.uid, location: "blocked_user_login_attempt" });
    await db.auth.signOut();
    return "Your account has been blocked by administrator.";
  }
  return "";
}

async function adminLogin(event) {
  event.preventDefault();
  const email = $("adminLoginEmail").value.trim().toLowerCase();
  const code = $("adminPersonalAccessCode")?.value.trim() || "";
  console.log("[SmartPass] Admin login input email:", email);

  if (!code) {
    await logActivity("admin_login_failed", { email, location: "admin_login_failed" });
    return setMessage("authMessage", "Please enter personal access code.", "error");
  }
  if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");

  setMessage("authMessage", "Signing in...");
  const { data, error } = await db.auth.signInWithPassword({
    email,
    password: $("adminLoginPassword").value
  });
  console.log("[SmartPass] Admin login Supabase auth success:", !error);
  if (error) {
    console.error("[ADMIN LOGIN ERROR]", error);
    await logActivity("admin_login_failed", { email, location: "admin_login_failed" });
    return setMessage("authMessage", "Invalid email or password", "error");
  }
  try {
    const user = data.user || await getCurrentUser();
    const card = await getUserCard(user);
    user.smartPassCard = card;
    const validationMessage = await validatePersonalAccessCode(user, card, code, "admin_login_failed");
    if (validationMessage) return setMessage("authMessage", validationMessage, "error");
    if (card.role !== "admin") {
      await logActivity("admin_login_failed", { email: user.email, uid: card.uid, location: "admin_login_failed" });
      await db.auth.signOut();
      return setMessage("authMessage", "Admin access required.", "error");
    }
    await logActivity("admin_login_success", { email: user.email, uid: card.uid, location: "admin_login_success" });
    window.location.href = "dashboard.html";
  } catch (error) {
    await db.auth.signOut();
    return setMessage("authMessage", readableDbError(error), "error");
  }
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

  setMessage("authMessage", "Creating user account...");
  try {
    const supabaseClient = db;
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });

    if (error) return setMessage("authMessage", error.message, "error");

    const user = data.user;
    if (!user) return setMessage("authMessage", "Registration failed. User record was not returned.", "error");

    const accessCode = await generateUniquePersonalAccessCode();
    const { error: insertError } = await supabaseClient.from("cards").insert({
      user_id: user.id,
      email: email,
      full_name: fullName,
      uid: generateUid(),
      role: "student",
      status: "active",
      access_code: accessCode
    });

    if (insertError) {
      console.error(insertError);
      const sessionUser = await getCurrentUser();
      if (sessionUser) await db.auth.signOut();
      return setMessage("authMessage", insertError.message, "error");
    }

    const card = await getUserCard(user);
    await logActivity("user_register_success", { email, uid: card?.uid, location: "user_register_success" });
    const sessionUser = await getCurrentUser();
    if (sessionUser) await db.auth.signOut();
    renderRegisterSuccess(accessCode);
    setTimeout(() => {
      window.location.href = "user-login.html";
    }, 8000);
  } catch (error) {
    setMessage("authMessage", readableDbError(error), "error");
  }
}

function renderRegisterSuccess(accessCode) {
  setMessage("authMessage", "");
  const card = $("registerSuccessCard");
  if (!card) {
    return setMessage("authMessage", `Registration successful. Your personal access code is: ${accessCode}. Save this code. You will need it when logging in.`);
  }
  card.hidden = false;
  card.innerHTML = `
    <div class="register-success-head">
      <span class="register-success-check">✓</span>
      <div>
        <h3>Registration successful</h3>
        <p>Your personal access code</p>
      </div>
    </div>
    <div class="register-access-code">${escapeHtml(accessCode)}</div>
    <p class="register-success-note">Save this code. You will need it when logging in.</p>
    <div class="register-success-actions">
      <button class="ghost-btn copy-code-btn" type="button" data-access-code="${escapeHtml(accessCode)}">Copy Code</button>
      <span>Redirecting to login...</span>
    </div>
  `;
  card.querySelector(".copy-code-btn")?.addEventListener("click", copyRegisterAccessCode);
}

async function copyRegisterAccessCode(event) {
  const button = event.currentTarget;
  const code = button.dataset.accessCode || "";
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = "Copied";
  } catch (error) {
    button.textContent = "Copy failed";
  }
}
