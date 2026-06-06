const USER_LOGIN_ADMIN_EMAILS = new Set([
  "yusufakbulut522@gmail.com",
  "muhammed25yusuf@gmail.com"
]);

async function userLogin(event) {
  event.preventDefault();
  const code = $("personalAccessCode")?.value.trim() || "";
  const email = $("userLoginEmail").value.trim().toLowerCase();
  const password = $("userLoginPassword").value;
  if (!email) {
    await logActivity("user_login_failed", { email, location: "user_login_failed" });
    return setMessage("authMessage", "Please enter your email.", "error");
  }
  if (!password) {
    await logActivity("user_login_failed", { email, location: "user_login_failed" });
    return setMessage("authMessage", "Please enter your password.", "error");
  }
  if (!code) {
    await logActivity("user_login_failed", { email, location: "user_login_failed" });
    return setMessage("authMessage", "Please enter personal access code.", "error");
  }
  if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");
  if (USER_LOGIN_ADMIN_EMAILS.has(email)) {
    return rejectAdminUserLogin(email);
  }

  setMessage("authMessage", "Signing in...");
  const { error } = await db.auth.signInWithPassword({
    email,
    password
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

async function rejectAdminUserLogin(email) {
  await logActivity("user_login_failed", { email, location: "admin_login_required" });
  await db.auth.signOut();
  renderAdminLoginRequiredMessage();
}

function renderAdminLoginRequiredMessage() {
  const el = $("authMessage");
  if (!el) return;
  el.className = "form-message error";
  el.innerHTML = `
    <span>Admin accounts must use the Admin Login page.</span>
    <a class="admin-portal-link" href="admin-login.html">Go to Admin Login</a>
  `;
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

async function register(event) {
  event.preventDefault();
  if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");
  const fullName = $("registerName").value.trim();
  const email = $("registerEmail").value.trim();
  const role = PUBLIC_REGISTRATION_ROLES.includes($("registerUserType")?.value) ? $("registerUserType").value : "student";
  const password = $("registerPassword").value;
  const confirmPassword = $("registerConfirmPassword").value;
  if (!fullName) return setMessage("authMessage", "Please enter your full name.", "error");
  if (!email) return setMessage("authMessage", "Please enter your email.", "error");
  if (!isValidEmail(email)) return setMessage("authMessage", "Please enter a valid email address.", "error");
  if (!password) return setMessage("authMessage", "Please enter your password.", "error");
  if (!confirmPassword) return setMessage("authMessage", "Please confirm your password.", "error");
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
      role,
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
