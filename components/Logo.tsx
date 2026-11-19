// The Reel Estate mark: one story frame with a warm spark in it.
const SPARK = "M12 2.5c.6 4.6 2.9 6.9 7.5 7.5v1c-4.6.6-6.9 2.9-7.5 7.5h-1c-.6-4.6-2.9-6.9-7.5-7.5v-1c4.6-.6 6.9-2.9 7.5-7.5z";

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="4 0 16 24" width={(size * 2) / 3} height={size} aria-hidden className="logo-mark">
      <defs>
        <linearGradient id="re-warm" x1="7" y1="17" x2="17" y2="7" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6a5bd8" />
          <stop offset="0.14" stopColor="#d62976" />
          <stop offset="0.42" stopColor="#f7772a" />
          <stop offset="0.7" stopColor="#fcaa47" />
          <stop offset="1" stopColor="#ffd96a" />
        </linearGradient>
      </defs>
      <rect x="4.5" y="1" width="15" height="22" rx="3.4" fill="currentColor" />
      <path transform="translate(4.41 5.07) scale(0.66)" d={SPARK} fill="url(#re-warm)" />
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
