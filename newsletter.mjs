// "The Owner's Shortlist" — a small newsletter signup card, McKinsey-style
// owned-audience capture in the Chart Room voice. Write-only, same pattern as
// contact/booking: one INSERT with the publishable key, nothing readable back.
// The whole card stays hidden until site-config's newsletterOpen is true AND
// Supabase is configured, so nobody meets a dead form.

import { newsletterOpen, supabaseKey, supabaseUrl } from "./site-config.mjs";

export function newsletterReady(open = newsletterOpen, url = supabaseUrl, key = supabaseKey) {
  return open === true &&
    typeof url === "string" && url.trim() !== "" &&
    typeof key === "string" && key.trim() !== "";
}

export function validEmail(value) {
  return typeof value === "string" && /^\S+@\S+\.\S+$/.test(value.trim());
}

export async function submitSignup(
  payload,
  configuredUrl = supabaseUrl,
  configuredKey = supabaseKey,
  request = globalThis.fetch,
) {
  if (typeof configuredUrl !== "string" || configuredUrl.trim() === "") return false;
  if (typeof configuredKey !== "string" || configuredKey.trim() === "") return false;
  try {
    const response = await request(
      `${configuredUrl.replace(/\/+$/, "")}/rest/v1/bearing_newsletter_signups`,
      {
        method: "POST",
        headers: {
          apikey: configuredKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

if (typeof document !== "undefined") {
  const card = document.querySelector("#newsletter");
  if (card) {
    if (!newsletterReady()) {
      card.hidden = true;
    } else {
      card.hidden = false;
      const form = card.querySelector("form");
      const input = card.querySelector('input[type="email"]');
      const status = card.querySelector(".newsletter-status");
      let busy = false;

      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy) return;
        const email = (input?.value || "").trim();
        if (!validEmail(email)) {
          status.hidden = false;
          status.textContent = "That email doesn't look complete — check it and try again.";
          return;
        }
        busy = true;
        status.hidden = true;
        const ok = await submitSignup({
          email,
          source_page: location.pathname.split("/").pop() || "index.html",
          honeypot_tripped: (new FormData(form).get("company") || "").trim() !== "",
        });
        busy = false;
        status.hidden = false;
        if (ok) {
          form.hidden = true;
          status.textContent = "You're on the list. One short read at a time — unsubscribe anytime.";
        } else {
          status.textContent = "That didn't send. Please try again in a moment.";
        }
      });
    }
  }
}
