// The Reel Estate mark: a story frame with a spark cut, a second frame tucked behind it to the lower left.
const SPARK = "M12 2.5c.6 4.6 2.9 6.9 7.5 7.5v1c-4.6.6-6.9 2.9-7.5 7.5h-1c-.6-4.6-2.9-6.9-7.5-7.5v-1c4.6-.6 6.9-2.9 7.5-7.5z";

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="logo-mark">
      <defs>
        <linearGradient id="re-ig" x1="2" y1="24" x2="22" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#feda75" />
          <stop offset="0.28" stopColor="#fa7e1e" />
          <stop offset="0.55" stopColor="#d62976" />
          <stop offset="0.78" stopColor="#962fbf" />
          <stop offset="1" stopColor="#4f5bd5" />
        </linearGradient>
        <mask id="re-back">
          <rect width="24" height="24" fill="#fff" />
          <rect x="5.95" y="0.35" width="14.7" height="20.7" rx="3.45" fill="#000" />
        </mask>
        <mask id="re-spark">
          <rect width="24" height="24" fill="#fff" />
          <path transform="translate(6.86 4.82) scale(0.56)" d={SPARK} fill="#000" />
        </mask>
      </defs>
      <rect x="4.2" y="3.8" width="13" height="19" rx="2.6" fill="url(#re-ig)" mask="url(#re-back)" />
      <rect x="6.8" y="1.2" width="13" height="19" rx="2.6" fill="url(#re-ig)" mask="url(#re-spark)" />
    </svg>
  );
}

export default function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="logo" dir="ltr">
      <LogoMark size={size} />
      <span className="logo-word">Reel Estate</span>
    </span>
  );
}

// "Reel Estate" as a connected geometric monoline: R flows into ee, the t's bar becomes the top of the s, a into t, t into e.
export function Wordmark() {
  return (
    <svg className="logo-word-svg" viewBox="-3 3 218 42" role="img" aria-label="Reel Estate">
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 40V9H10A8 8 0 0 1 10 25H2M10 25C13.5 31 15.5 40 19.5 40C22.5 40 23 29 25 29H47A11 11 0 1 0 45.5 34.5C47.5 33 47 29 49 29H71A11 11 0 1 0 69.5 34.5" />
        <path d="M79 6V34A6 6 0 0 0 85 40" />
        <path d="M115 9H100V40H115M100 24.5H112" />
        <path d="M143 18H125.5A5.5 5.5 0 0 0 125.5 29A5.5 5.5 0 0 1 125.5 40H120" />
        <path d="M137 11V34A6 6 0 0 0 143 40C145.5 40 147 35 147 29A11 11 0 1 1 147 29.01" />
        <path d="M169 18V40" />
        <path d="M169 18H183" />
        <path d="M177 11V34A6 6 0 0 0 183 40C185.5 40 186 29 188 29H210A11 11 0 1 0 208.5 34.5" />
      </g>
    </svg>
  );
}
