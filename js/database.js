async function getUserCard(user) {
  const { data, error } = await db
    .from("cards")
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
    .from("cards")
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

async function getPublicCardByUserOrEmail(userId, email) {
  const { data: byUserId, error: userError } = await db
    .from("cards")
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .eq("user_id", userId)
    .limit(1);
  if (userError) throw userError;
  if (byUserId?.length) return byUserId[0];

  const { data: byEmail, error: emailError } = await db
    .from("cards")
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .eq("email", email)
    .limit(1);
  if (emailError) throw emailError;
  return byEmail?.[0] || null;
}

async function ensurePublicCardForRegisteredUser(user, fullName) {
  const existing = await getPublicCardByUserOrEmail(user.id, user.email);
  if (existing) return existing;
  const record = {
    user_id: user.id,
    email: user.email,
    full_name: fullName,
    uid: generateUid(),
    role: "student",
    status: "active"
  };
  const { data, error } = await db
    .from("cards")
    .insert(record)
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .single();
  if (error) throw error;
  return data;
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
    .from("cards")
    .select("id,user_id,email,full_name,uid,role,status,created_at")
    .eq("uid", uid)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchCards() {
  const { data, error } = await db
    .from("cards")
    .select("*")
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

async function insertAccessLog(session, card, result, eventType = DEFAULT_LOCATION) {
  const row = {
    uid: session?.uid || card?.uid || "-",
    card_uid: session?.uid || card?.uid || "-",
    email: card?.email || "-",
    result,
    device: getDeviceLabel(),
    location: eventType
  };
  const { error } = await db.from("access_logs").insert(row);
  if (error) throw error;
}

function resultForEvent(eventType) {
  if (eventType.includes("failed") || eventType.includes("rejected") || eventType.includes("blocked") || eventType.includes("reject")) return "rejected";
  if (eventType.includes("waiting")) return "expired";
  return "approved";
}

async function logActivity(eventType, { email = "-", uid = "-", result, device, location } = {}) {
  if (!db) return;
  const row = {
    uid: uid || "-",
    card_uid: uid || "-",
    email: email || "-",
    result: result || resultForEvent(eventType),
    device: device || getDeviceLabel(),
    location: location || eventType || "-"
  };
  try {
    await db.from("access_logs").insert(row);
  } catch (error) {
    console.warn("[SmartPass] Activity log failed", error);
  }
}

async function logAuthActivity(eventType, userOrEmail, extra = {}) {
  const email = typeof userOrEmail === "string" ? userOrEmail : userOrEmail?.email;
  let uid = extra.uid || "-";
  if (userOrEmail && typeof userOrEmail !== "string") {
    try {
      const card = await getUserCard(userOrEmail);
      uid = card?.uid || uid;
    } catch (error) {
      console.warn("[SmartPass] Activity card lookup failed", error);
    }
  }
  await logActivity(eventType, { email: email || "-", uid, ...extra });
}

async function updateUserCardField(cardId, field, value) {
  const { error } = await db.from("cards").update({ [field]: value }).eq("id", cardId);
  if (error) throw error;
}

async function createStandaloneUserCard(record) {
  const { error } = await db.from("cards").insert(record);
  if (error) throw error;
}
