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

function initAuth() {
  db?.auth.getSession().then(({ data }) => {
    if (data.session?.user) window.location.href = "dashboard.html";
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
  $("personalAccessCode")?.addEventListener("input", sanitizePersonalAccessCode);
  $("signupForm")?.addEventListener("submit", register);
}

function initLoginPage() {
  initAuth();
}

function sanitizePersonalAccessCode(event) {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
}

async function login(event) {
  event.preventDefault();
  if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");

  setMessage("authMessage", "Signing in...");
  const enteredAccessCode = $("personalAccessCode")?.value.trim() || "";
  const { data, error } = await db.auth.signInWithPassword({
    email: $("loginEmail").value.trim(),
    password: $("loginPassword").value
  });
  if (error) return setMessage("authMessage", error.message, "error");
  try {
    const card = await getUserCard(data.user);
    const assignedAccessCode = card?.access_code?.trim();
    if (!assignedAccessCode) {
      await db.auth.signOut();
      return setMessage("authMessage", "No personal access code assigned. Contact administrator.", "error");
    }
    if (enteredAccessCode !== assignedAccessCode) {
      await db.auth.signOut();
      return setMessage("authMessage", "Invalid personal access code.", "error");
    }
  } catch (error) {
    await db.auth.signOut();
    return setMessage("authMessage", readableDbError(error), "error");
  }
  window.location.href = "dashboard.html";
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
    window.location.href = "dashboard.html";
  } catch (error) {
    setMessage("authMessage", readableDbError(error), "error");
  }
}
