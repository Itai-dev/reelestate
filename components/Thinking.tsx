"use client";

import { useEffect, useRef, useState } from "react";

// A working indicator: three dots that keep rearranging, a shimmering line that
// cross-fades to the next step every few seconds, and a progress bar when the
// progress is known.
const dots = (t: string) => t.replace(/[.…\s]+$/, "") + "…";

export default function Thinking({ lines, progress, compact }: { lines: string[]; progress?: number; compact?: boolean }) {
  const [i, setI] = useState(0);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    setI(0);
    prev.current = null;
    if (lines.length < 2) return;
    const id = setInterval(
      () =>
        setI((n) => {
          prev.current = n;
          return (n + 1) % lines.length;
        }),
      2800,
    );
    return () => clearInterval(id);
  }, [lines]);
  const out = prev.current !== null && prev.current !== i ? lines[prev.current] : null;
  return (
    <div className={`thinking${compact ? " is-compact" : ""}`} role="status" aria-live="polite">
      <span className="thinking-orb" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span className="thinking-body">
        <span className="thinking-lines">
          {out !== null && (
            <span className="thinking-line is-out" key={`o${prev.current}-${i}`} aria-hidden>
              {dots(out)}
            </span>
          )}
          <span className="thinking-line" key={i}>
            {dots(lines[i])}
          </span>
        </span>
        {progress !== undefined && (
          <span className="thinking-bar" aria-hidden>
            <span style={{ width: `${Math.max(4, Math.min(100, progress * 100))}%` }} />
          </span>
        )}
      </span>
    </div>
  );
}
