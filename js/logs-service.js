async function getLogs() {
  const { data, error } = await requireDb()
    .from("access_logs")
    .select(LOG_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

async function fetchLogs() {
  return getLogs();
}

async function fetchQrLogsForCard(card) {
  const email = String(card?.email || "").toLowerCase();
  const uid = card?.uid || "";
  if (!email && !uid) return [];

  let query = requireDb()
    .from("access_logs")
    .select(LOG_SELECT)
    .in("result", ["approved", "rejected", "expired"])
    .order("created_at", { ascending: false })
    .limit(100);

  const filters = [];
  if (email) filters.push(`email.eq.${email}`);
  if (uid) {
    filters.push(`uid.eq.${uid}`);
    filters.push(`card_uid.eq.${uid}`);
  }
  query = query.or(filters.join(","));

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter((log) => {
    const logEmail = String(log.email || "").toLowerCase();
    return logEmail === email || log.uid === uid || log.card_uid === uid;
  });
}

async function insertAccessLog(session, card, result, eventType = DEFAULT_LOCATION, deviceLabel = getDeviceLabel()) {
  const row = {
    uid: session?.uid || card?.uid || "-",
    card_uid: session?.uid || card?.uid || "-",
    email: card?.email || "-",
    result,
    device: deviceLabel,
    location: eventType
  };
  const { error } = await requireDb().from("access_logs").insert(row);
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
    }
  }
  await logActivity(eventType, { email: email || "-", uid, ...extra });
}
