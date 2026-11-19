"use client";

import { useState } from "react";

// A muted reel that plays through a few example clips, one after another.
export default function AuthReel({ clips }: { clips: string[] }) {
  const [i, setI] = useState(0);
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
