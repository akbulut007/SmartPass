const CARD_SELECT = "id,user_id,email,full_name,uid,role,status,access_code,created_at";
const SESSION_SELECT = "id,user_id,uid,status,created_at,expires_at,device,approved_at";
const LOG_SELECT = "id,uid,card_uid,email,result,device,location,created_at";

function requireDb() {
  if (!db) throw new Error("Supabase client is not available.");
  return db;
}
