async function getUserCard(user) {
  const { data, error } = await db
    .from("users_cards")
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createUserCard(user, suppliedName) {
  const fullName = suppliedName || user.user_metadata?.full_name || user.email.split("@")[0];
  const record = {
    user_id: user.id,
    email: user.email,
    full_name: fullName,
    uid: generateUid(),
    role: "student",
    status: "active"
  };
  const { data, error } = await db
    .from("users_cards")
    .insert(record)
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .single();
  if (error) throw error;
  return data;
}

async function ensureUserCard(user, suppliedName) {
  const existing = await getUserCard(user);
  if (existing) return existing;
  return createUserCard(user, suppliedName);
}

async function createApprovalSession(card) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const record = {
    user_id: card.user_id,
    uid: card.uid,
    status: "waiting",
    expires_at: expiresAt,
    device: getDeviceLabel()
  };
  const { data, error } = await db
    .from("approval_sessions")
    .insert(record)
    .select("id,user_id,uid,status,created_at,expires_at,device,approved_at")
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("Session could not be created.");
  return data;
}

async function updateApprovalSession(sessionId, update) {
  const { data, error } = await db
    .from("approval_sessions")
    .update(update)
    .eq("id", sessionId)
    .select("id,status,uid,user_id,created_at,expires_at,device,approved_at")
    .single();
  if (error) throw error;
  return data;
}

async function getApprovalSession(sessionId) {
  const { data, error } = await db
    .from("approval_sessions")
    .select("id,user_id,uid,status,created_at,expires_at,device,approved_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchApprovalSession(sessionId) {
  return getApprovalSession(sessionId);
}

async function fetchCardByUid(uid) {
  const { data, error } = await db
    .from("users_cards")
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .eq("uid", uid)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchCards() {
  const { data, error } = await db
    .from("users_cards")
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchSessions() {
  const { data, error } = await db
    .from("approval_sessions")
    .select("id,user_id,uid,status,created_at,expires_at,device,approved_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

async function getLogs() {
  const { data, error } = await db
    .from("access_logs")
    .select("id,uid,card_uid,email,result,device,location,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

async function fetchLogs() {
  return getLogs();
}

async function insertAccessLog(session, card, result) {
  const row = {
    uid: session.uid,
    card_uid: session.uid,
    email: card?.email || null,
    result,
    device: getDeviceLabel(),
    location: DEFAULT_LOCATION
  };
  const { error } = await db.from("access_logs").insert(row);
  if (error) throw error;
}

async function updateUserCardField(cardId, field, value) {
  const { error } = await db.from("users_cards").update({ [field]: value }).eq("id", cardId);
  if (error) throw error;
}

async function createStandaloneUserCard(record) {
  const { error } = await db.from("users_cards").insert(record);
  if (error) throw error;
}
