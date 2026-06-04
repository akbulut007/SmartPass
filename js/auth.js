const ADMIN_ACCOUNTS = {
  "yusufakbulut522@gmail.com": "9999",
  "muhammed25yusuf@gmail.com": "1010"
};
const ADMIN_EMAILS = Object.keys(ADMIN_ACCOUNTS);
const ADMIN_EMAIL = ADMIN_EMAILS[0];
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
  return ADMIN_EMAILS.includes(user?.email?.trim().toLowerCase()) ? "admin" : "student";
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
  $("personalAccessCode")?.addEventListener("input", sanitizeAccessCode);
  $("adminAccessCode")?.addEventListener("input", sanitizeAccessCode);
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
  if (ADMIN_EMAILS.includes(email)) {
    await logActivity("user_login_failed", { email, location: "user_login_failed" });
    return setMessage("authMessage", "Please use Admin Login.", "error");
  }

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
    if (!card?.access_code) {
      await logActivity("user_login_failed", { email: user.email, location: "user_login_failed" });
      await db.auth.signOut();
      return setMessage("authMessage", "No access code assigned. Contact administrator.", "error");
    }
    if (card.access_code !== code) {
      await logActivity("user_login_failed", { email: user.email, uid: card.uid, location: "user_login_failed" });
      await db.auth.signOut();
      return setMessage("authMessage", "Invalid personal access code.", "error");
    }
    if (card?.status === "blocked") {
      await logActivity("blocked_user_login_attempt", { email: user.email, uid: card.uid, location: "blocked_user_login_attempt" });
      await db.auth.signOut();
      return setMessage("authMessage", "Your account has been blocked by administrator.", "error");
    }
    await logActivity("user_login_success", { email: user.email, uid: card.uid, location: "user_login_success" });
  } catch (error) {
    await db.auth.signOut();
    return setMessage("authMessage", readableDbError(error), "error");
  }
  window.location.href = "my-card.html";
}

async function adminLogin(event) {
  event.preventDefault();
  const email = $("adminLoginEmail").value.trim().toLowerCase();
  const expectedAdminEmail = email;
  const expectedAdminCode = ADMIN_ACCOUNTS[email];
  const code = $("adminAccessCode")?.value.trim() || "";
  const codeMatches = code === expectedAdminCode;
  console.log("[SmartPass] Admin login input email:", email);
  console.log("[SmartPass] Admin login expected admin email:", expectedAdminEmail || "-");
  console.log("[SmartPass] Admin login code match:", codeMatches);

  if (!expectedAdminCode) {
    await logActivity("admin_login_failed", { email, location: "admin_login_failed" });
    return setMessage("authMessage", "Access denied", "error");
  }
  if (!codeMatches) {
    await logActivity("admin_login_failed", { email, location: "admin_login_failed" });
    return setMessage("authMessage", "Invalid admin code", "error");
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
  const user = data.user || await getCurrentUser();
  if (user?.email?.trim().toLowerCase() !== expectedAdminEmail) {
    await logAuthActivity("admin_login_failed", user, { location: "admin_login_failed" });
    await db.auth.signOut();
    return setMessage("authMessage", "Access denied", "error");
  }
  await logAuthActivity("admin_login_success", user, { location: "admin_login_success" });
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
  if (ADMIN_EMAILS.includes(email.toLowerCase())) return setMessage("authMessage", "Administrator account cannot be created here.", "error");

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
    setMessage("authMessage", `Registration successful. Your personal access code is: ${accessCode}. Save this code. You will need it when logging in.`);
    setTimeout(() => {
      window.location.href = "user-login.html";
    }, 8000);
  } catch (error) {
    setMessage("authMessage", readableDbError(error), "error");
  }
}
