var messagesCache = [];

async function initMessagesPage(user) {
  if (document.body.dataset.page !== "messages") return;
  $("refreshMessagesBtn")?.addEventListener("click", () => loadMessages(user));
  $("messagesList")?.addEventListener("click", openMessageCard);
  return loadMessages(user);
}

async function loadMessages(user) {
  setMessage("messagesStatus", "Loading...");
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
