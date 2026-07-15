// Bearing helper — a small, scripted "ask me" widget. NOT a live AI agent: it
// answers a fixed set of common questions with canned answers and links to the
// right page. That means zero running cost, nothing to hallucinate, and no data
// leaving the browser (no storage, no network) — consistent with the privacy
// page. The knowledge base and the matcher below are pure and unit-tested; only
// initHelper() touches the DOM, and only in a browser.

// Every answer is drawn verbatim-in-spirit from the site's own copy (FAQ,
// Services, Process). Keep facts here in sync with those pages.
export const TOPICS = [
  {
    id: "pricing",
    q: "What does it cost?",
    a: "Three things, one price each: the First Look is free, a First Bearing is $1,500, and Continuity is $4,250 prepaid. No tiers and no add-ons.",
    links: [{ label: "See services & pricing", href: "services.html" }],
    keywords: ["price", "pricing", "cost", "costs", "how much", "fee", "fees", "expensive", "money", "rate", "rates", "charge", "afford"],
  },
  {
    id: "first-bearing",
    q: "What's included in a First Bearing?",
    a: "The full reading for $1,500: a written assessment, advisor analysis, a 75-minute debrief, your One-Page Truth, and a 90-day Growth Map.",
    links: [{ label: "First Bearing details", href: "services.html" }, { label: "Request one", href: "booking.html" }],
    keywords: ["first bearing", "included", "include", "includes", "what do i get", "deliverables", "package", "debrief", "growth map"],
  },
  {
    id: "first-look",
    q: "What's the free First Look?",
    a: "Five questions and an instant, directional read on where the business stands — no advisor time, no email required. The quickest way to see whether a full reading is worth it.",
    links: [{ label: "Take the First Look", href: "index.html#first-look" }],
    keywords: ["first look", "free", "quick", "five questions", "directional read", "try", "sample", "instant"],
  },
  {
    id: "health-check",
    q: "What's the Business Health Check?",
    a: "A free, self-scored read across six dimensions of your financial operation — eighteen plain questions. It stays in your browser and asks nothing about you.",
    links: [{ label: "Open the Health Check", href: "health-check.html" }],
    keywords: ["health check", "self-scored", "eighteen", "18 questions", "score", "dimensions", "quiz", "checkup", "diagnostic"],
  },
  {
    id: "booking",
    q: "How do I book?",
    a: "Pick the dates and times that suit you on the booking page. There's no instant calendar yet, so the founder confirms one of your slots within two business days — nothing is charged until a time is agreed.",
    links: [{ label: "Request a time", href: "booking.html" }],
    keywords: ["book", "booking", "schedule", "appointment", "calendar", "meet", "meeting", "when can", "availability", "reserve", "slot"],
  },
  {
    id: "delivery",
    q: "How fast do I get results?",
    a: "You receive your One-Page Truth within five business days of submitting your assessment, followed by the 75-minute debrief.",
    links: [{ label: "See the process", href: "process.html" }],
    keywords: ["how fast", "how long", "turnaround", "delivery", "when do i get", "timeline", "results", "wait", "speed", "quick"],
  },
  {
    id: "refund",
    q: "What's the refund policy?",
    a: "If Bearing misses the delivery window without an agreed reschedule, the First Bearing fee is refunded. That's the whole condition — no fine print.",
    links: [{ label: "Full terms", href: "services.html#terms-heading" }],
    keywords: ["refund", "refunds", "money back", "guarantee", "cancel", "cancellation", "late", "miss", "missed"],
  },
  {
    id: "correction",
    q: "What if something in my report is wrong?",
    a: "Every First Bearing includes one free correction for factual errors reported within seven days of delivery. Tell us what's off and we fix it.",
    links: [{ label: "Full terms", href: "services.html#terms-heading" }],
    keywords: ["correction", "wrong", "error", "mistake", "fix", "inaccurate", "factual", "dispute"],
  },
  {
    id: "continuity",
    q: "What is Continuity?",
    a: "A year of bearings for $4,250 prepaid: the First Bearing plus three lighter reviews through the year and an annual reassessment. Already bought a First Bearing? Upgrade within 30 days and the full $1,500 is credited — you pay the remaining $2,750.",
    links: [{ label: "Continuity on Services", href: "services.html#service-continuity" }],
    keywords: ["continuity", "ongoing", "yearly", "annual", "subscription", "retainer", "upgrade", "renew"],
  },
  {
    id: "nonprofits",
    q: "Do you work with non-profits?",
    a: "Yes — non-profits are a core focus. Bearing works on the operational side of finance: grant management (how you seek, report, and deploy funding), non-profit financial systems, and banking and lending relationships.",
    links: [{ label: "About the practice", href: "about.html" }],
    keywords: ["nonprofit", "non-profit", "non profit", "charity", "charities", "grant", "grants", "foundation", "funder", "ngo"],
  },
  {
    id: "who-for",
    q: "Who is a First Bearing for?",
    a: "Owner-led businesses and non-profits past the startup stage that want one honest page: three findings, one first move, and a measure to watch for 90 days. It isn't a long consulting engagement or a done-for-you team.",
    links: [{ label: "More on About", href: "about.html" }, { label: "Common questions", href: "faq.html" }],
    keywords: ["who is it for", "who is this for", "fit", "right for me", "suitable", "small business", "owner", "eligible"],
  },
  {
    id: "adrift",
    q: "My First Look says 'Adrift' — is that bad?",
    a: "No. Adrift is a directional state, not a score or a shame label. It just means the picture is blurry right now — common and fixable. It says nothing about how good the business is.",
    links: [{ label: "More in the FAQ", href: "faq.html#faq-adrift" }],
    keywords: ["adrift", "bad", "result mean", "score mean", "grade", "state", "drifting"],
  },
  {
    id: "privacy",
    q: "What happens to my data?",
    a: "Nothing is collected in the background, there's no analytics or advertising, and only the founder can read what you submit. Results are never published without your separate written consent.",
    links: [{ label: "Privacy & data handling", href: "privacy.html" }],
    keywords: ["privacy", "data", "gdpr", "secure", "security", "information", "share", "publish", "confidential", "consent", "track"],
  },
  {
    id: "portal",
    q: "How do I reach the client portal?",
    a: "Paid pilot clients follow their First Bearing from booking to debrief and reach their documents in the client portal — sign in with the email Bearing registered for you.",
    links: [{ label: "Client portal", href: "portal.html" }],
    keywords: ["portal", "login", "log in", "sign in", "account", "documents", "dashboard", "my files"],
  },
  {
    id: "contact",
    q: "How do I contact Bearing?",
    a: "Send a message from the contact page and you'll get a reply within two business days. Please keep sensitive figures for a scheduled conversation, not the form.",
    links: [{ label: "Contact page", href: "contact.html" }],
    keywords: ["contact", "email", "reach", "get in touch", "talk to", "call", "phone", "message", "support", "human", "person"],
  },
  {
    id: "one-page-truth",
    q: "What's the One-Page Truth?",
    a: "One page you can read in a minute and act on for a quarter — three findings, one first move, and one measure to watch. Not a bloated report you open once and never reopen.",
    links: [{ label: "See an example", href: "index.html" }],
    keywords: ["one-page truth", "one page truth", "report", "deliverable", "output", "what do i receive", "document"],
  },
];

