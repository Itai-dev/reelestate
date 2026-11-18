"use client";

import { useEffect, useRef } from "react";

// A muted looping clip that only plays while it is on screen.
export default function LoopVideo({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (!v.src) v.src = src;
          if (!reduce) v.play().catch(() => {});
        } else v.pause();
      },
      { rootMargin: "200px" },
    );
    io.observe(v);
    // a dropped or refused range request gets one retry
    let retried = false;
    const onError = () => {
      if (retried) return;
      retried = true;
      setTimeout(() => {
        v.load();
        v.play().catch(() => {});
      }, 800);
    };
    v.addEventListener("error", onError);
    return () => {
      io.disconnect();
      v.removeEventListener("error", onError);
    };
  }, [src]);
  return <video ref={ref} className={className} muted loop playsInline preload="none" aria-hidden />;
}
