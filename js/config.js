const NFC_SUPABASE_URL = "https://mkpqsvqmlvntdhvwjalf.supabase.co";
const NFC_SUPABASE_ANON_KEY = "sb_publishable_FlCl4GbQH6jg5eJBD56DZg_n5_nd99f";

window.NFC_SUPABASE = {
  url: NFC_SUPABASE_URL,
  anonKey: NFC_SUPABASE_ANON_KEY
};

window.QR_ACCESS_CONFIG = window.NFC_SUPABASE;

var cfg = window.NFC_SUPABASE;
var isConfigured = cfg.url && cfg.anonKey && !cfg.url.includes("YOUR_") && !cfg.anonKey.includes("YOUR_");
console.log("[SmartPass] Supabase URL:", cfg.url);
console.log("[SmartPass] Supabase anon key prefix:", cfg.anonKey.slice(0, 12));
var db = isConfigured && window.supabase ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