// The chips shown before the visitor has typed anything — the most-asked few.
export const FEATURED = ["pricing", "first-look", "booking", "delivery", "nonprofits", "contact"];

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9$\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Common words carry no routing signal — dropping them keeps a stray "what" or
// "my" from pulling an unrelated topic to the top.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "our", "are", "was", "does",
  "did", "can", "could", "would", "will", "what", "when", "where", "who",
  "how", "why", "this", "that", "these", "those", "been", "get", "got",
  "have", "has", "about", "there", "here", "they", "them", "from", "into",
  "out", "just", "any", "all", "not", "but", "its", "we", "us", "my", "me",
  "is", "am", "be", "to", "in", "on", "at", "it", "do", "if", "as", "so",
  "or", "than", "then", "some", "need", "want",
]);

const meaningfulWords = (text) =>
  normalizeText(text).split(" ").filter((w) => w.length >= 3 && !STOPWORDS.has(w));

// Score each topic against the query: whole-keyword-phrase hits weigh most,
// then per-word keyword hits, then a touch for the question text. Returns the
// best `limit` topics, most relevant first, or [] when nothing is relevant.
export function matchTopics(query, topics = TOPICS, limit = 4) {
  const q = normalizeText(query);
  if (!q) return [];
  const terms = meaningfulWords(q);
  if (!terms.length) return [];

  return topics
    .map((topic) => {
      const questionText = normalizeText(topic.q);
      const keywords = (topic.keywords || []).map(normalizeText);
      let score = 0;
      for (const keyword of keywords) {
        if (keyword && keyword.includes(" ") && q.includes(keyword)) score += 5;
      }
      const words = keywords.flatMap((k) => k.split(" ")).filter((w) => w.length > 1 && !STOPWORDS.has(w));
      // Exact keyword-word hits weigh most; a shared 4+ char prefix (plurals and
      // simple inflections: nonprofit↔nonprofits, cost↔costs) counts for less so
      // it can't outrank an exact match on another topic.
      const prefixMatch = (term) => words.some((w) =>
        term.length >= 4 && w.length >= 4 && (w.startsWith(term) || term.startsWith(w)));
      for (const term of terms) {
        if (words.includes(term)) score += 3;
        else if (prefixMatch(term)) score += 2;
        else if (keywords.some((k) => k.includes(term))) score += 1;
        if (questionText.includes(term)) score += 1;
      }
      return { topic, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.topic);
}

export function featuredTopics(topics = TOPICS, featured = FEATURED) {
  return featured.map((id) => topics.find((t) => t.id === id)).filter(Boolean);
}

// --- Widget (DOM) ----------------------------------------------------------
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHelper, { once: true });
  } else {
    initHelper();
  }
}

