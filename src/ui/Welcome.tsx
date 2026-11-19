// Shown once, the first time someone opens Midad.
const KEY = 'midad:welcomed';

export function shouldWelcome(): boolean {
  try {
    return !localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function markWelcomed() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* private mode: just don't remember */
  }
}

const TIPS = [
  { icon: '☝', title: 'Tap a letter', body: 'Drag it, scale it with the corners, rotate with the round handle. Joins stretch to follow. Double-click to grab its whole word.' },
  { icon: 'ي', title: 'Shape & ḥaraka', body: 'A tapped letter shows its other forms drawn by the font, and the vowels it can take. Hover to preview, click to apply.' },
  { icon: '✨', title: 'Tidy', body: 'After free editing, Tidy smooths the line, turns gaps into kashida and fixes spacing — undo any time.' },
  { icon: '📜', title: 'Library', body: 'Start from a well-known phrase, proverb or line of poetry, fully vocalised.' },
];

export function Welcome({ onClose, onLibrary, onNames }: { onClose: () => void; onLibrary: () => void; onNames: () => void }) {
  const done = (then?: () => void) => () => {
    markWelcomed();
    onClose();
    then?.();
  };
  return (
    <div className="dialog-backdrop">
      <div className="dialog welcome" role="dialog" aria-label="Welcome to Midad">
        <div className="welcome-head">
          <span className="welcome-ar">مِداد</span>
          <div>
            <h2>Welcome to Midad</h2>
            <p className="muted">Compose Arabic calligraphy letter by letter — with real fonts, a pen-like feel and nothing to install.</p>
          </div>
        </div>
        <ul className="welcome-tips">
          {TIPS.map((t) => (
            <li key={t.title}>
              <span className="welcome-icon" aria-hidden="true">
                {t.icon}
              </span>
              <div>
                <strong>{t.title}</strong>
                <p>{t.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="row gap wrap welcome-actions">
          <button type="button" className="primary" onClick={done(onNames)}>
            Start with the names
          </button>
          <button type="button" onClick={done(onLibrary)}>
            Browse phrases
          </button>
          <button type="button" className="ghost" onClick={done()}>
            Just let me explore
          </button>
        </div>
        <p className="muted small">The ? button shows all tips and shortcuts any time. Your work saves in this browser automatically.</p>
      </div>
    </div>
  );
}
