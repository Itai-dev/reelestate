"use client";

import { useEffect, useState } from "react";

// A working indicator: a breathing star, a line that changes every few seconds,
// and a progress bar when the progress is known.
export default function Thinking({ lines, progress, compact }: { lines: string[]; progress?: number; compact?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (lines.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % lines.length), 2800);
    return () => clearInterval(id);
  }, [lines]);
  return (
    <div className={`thinking${compact ? " is-compact" : ""}`} role="status" aria-live="polite">
      <span className="thinking-star" aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5v1c-4.6.6-6.9 2.9-7.5 7.5h-1c-.6-4.6-2.9-6.9-7.5-7.5v-1c4.6-.6 6.9-2.9 7.5-7.5z" />
        </svg>
      </span>
      <span className="thinking-body">
        <span className="thinking-line" key={i}>
          {lines[i]}
          <span className="thinking-dots" aria-hidden>
            <i />
            <i />
            <i />
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
