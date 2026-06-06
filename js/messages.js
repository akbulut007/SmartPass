var messagesCache = [];
var messageBoxUser = null;

function initMessageBoxPage() {
  if (document.body.dataset.page !== "message-box") return;
  $("messageBoxLoginForm")?.addEventListener("submit", loginToMessageBox);
  $("refreshMessagesBtn")?.addEventListener("click", () => loadMessageBoxMessages(messageBoxUser));
  $("messagesList")?.addEventListener("click", openMessageCard);
  $("backToUserLoginLink")?.addEventListener("click", backToUserLogin);
}

async function backToUserLogin(event) {
  event.preventDefault();
  if (db) await db.auth.signOut();
  window.location.href = "user-login.html";
}

async function loginToMessageBox(event) {
  event.preventDefault();
  const email = $("messageBoxEmail")?.value.trim().toLowerCase() || "";
  const password = $("messageBoxPassword")?.value || "";
  if (!email) return setMessage("messagesStatus", "Please enter your email.", "error");
  if (!password) return setMessage("messagesStatus", "Please enter your password.", "error");
  if (!db) return setMessage("messagesStatus", "Configure Supabase first.", "error");

  setMessage("messagesStatus", "Opening message box...");
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return setMessage("messagesStatus", error.message, "error");

  messageBoxUser = data.user || await getCurrentUser();
  if (!messageBoxUser) return setMessage("messagesStatus", "Login failed. User record was not returned.", "error");
  $("messageBoxLoginForm").hidden = true;
  $("messageInboxPanel").hidden = false;
  await loadMessageBoxMessages(messageBoxUser);
}

async function loadMessageBoxMessages(user) {
  if (!user) return;
  setMessage("messagesStatus", "Loading messages...");
  messagesCache = await safeDataLoad(() => fetchUserMessages(user), []);
  renderMessages();
}

function renderMessages() {
  const list = $("messagesList");
  if (!list) return;
  if (!messagesCache.length) {
    list.innerHTML = `<p class="empty-state">No messages yet.</p>`;
    setMessage("messagesStatus", "No messages yet.");
    return;
  }

  list.innerHTML = messagesCache.map((message) => `
    <article class="message-card ${message.is_read ? "read" : "unread"}" data-message-id="${message.id}">
      <button class="message-card-toggle" type="button" aria-expanded="false">
        <span>
          <strong>${escapeHtml(message.subject)}</strong>
          <small>${formatDate(message.created_at)}</small>
        </span>
        <span class="badge ${message.is_read ? "reviewed" : "pending"}">${message.is_read ? "READ" : "UNREAD"}</span>
      </button>
      <div class="message-card-body" hidden>
        <p>${escapeHtml(message.message)}</p>
      </div>
    </article>
  `).join("");
  setMessage("messagesStatus", `Showing ${messagesCache.length} message${messagesCache.length === 1 ? "" : "s"}.`);
}

async function openMessageCard(event) {
  const button = event.target.closest(".message-card-toggle");
  if (!button) return;
  const card = button.closest("[data-message-id]");
  const body = card?.querySelector(".message-card-body");
  const message = messagesCache.find((item) => item.id === card?.dataset.messageId);
  if (!card || !body || !message) return;

  const isOpening = body.hidden;
  body.hidden = !isOpening;
  button.setAttribute("aria-expanded", String(isOpening));
  if (!isOpening || message.is_read) return;

  try {
    await markMessageRead(message.id);
    message.is_read = true;
    card.classList.remove("unread");
    card.classList.add("read");
    const badge = card.querySelector(".badge");
    if (badge) {
      badge.className = "badge reviewed";
      badge.textContent = "READ";
    }
  } catch (error) {
    showPageError(readableDbError(error));
  }
}
