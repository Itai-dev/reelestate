// The Reel Estate mark: a story frame with a spark cut, a second frame tucked behind it to the lower left.
const SPARK = "M12 2.5c.6 4.6 2.9 6.9 7.5 7.5v1c-4.6.6-6.9 2.9-7.5 7.5h-1c-.6-4.6-2.9-6.9-7.5-7.5v-1c4.6-.6 6.9-2.9 7.5-7.5z";

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="logo-mark">
      <defs>
        <mask id="re-back">
          <rect width="24" height="24" fill="#fff" />
          <rect x="5.95" y="0.35" width="14.7" height="20.7" rx="3.45" fill="#000" />
        </mask>
        <mask id="re-spark">
          <rect width="24" height="24" fill="#fff" />
          <path transform="translate(6.86 4.82) scale(0.56)" d={SPARK} fill="#000" />
        </mask>
      </defs>
      <rect x="4.2" y="3.8" width="13" height="19" rx="2.6" fill="currentColor" mask="url(#re-back)" />
      <rect x="6.8" y="1.2" width="13" height="19" rx="2.6" fill="currentColor" mask="url(#re-spark)" />
    </svg>
  );
}

export default function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="logo" dir="ltr">
      <LogoMark size={size} />
      <Wordmark />
    </span>
  );
}

// "Reel Estate" drawn as one connected monoline: R flows into ee, t's bar into s, a into t, t into e.
export function Wordmark() {
  return (
    <svg className="logo-word-svg" viewBox="-3 3 218 42" role="img" aria-label="Reel Estate">
      <g fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 40V9H11A8.5 8.5 0 0 1 11 26H2M11 26C15 33 17 40 21 40C24.5 40 25 30 27 30H47A10 10 0 1 0 45.66 35C48 33.2 48 30 50 30H70A10 10 0 1 0 68.66 35" />
        <path d="M78 6V33Q78 40 84 40" />
        <path d="M115 9H101V40H115M101 24.5H112" />
        <path d="M149 21H133C129 21 125.5 19.6 122.6 21.2C119.4 23 120.4 27.6 126.5 29.3C132 30.8 133.6 34 131.6 37.5C129.2 41.6 122 40.6 120 37" />
        <path d="M142 12V34Q142 40 148 40C151 40 151 36 151 30A10 10 0 1 1 151 30.01" />
        <path d="M171 21V40" />
        <path d="M171 21H186" />
        <path d="M179 12V34Q179 40 185 40C188 40 188 30 190 30H210A10 10 0 1 0 208.66 35" />
      </g>
    </svg>
  );
}
