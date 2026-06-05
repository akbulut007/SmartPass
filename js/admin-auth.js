async function adminLogin(event) {
  event.preventDefault();
  const email = $("adminLoginEmail").value.trim().toLowerCase();
  const password = $("adminLoginPassword").value;
  const code = $("adminPersonalAccessCode")?.value.trim() || "";
  console.log("[SmartPass] Admin login input email:", email);

  if (!email) {
    await logActivity("admin_login_failed", { email, location: "admin_login_failed" });
    return setMessage("authMessage", "Please enter your email.", "error");
  }
  if (!password) {
    await logActivity("admin_login_failed", { email, location: "admin_login_failed" });
    return setMessage("authMessage", "Please enter your password.", "error");
  }
  if (!code) {
    await logActivity("admin_login_failed", { email, location: "admin_login_failed" });
    return setMessage("authMessage", "Please enter your admin access code.", "error");
  }
  if (!db) return setMessage("authMessage", "Configure Supabase first.", "error");

  setMessage("authMessage", "Signing in...");
  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
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
