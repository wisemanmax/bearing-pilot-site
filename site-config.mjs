// Single switch for the First Bearing booking handoff.
//
// Leave this blank while the legal disposition in
// Notes/domain-legal-review.md is PENDING. When it is CLEAR, set it to the
// https:// URL of the public booking calendar. Never put the PILOT-01
// consultation URL (or any client meeting URL) here — this value ships to
// every visitor's browser.
export const bookingUrl = "";

// Supabase backend for public, WRITE-ONLY submissions (contact messages, First
// Bearing assessment receipts, anonymized First Look scores). The publishable
// key is designed to ship in client code; row-level security on the bearing_*
// tables grants INSERT only, so nothing can be read back with this key. Blank
// values disable every submission feature gracefully (same pattern as
// bookingUrl). Schema: supabase/migrations/0001_bearing_public_intake.sql —
// features stay dormant until that migration is applied to the project.
export const supabaseUrl = "https://rxkawusddqtfxmkwgpsj.supabase.co";
export const supabaseKey = "sb_publishable_ap8ppxtgu6C3xtU7NCIzcg_7440J7av";

export const contactEndpoint = "";
