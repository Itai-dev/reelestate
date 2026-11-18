"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
};

// A bottom sheet on phones and a centred dialog on larger screens. Slides up with
// a spring curve, follows the finger when dragged by its handle, and closes when
// dragged down far or fast enough.
export default function Sheet({ open, onClose, title, children, footer, wide }: Props) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; t0: number; dy: number } | null>(null);
  const [dy, setDy] = useState(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const id = setTimeout(() => setMounted(false), 420);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mounted, onClose]);

  useEffect(() => {
    if (shown) panel.current?.focus({ preventScroll: true });
  }, [shown]);

  const down = useCallback((e: React.PointerEvent) => {
    if (window.matchMedia("(min-width: 760px)").matches) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
  }, []);
  const move = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = Math.max(0, e.clientY - drag.current.y0);
    drag.current.dy = d;
    setDy(d);
  }, []);
  const up = useCallback(() => {
    const g = drag.current;
    drag.current = null;
    if (!g) return;
    const v = g.dy / Math.max(1, performance.now() - g.t0);
    setDy(0);
    if (g.dy > 120 || v > 0.6) onClose();
  }, [onClose]);

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className={`sh${shown ? " is-open" : ""}`}>
      <div className="sh-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        className={`sh-panel${wide ? " sh-wide" : ""}${dy ? " is-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={dy ? { transform: `translateY(${dy}px)` } : undefined}
      >
        <header className="sh-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className="sh-grip" aria-hidden />
          <button type="button" className="sh-close" onClick={onClose} aria-label="סגירה" onPointerDown={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <h2>{title}</h2>
        </header>
        <div className="sh-body">{children}</div>
        {footer && <footer className="sh-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
