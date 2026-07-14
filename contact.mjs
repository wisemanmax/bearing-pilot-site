import { contactEndpoint, supabaseUrl, supabaseKey } from "./site-config.mjs";
import { safeBookingUrl } from "./booking-url.mjs";

// Activates the contact form when either a non-blank https:// contactEndpoint
// is provided (legacy form action) or both supabaseUrl and supabaseKey are
// non-blank (JS-mediated REST insert). Blank/unsafe config leaves the form
// disabled with the fallback notice visible. Returns true when active.
export function applyContactState({ form, fieldset, submit, note }, configuredEndpoint, supabase = null) {
  const url = safeBookingUrl(configuredEndpoint);
  const sbUrl = supabase && typeof supabase.url === "string" ? supabase.url.trim() : "";
  const sbKey = supabase && typeof supabase.key === "string" ? supabase.key.trim() : "";
  const hasSupabase = sbUrl !== "" && sbKey !== "";

  if (url) {
    form.setAttribute("action", url);
    fieldset.disabled = false;
    submit.disabled = false;
    note.hidden = true;
    return true;
  }
  if (hasSupabase) {
    form.removeAttribute("action");
    fieldset.disabled = false;
    submit.disabled = false;
    note.hidden = true;
    return true;
  }
  form.removeAttribute("action");
  fieldset.disabled = true;
  submit.disabled = true;
  note.hidden = false;
  return false;
}

function looksLikeEmail(value) {
  if (typeof value !== "string") return false;
  const email = value.trim();
  if (email.length < 3 || email.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateContactFields({ name, email, message }) {
  const n = typeof name === "string" ? name.trim() : "";
  if (n.length < 1 || n.length > 200) return "Please enter your name.";
  if (!looksLikeEmail(email)) return "Please enter a valid email address.";
  const msg = typeof message === "string" ? message.trim() : "";
  if (msg.length < 1 || msg.length > 4000) return "Please enter a message (up to 4000 characters).";
  return null;
}

async function insertContactMessage(payload, url, key) {
  const base = url.replace(/\/$/, "");
  const res = await fetch(`${base}/rest/v1/bearing_contact_messages`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("insert failed");
}

function showFormError(form, message) {
  let err = form.querySelector("#contact-error");
  if (!err) {
    err = document.createElement("p");
    err.id = "contact-error";
    err.setAttribute("role", "alert");
    form.insertBefore(err, form.firstChild);
  }
  err.hidden = false;
  err.textContent = message;
}

function clearFormError(form) {
  const err = form.querySelector("#contact-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
}

function showSuccess(form, section) {
  const note = document.createElement("p");
  note.id = "contact-success";
  note.setAttribute("role", "status");
  note.textContent = "Message received. Expect a reply within two business days.";
  form.replaceWith(note);
  if (section) {
    const heading = section.querySelector("#contact-heading");
    if (heading) heading.focus?.();
  }
}

if (typeof document !== "undefined") {
  const form = document.querySelector("#contact-form");
  const fieldset = document.querySelector("#contact-fields");
  const submit = document.querySelector("#contact-submit");
  const note = document.querySelector("#contact-note");
  if (form && fieldset && submit && note) {
    const sb = { url: supabaseUrl, key: supabaseKey };
    const active = applyContactState({ form, fieldset, submit, note }, contactEndpoint, sb);
    const endpointUrl = safeBookingUrl(contactEndpoint);
    const sbUrl = typeof supabaseUrl === "string" ? supabaseUrl.trim() : "";
    const sbKey = typeof supabaseKey === "string" ? supabaseKey.trim() : "";
    const hasSupabase = sbUrl !== "" && sbKey !== "";

    // JS intercept only when Supabase is the active path (not legacy action POST).
    if (active && !endpointUrl && hasSupabase) {
      let submitting = false; // double-submit guard

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (submitting) return;

        const nameInput = form.querySelector('[name="name"]');
        const emailInput = form.querySelector('[name="email"]');
        const messageInput = form.querySelector('[name="message"]');
        const companyInput = form.querySelector('[name="company"]');

        const name = nameInput ? nameInput.value : "";
        const email = emailInput ? emailInput.value : "";
        const message = messageInput ? messageInput.value : "";
        const company = companyInput ? companyInput.value : "";
        const honeypot_tripped = company.trim() !== "";

        const validationError = validateContactFields({ name, email, message });
        if (validationError) {
          showFormError(form, validationError);
          return;
        }

        clearFormError(form);
        submitting = true;
        submit.disabled = true;
        const originalLabel = submit.textContent;
        submit.textContent = "Sending…";

        try {
          // Honeypot filled: still "succeed" silently without a real insert
          // would also work, but we insert with the flag so ops can filter.
          await insertContactMessage(
            {
              name: name.trim(),
              email: email.trim(),
              message: message.trim(),
              honeypot_tripped,
            },
            sbUrl,
            sbKey,
          );
          const section = form.closest("section");
          showSuccess(form, section);
        } catch {
          submitting = false;
          submit.disabled = false;
          submit.textContent = originalLabel;
          showFormError(
            form,
            "We couldn't send your message just now. Please try again later.",
          );
        }
      });
    }
  }
}
