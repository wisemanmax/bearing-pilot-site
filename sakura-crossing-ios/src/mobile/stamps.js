/* ------------------------------------------------------------------ *
 * スタンプラリー -- the stamp rally.
 *
 * The original is a place, not a game: twenty-odd things respond when you
 * press E and none of them are counted, because on a desktop the reward for
 * exploring is the exploring.  A phone is played in shorter sittings and
 * put down between them, so this adds the smallest possible reason to come
 * back -- the thing every Japanese railway does in spring anyway.  Find the
 * things that respond, get a stamp for each, keep the book between sessions.
 *
 * It is additive on purpose.  Nothing here gates a door, blocks a route or
 * fails: the stamps are a record of where you have been, which is exactly
 * what a real stamp rally is.  Delete this module and the walk is unchanged.
 * ------------------------------------------------------------------ */

const KEY = 'sakura-crossing-stamps';

/**
 * Split 'ねこ  ·  say hello' into its two halves.
 *
 * Most labels use the middle dot, but one vending machine in the world
 * spells its separator ` E ` -- the key it used to name -- so both are
 * accepted rather than leaving that one entry titled with its own verb.
 */
function parts(label) {
  const m = label.match(/^(.*?)(?:\s+·\s+|\s+E\s+)(.*)$/);
  if (!m) return { title: label.trim(), hint: '' };
  return { title: m[1].trim(), hint: m[2].trim() };
}

export function createStamps({ interactables, exclude = [] }) {
  const skip = new Set(exclude);

  /* The book is keyed by label because that is the only stable identity an
   * interactable has -- the objects are rebuilt from seeds on every load and
   * hold no id of their own.  Two things sharing a label share a stamp, which
   * is the right answer anyway: four vending machines are one kind of find. */
  const book = new Map();
  for (const it of interactables) {
    if (!it.label || skip.has(it.label)) continue;
    const { title, hint } = parts(it.label);
    if (!book.has(it.label)) book.set(it.label, { title, hint, got: false });
  }

  let collected = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(saved)) collected = new Set(saved.filter((s) => book.has(s)));
  } catch { /* a corrupt book is an empty book, not a crash */ }
  for (const label of collected) book.get(label).got = true;

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify([...collected])); } catch { /* optional */ }
  };

  /* --------------------------------- view --------------------------------- */
  const root = document.createElement('div');
  root.className = 'stamps';
  root.innerHTML = `
    <button class="stamp-pill" type="button" aria-label="Stamp book">
      <span class="stamp-mark">桜</span>
      <span class="stamp-count"></span>
    </button>
    <div class="stamp-book" hidden>
      <div class="stamp-book-head">
        <b>スタンプラリー</b>
        <span class="stamp-book-count"></span>
      </div>
      <ul class="stamp-list"></ul>
      <p class="stamp-book-foot">Find something that responds, and press ◎.</p>
    </div>`;
  document.body.appendChild(root);

  const pill = root.querySelector('.stamp-pill');
  const panel = root.querySelector('.stamp-book');
  const countEl = root.querySelector('.stamp-count');
  const bookCountEl = root.querySelector('.stamp-book-count');
  const listEl = root.querySelector('.stamp-list');

  function render() {
    const total = book.size;
    const got = collected.size;
    countEl.textContent = `${got}/${total}`;
    bookCountEl.textContent = `${got} / ${total}`;
    root.classList.toggle('complete', got === total && total > 0);

    listEl.innerHTML = '';
    for (const entry of book.values()) {
      const li = document.createElement('li');
      li.className = entry.got ? 'got' : '';
      /* Un-found entries show the hint but not the name.  A full list of
       * everything you have not seen yet is a checklist to be worked
       * through; a list of verbs is an invitation to go looking. */
      li.innerHTML = entry.got
        ? `<i>✿</i><b>${esc(entry.title)}</b><span>${esc(entry.hint)}</span>`
        : `<i>·</i><b>???</b><span>${esc(entry.hint)}</span>`;
      listEl.appendChild(li);
    }
  }

  const esc = (s) => s.replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));

  let open = false;
  const setOpen = (on) => {
    open = on;
    panel.hidden = !on;
    root.classList.toggle('open', on);
  };
  pill.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!open); });
  panel.addEventListener('click', (e) => e.stopPropagation());

  render();

  return {
    root,
    onCollect: null,
    onComplete: null,
    get total() { return book.size; },
    get count() { return collected.size; },
    get complete() { return book.size > 0 && collected.size === book.size; },

    /** @returns true if this label had not been stamped before */
    collect(label) {
      const entry = book.get(label);
      if (!entry || entry.got) return false;
      entry.got = true;
      collected.add(label);
      save();
      render();
      this.onCollect?.(entry, collected.size, book.size);
      if (collected.size === book.size) this.onComplete?.();
      return true;
    },

    setOpen,
    close() { setOpen(false); },
    setVisible(on) { root.classList.toggle('on', on); if (!on) setOpen(false); },

    reset() {
      collected = new Set();
      for (const entry of book.values()) entry.got = false;
      save();
      render();
    },
  };
}
