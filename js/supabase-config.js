if (!window.NFC_SUPABASE) {
  console.warn("[SmartPass] js/supabase-config.js is deprecated. Load js/config.js for Supabase settings.");
}

window.QR_ACCESS_CONFIG = window.NFC_SUPABASE;
