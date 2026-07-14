// Booking handoff. Only a non-blank https:// URL is safe to use; anything
// else (blank config, http, javascript:, malformed) stays inactive.
export function safeBookingUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  return url.protocol === "https:" ? url.href : null;
}
