async function getUserCard(user) {
  const { data, error } = await requireDb()
    .from("cards")
    .select(CARD_SELECT)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function generatePersonalAccessCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0");
}

async function generateUniquePersonalAccessCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const accessCode = generatePersonalAccessCode();
    const { data, error } = await requireDb()
      .from("cards")
      .select("id")
      .eq("access_code", accessCode)
      .limit(1);
    if (error) throw error;
    if (!data?.length) return accessCode;
  }
  throw new Error("Could not generate a unique access code. Please try again.");
}

async function createUserCard(user, suppliedName) {
  const fullName = suppliedName || user.user_metadata?.full_name || user.email.split("@")[0];
  const record = {
    user_id: user.id,
    email: user.email,
    full_name: fullName,
    uid: generateUid(),
    role: "student",
    status: "active",
    access_code: await generateUniquePersonalAccessCode()
  };
  const { data, error } = await requireDb()
    .from("cards")
    .insert(record)
    .select(CARD_SELECT)
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
  const { data: byUserId, error: userError } = await requireDb()
    .from("cards")
    .select(CARD_SELECT)
    .eq("user_id", userId)
    .limit(1);
  if (userError) throw userError;
  if (byUserId?.length) return byUserId[0];

  const { data: byEmail, error: emailError } = await requireDb()
    .from("cards")
    .select(CARD_SELECT)
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
    status: "active",
    access_code: await generateUniquePersonalAccessCode()
  };
  const { data, error } = await requireDb()
    .from("cards")
    .insert(record)
    .select(CARD_SELECT)
    .single();
  if (error) throw error;
  return data;
}

async function fetchCardByUid(uid) {
  const { data, error } = await requireDb()
    .from("cards")
    .select(CARD_SELECT)
    .eq("uid", uid)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchCards() {
  const { data, error } = await requireDb()
    .from("cards")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function updateUserCardField(cardId, field, value) {
  const { error } = await requireDb().from("cards").update({ [field]: value }).eq("id", cardId);
  if (error) throw error;
}

async function regenerateUserAccessCode(cardId) {
  const accessCode = await generateUniquePersonalAccessCode();
  const { error } = await requireDb().from("cards").update({ access_code: accessCode }).eq("id", cardId);
  if (error) throw error;
  return accessCode;
}

async function createStandaloneUserCard(record) {
  const { error } = await requireDb().from("cards").insert(record);
  if (error) throw error;
}

async function fetchCardByEmail(email) {
  const { data, error } = await requireDb()
    .from("cards")
    .select(CARD_SELECT)
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data;
}
