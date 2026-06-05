async function createApprovalSession(card) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const record = {
    user_id: card.user_id,
    uid: card.uid,
    status: "waiting",
    expires_at: expiresAt,
    device: getDeviceLabel()
  };
  const { data, error } = await requireDb()
    .from("approval_sessions")
    .insert(record)
    .select(SESSION_SELECT)
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("Session could not be created.");
  return data;
}

async function updateApprovalSession(sessionId, update) {
  const { data, error } = await requireDb()
    .from("approval_sessions")
    .update(update)
    .eq("id", sessionId)
    .eq("status", "waiting")
    .select(SESSION_SELECT)
    .single();
  if (error) throw error;
  return data;
}

async function getApprovalSession(sessionId) {
  const { data, error } = await requireDb()
    .from("approval_sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchApprovalSession(sessionId) {
  return getApprovalSession(sessionId);
}

async function fetchSessions() {
  const { data, error } = await requireDb()
    .from("approval_sessions")
    .select(SESSION_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}
