async function createAccessRequest(record) {
  const { error } = await requireDb().from("access_requests").insert({
    full_name: record.full_name,
    email: record.email,
    reason: record.reason || null,
    request_type: record.request_type || "access_code",
    status: "pending"
  });
  if (error) throw error;
}

async function fetchPendingAccessRequestByEmail(email) {
  const { data, error } = await requireDb()
    .from("access_requests")
    .select("id,email,status")
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchAccessRequests() {
  const { data, error } = await requireDb()
    .from("access_requests")
    .select("id,full_name,email,request_type,reason,status,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function updateAccessRequestStatus(requestId, status) {
  const { error } = await requireDb().from("access_requests").update({ status }).eq("id", requestId);
  if (error) throw error;
}
