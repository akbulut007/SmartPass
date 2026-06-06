async function fetchUserMessages(user) {
  const { data, error } = await requireDb()
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("email", user.email)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function markMessageRead(messageId) {
  const { error } = await requireDb()
    .from("messages")
    .update({ is_read: true })
    .eq("id", messageId);
  if (error) throw error;
}

async function sendRequestReply(request, subject, message) {
  const card = await fetchCardByEmail(request.email);

  const { error } = await requireDb().from("messages").insert({
    user_id: card?.user_id || null,
    email: request.email,
    subject,
    message,
    related_request_id: request.id,
    is_read: false
  });
  if (error) throw error;
}