function initHelper() {
  if (!document.body || document.querySelector("[data-helper]")) return;

  const root = document.createElement("div");
  root.className = "helper";
  root.setAttribute("data-helper", "");
  root.innerHTML = `
    <button class="helper-launch" type="button" aria-expanded="false" aria-controls="helper-panel" aria-haspopup="dialog">
      <svg class="helper-launch-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.4"></circle>
        <path d="M12 4.5v2 M12 17.5v2 M4.5 12h2 M17.5 12h2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
        <path d="M12 6.5l1.4 5L12 13l-1.4-1.5L12 6.5z" fill="currentColor"></path>
        <circle cx="12" cy="12" r="1.1" fill="none" stroke="currentColor" stroke-width="1.1"></circle>
      </svg>
      <span class="helper-launch-label">Need a hand?</span>
    </button>
    <div class="helper-panel" id="helper-panel" role="dialog" aria-label="Bearing helper" hidden>
      <div class="helper-head">
        <div>
          <p class="helper-title">Bearing helper</p>
          <p class="helper-sub">Quick answers to common questions</p>
        </div>
        <button class="helper-close" type="button" aria-label="Close helper">&times;</button>
      </div>
      <div class="helper-thread" id="helper-thread" aria-live="polite"></div>
      <div class="helper-chips" id="helper-chips"></div>
      <form class="helper-search" id="helper-search" role="search">
        <label class="visually-hidden" for="helper-input">Ask a question</label>
        <input id="helper-input" type="text" autocomplete="off" enterkeyhint="send"
          placeholder="Ask about pricing, booking, non-profits…">
        <button type="submit" class="helper-send" aria-label="Ask">&rarr;</button>
      </form>
      <p class="helper-foot">Not a live agent — a quick guide to what's on the site.
        For anything else, <a href="contact.html">contact us</a>.</p>
    </div>`;
  document.body.append(root);

  const launch = root.querySelector(".helper-launch");
  const panel = root.querySelector(".helper-panel");
  const closeBtn = root.querySelector(".helper-close");
  const thread = root.querySelector("#helper-thread");
  const chips = root.querySelector("#helper-chips");
  const searchForm = root.querySelector("#helper-search");
  const input = root.querySelector("#helper-input");
  let greeted = false;

  const escapeHtml = (value) => {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  };

  function bubble(kind, html) {
    const el = document.createElement("div");
    el.className = `helper-msg helper-msg-${kind}`;
    el.innerHTML = html;
    thread.append(el);
    thread.scrollTop = thread.scrollHeight;
  }

  function answerHtml(topic) {
    const links = (topic.links || [])
      .map((l) => `<a href="${l.href}">${escapeHtml(l.label)}</a>`)
      .join("");
    return `<p>${escapeHtml(topic.a)}</p>${links ? `<p class="helper-links">${links}</p>` : ""}`;
  }

  function renderChips(topics) {
    chips.innerHTML = "";
    for (const topic of topics) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "helper-chip";
      chip.textContent = topic.q;
      chip.addEventListener("click", () => ask(topic.q, topic));
      chips.append(chip);
    }
  }

  function ask(question, topic) {
    bubble("you", escapeHtml(question));
    if (topic) {
      bubble("bot", answerHtml(topic));
      const related = matchTopics(topic.q).filter((t) => t.id !== topic.id).slice(0, 3);
      renderChips(related.length ? related : featuredTopics());
    } else {
      bubble("bot",
        `<p>I don't have a canned answer for that one — but the founder can help directly.</p>`
        + `<p class="helper-links"><a href="contact.html">Contact Bearing</a></p>`);
      renderChips(featuredTopics());
    }
    input.value = "";
  }

  function open() {
    panel.hidden = false;
    launch.setAttribute("aria-expanded", "true");
    if (!greeted) {
      bubble("bot",
        "<p>Hi — I'm the Bearing helper. I can answer common questions about pricing, "
        + "booking, and how a First Bearing works. Pick one below, or type what you're after.</p>");
      renderChips(featuredTopics());
      greeted = true;
    }
    input.focus();
  }

  function close() {
    panel.hidden = true;
    launch.setAttribute("aria-expanded", "false");
    launch.focus();
  }

  launch.addEventListener("click", () => (panel.hidden ? open() : close()));
  closeBtn.addEventListener("click", close);

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    ask(query, matchTopics(query)[0] || null);
  });

  input.addEventListener("input", () => {
    const query = input.value.trim();
    if (!query) { renderChips(featuredTopics()); return; }
    const matches = matchTopics(query);
    if (matches.length) {
      renderChips(matches);
    } else {
      chips.innerHTML = `<p class="helper-nohit">No quick match — press enter and I'll point you somewhere useful.</p>`;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) close();
  });
  document.addEventListener("click", (event) => {
    if (!panel.hidden && !root.contains(event.target)) close();
  });
}
