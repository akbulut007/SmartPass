async function initSecurityPage() {
  if (document.body.dataset.page !== "security") return;
  $("refreshSecurityBtn")?.addEventListener("click", runSecurityChecks);
  return runSecurityChecks();
}

async function runSecurityChecks() {
  setAllSecurityCardsLoading();
  const results = await Promise.all([
    checkSupabaseAuth(),
    checkCloudDatabase(),
    checkOrganizationCode(),
    checkAdminPortal(),
    checkQrApproval(),
    checkBlockedUserProtection()
  ]);
  results.forEach(({ key, status, state }) => updateSecurityCard(key, status, state));
  setText("securityLastChecked", `Last checked: ${new Intl.DateTimeFormat("en", { timeStyle: "medium" }).format(new Date())}`);
}

function setAllSecurityCardsLoading() {
  document.querySelectorAll("[data-security-check]").forEach((card) => {
    setSecurityCardState(card, "Loading", "neutral");
  });
}

async function checkSupabaseAuth() {
  if (!db?.auth?.getSession) return securityResult("supabaseAuth", "Offline", "danger");
  try {
    const { error } = await db.auth.getSession();
    return securityResult("supabaseAuth", error ? "Offline" : "Connected", error ? "danger" : "online");
  } catch (error) {
    return securityResult("supabaseAuth", "Offline", "danger");
  }
}

async function checkCloudDatabase() {
  if (!db) return securityResult("cloudDatabase", "Error", "danger");
  try {
    const { error } = await db.from("cards").select("id").limit(1);
    return securityResult("cloudDatabase", error ? "Error" : "Ready", error ? "danger" : "online");
  } catch (error) {
    return securityResult("cloudDatabase", "Error", "danger");
  }
}

function checkOrganizationCode() {
  const enabled = typeof ORGANIZATION_ACCESS_CODE !== "undefined" && ORGANIZATION_ACCESS_CODE === "5545";
  return securityResult("organizationCode", enabled ? "Enabled" : "Missing", enabled ? "online" : "warning");
}

function checkAdminPortal() {
  const protectedPortal =
    typeof ADMIN_ACCESS_CODE !== "undefined" &&
    ADMIN_ACCESS_CODE === "9999" &&
    typeof ADMIN_EMAIL !== "undefined" &&
    Boolean(ADMIN_EMAIL);
  return securityResult("adminPortal", protectedPortal ? "Protected" : "Not configured", protectedPortal ? "online" : "warning");
}

async function checkQrApproval() {
  if (!db) return securityResult("qrApproval", "Error", "danger");
  try {
    const { error } = await db.from("approval_sessions").select("id").limit(1);
    return securityResult("qrApproval", error ? "Error" : "Enabled", error ? "danger" : "online");
  } catch (error) {
    return securityResult("qrApproval", "Error", "danger");
  }
}

async function checkBlockedUserProtection() {
  if (!db) return securityResult("blockedUsers", "Error", "danger");
  try {
    const { error } = await db.from("cards").select("id").eq("status", "blocked").limit(1);
    return securityResult("blockedUsers", error ? "Error" : "Protected", error ? "danger" : "online");
  } catch (error) {
    return securityResult("blockedUsers", "Error", "danger");
  }
}

function securityResult(key, status, state) {
  return { key, status, state };
}

function updateSecurityCard(key, status, state) {
  const card = document.querySelector(`[data-security-check="${key}"]`);
  if (!card) return;
  setSecurityCardState(card, status, state);
}

function setSecurityCardState(card, status, state) {
  const dot = card.querySelector(".status-dot");
  const text = card.querySelector("p");
  if (dot) dot.className = `status-dot ${state}`;
  if (text) {
    text.textContent = status;
    text.style.setProperty("color", securityStateColor(state), "important");
  }
}

function securityStateColor(state) {
  if (state === "online") return "var(--green)";
  if (state === "warning") return "var(--amber)";
  if (state === "danger") return "var(--red)";
  return "var(--muted)";
}
