import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Password reset service is not configured." }, 500);
  }

  let payload: { email?: string; accessCode?: string; newPassword?: string };
  try {
    payload = await req.json();
  } catch (_error) {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const accessCode = String(payload.accessCode || "").trim();
  const newPassword = String(payload.newPassword || "");

  if (!email) return jsonResponse({ error: "Please enter your email." }, 400);
  if (!accessCode) return jsonResponse({ error: "Please enter your personal access code." }, 400);
  if (newPassword.length < 6) return jsonResponse({ error: "Password must be at least 6 characters." }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data: card, error: cardError } = await adminClient
    .from("cards")
    .select("user_id,email,access_code,status")
    .eq("email", email)
    .maybeSingle();

  if (cardError) return jsonResponse({ error: "Could not verify account." }, 500);
  if (!card) return jsonResponse({ error: "No account found for this email." }, 404);
  if (card.access_code !== accessCode) return jsonResponse({ error: "Invalid personal access code." }, 403);
  if (card.status === "blocked") return jsonResponse({ error: "This account is blocked. Contact support." }, 403);
  if (card.status !== "active") return jsonResponse({ error: "This account is not active. Contact support." }, 403);
  if (!card.user_id) return jsonResponse({ error: "No login account is linked to this email." }, 404);

  const { error: updateError } = await adminClient.auth.admin.updateUserById(card.user_id, {
    password: newPassword
  });

  if (updateError) {
    return jsonResponse({ error: "Could not update password." }, 500);
  }

  return jsonResponse({ success: true });
});
