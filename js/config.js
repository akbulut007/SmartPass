window.NFC_SUPABASE = window.NFC_SUPABASE || {
  url: "https://ysepwkkqcnzeolmpepgv.supabase.co",
  anonKey: "sb_publishable_HcqSJoqa5jNz_81LL2ErOg_L651xIVG"
};

window.QR_ACCESS_CONFIG = window.QR_ACCESS_CONFIG || window.NFC_SUPABASE;

var cfg = window.NFC_SUPABASE || window.QR_ACCESS_CONFIG || {};
var isConfigured = cfg.url && cfg.anonKey && !cfg.url.includes("YOUR_") && !cfg.anonKey.includes("YOUR_");
var db = isConfigured && window.supabase ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
