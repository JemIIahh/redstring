/** What each kind of string means, drawn with the same strings as the board. */
const ROWS = [
  { status: "confirmed", word: "confirmed" },
  { status: "proposed", word: "proposed" },
  { status: "rejected", word: "rejected" },
  { status: "dead-end", word: "dead end" },
] as const;

export function ThreadLegend() {
  return (
    <ul className="rs-legend" aria-label="What the strings mean">
      {ROWS.map((r) => (
        <li key={r.status}>
          <svg width="44" height="12" viewBox="0 0 44 12" aria-hidden="true">
            <g className={`rs-thread rs-thread--${r.status}`}>
              {r.status === "rejected" ? (
                <>
                  <path d="M2 4 Q8 8 14 11" className="rs-thread-line" />
                  <path d="M42 4 Q36 8 30 11" className="rs-thread-line" />
                </>
              ) : (
                <path
                  d="M2 6 H42"
                  className="rs-thread-line"
                  {...(r.status === "proposed" ? {} : { pathLength: 100 })}
                />
              )}
              {r.status === "dead-end" ? <circle cx="31" cy="6" r="3.5" className="rs-thread-knot" /> : null}
            </g>
          </svg>
          {r.word}
        </li>
      ))}
    </ul>
  );
}
