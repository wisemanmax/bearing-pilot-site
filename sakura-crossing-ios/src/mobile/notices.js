/* ------------------------------------------------------------------ *
 * The two full-screen notices, and the stamp toast.
 *
 * Both notices are states the game cannot render its way out of, so they
 * cover the frame rather than sitting on it: a phone held the wrong way up,
 * and a GPU context that iOS took away while the app was in the background.
 * The second is the one that matters -- without it the app comes back from
 * the app switcher to a blank canvas and no error anywhere.
 * ------------------------------------------------------------------ */

export function createNotices() {
  const make = (cls, html) => {
    const n = document.createElement('div');
    n.className = cls;
    n.innerHTML = html;
    document.body.appendChild(n);
    return n;
  };

  const portrait = make('notice', `
    <div>
      <span class="notice-mark" aria-hidden="true">▯</span>
      <h2>横向きでどうぞ</h2>
      <p>Sakura Crossing is a widescreen walk. Turn your phone sideways.</p>
    </div>`);

  const lost = make('notice', `
    <div>
      <span class="notice-mark" aria-hidden="true" style="animation:none">✿</span>
      <h2>Scene interrupted</h2>
      <p>iOS reclaimed the graphics context while the app was in the
         background. The street is still there.</p>
      <button type="button">Rebuild the scene</button>
    </div>`);
  lost.querySelector('button').addEventListener('click', () => location.reload());

  /* Built once and written through `textContent` rather than re-templated on
   * every stamp.  The titles come from the world's own labels so there is
   * nothing hostile in them, but assembling markup out of content is a habit
   * that only has to be wrong once. */
  const toast = make('stamp-toast', '<span></span><small></small>');
  const toastLine = toast.querySelector('span');
  const toastSub = toast.querySelector('small');
  let toastTimer = null;

  function show(line, sub, ms) {
    toastLine.textContent = line;
    toastSub.textContent = sub;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), ms);
  }

  return {
    setPortrait(on) { portrait.classList.toggle('on', on); },
    setContextLost(on) { lost.classList.toggle('on', on); },

    /** A stamp landed.  Deliberately shorter than it takes to stop walking. */
    stamp(title, got, total) {
      show(`スタンプ ✿ ${title}`, `${got} / ${total}`, 1900);
    },

    complete(total) {
      show(`全${total}スタンプ 達成`, 'the whole town, walked', 4200);
    },
  };
}
