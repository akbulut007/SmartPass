async function initDashboard() {
  if (document.body.dataset.page !== "dashboard") return;
  return loadDashboard();
}

async function loadDashboard() {
  const [cards, sessions, logs] = await safeDataLoad(() => Promise.all([fetchCards(), fetchSessions(), fetchLogs()]), [[], [], []]);
  const counts = countStatuses(sessions);
  setText("totalUsers", cards.length);
  setText("activeIdentities", cards.filter((card) => card.status === "active").length);
  setText("pendingApprovals", counts.waiting);
  setText("approvedSessions", counts.approved);
  setText("rejectedSessions", counts.rejected);
  setText("expiredSessions", counts.expired);
  setText("approvedLogins", counts.approved);
  setText("deniedLogins", counts.rejected);
  setText("activeSessions", counts.waiting);
  renderLatestApproval(logs[0]);
  renderRecentApprovals(logs.slice(0, 8));
}

function renderLatestApproval(latest) {
  if (!$("latestAuth")) return;
  $("latestAuth").innerHTML = latest ? `
    <div class="event-card ${normalizeResult(latest.result)}">
      <strong>${escapeHtml(String(latest.result).toUpperCase())}</strong>
      <span>${escapeHtml(latest.email || "Unknown user")} via ${escapeHtml(latest.device || "Unknown device")}</span>
      <small>${escapeHtml(latest.uid || latest.card_uid || "-")} - ${escapeHtml(latest.location || DEFAULT_LOCATION)} - ${formatDate(latest.created_at)}</small>
    </div>` : "No approval logs yet.";
}

function renderRecentApprovals(logs) {
  const target = $("recentApprovals");
  if (!target) return;
  target.innerHTML = logs.map((log) => {
    const result = normalizeResult(log.result);
    return `
      <div class="mini-event ${result}">
        <span class="status-dot ${dotClass(result)}"></span>
        <div>
          <strong>${escapeHtml(log.email || "Unknown")}</strong>
          <small>${escapeHtml(log.uid || log.card_uid || "-")} - ${formatDate(log.created_at)}</small>
        </div>
        <b>${escapeHtml(result.toUpperCase())}</b>
      </div>`;
  }).join("") || `<p>No recent activity.</p>`;
}

function initUsers() {
  if (document.body.dataset.page !== "users") return;
  $("refreshUsersBtn")?.addEventListener("click", loadUsersTable);
  $("usersTable")?.addEventListener("input", sanitizeAccessCodeInput);
  $("usersTable")?.addEventListener("click", handleUsersTableClick);
  loadUsersTable();
}

async function loadUsersTable() {
  setMessage("userFormMessage", "Loading registered identities...");
  const cards = await safeDataLoad(fetchCards, []);
  $("usersTable").innerHTML = cards.map((card) => `
    <tr>
      <td>${escapeHtml(card.full_name)}</td>
      <td>${escapeHtml(card.email)}</td>
      <td>${escapeHtml(card.uid)}</td>
      <td><select class="table-select" data-card-id="${card.id}" data-field="role">${["student", "admin", "visitor", "employee"].map((role) => `<option value="${role}" ${role === card.role ? "selected" : ""}>${title(role)}</option>`).join("")}</select></td>
      <td><select class="table-select ${card.status}" data-card-id="${card.id}" data-field="status">${["active", "blocked"].map((status) => `<option value="${status}" ${status === card.status ? "selected" : ""}>${title(status)}</option>`).join("")}</select></td>
      <td>
        <div class="access-code-control">
          <input class="table-input access-code-input" data-card-id="${card.id}" data-field="access_code" type="text" inputmode="numeric" maxlength="4" placeholder="0000" value="${escapeHtml(card.access_code || "")}">
          <button class="ghost-btn generate-code-btn" data-card-id="${card.id}" type="button">Generate Code</button>
        </div>
      </td>
      <td>${formatDate(card.created_at)}</td>
      <td><button class="primary-btn save-user-btn" data-card-id="${card.id}" type="button">Save Changes</button></td>
    </tr>`).join("") || `<tr><td colspan="8">No digital identities found.</td></tr>`;
  setMessage("userFormMessage", cards.length ? `${cards.length} registered identities loaded.` : "No registered identities found.");
}

function sanitizeAccessCodeInput(event) {
  const input = event.target.closest(".access-code-input");
  if (!input) return;
  input.value = input.value.replace(/\D/g, "").slice(0, 4);
}

function generatePersonalAccessCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

async function handleUsersTableClick(event) {
  const generateButton = event.target.closest(".generate-code-btn");
  if (generateButton) {
    const input = document.querySelector(`.access-code-input[data-card-id="${generateButton.dataset.cardId}"]`);
    if (input) input.value = generatePersonalAccessCode();
    return;
  }

  const saveButton = event.target.closest(".save-user-btn");
  if (!saveButton) return;
  const cardId = saveButton.dataset.cardId;
  const roleSelect = document.querySelector(`select[data-card-id="${cardId}"][data-field="role"]`);
  const statusSelect = document.querySelector(`select[data-card-id="${cardId}"][data-field="status"]`);
  const accessCodeInput = document.querySelector(`.access-code-input[data-card-id="${cardId}"]`);
  const accessCode = (accessCodeInput?.value || "").replace(/\D/g, "").slice(0, 4);

  saveButton.disabled = true;
  setMessage("userFormMessage", "Updating identity...");
  try {
    await updateUserCard(cardId, {
      role: roleSelect?.value,
      status: statusSelect?.value,
      access_code: accessCode || null
    });
  } catch (error) {
    saveButton.disabled = false;
    return showPageError(readableDbError(error));
  }
  if (statusSelect) statusSelect.className = `table-select ${statusSelect.value}`;
  saveButton.disabled = false;
  await loadUsersTable();
  setMessage("userFormMessage", "Identity updated successfully.");
}

function countStatuses(sessions) {
  return sessions.reduce((acc, session) => {
    const status = normalizeResult(session.status);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { waiting: 0, approved: 0, rejected: 0, expired: 0 });
}
