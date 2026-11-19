"use client";

import { useEffect, useState } from "react";

// A muted reel that plays through a few example clips, one after another.
export default function AuthReel({ clips }: { clips: string[] }) {
  const [i, setI] = useState(0);
  // phones get the form alone, so don't load the video there
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 860px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (!wide) return null;
  return (
    <video
      key={clips[i]}
      className="auth-video"
      src={clips[i]}
      autoPlay
      muted
      playsInline
      preload="auto"
      onEnded={() => setI((n) => (n + 1) % clips.length)}
      onError={() => setI((n) => (n + 1) % clips.length)}
      aria-hidden
    />
  );
}
