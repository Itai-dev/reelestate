// The Reel Estate mark: a story frame with a spark cut, a second frame behind it to the lower left.
const SPARK = "M12 2.5c.6 4.6 2.9 6.9 7.5 7.5v1c-4.6.6-6.9 2.9-7.5 7.5h-1c-.6-4.6-2.9-6.9-7.5-7.5v-1c4.6-.6 6.9-2.9 7.5-7.5z";

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="logo-mark">
      <defs>
        <mask id="re-back">
          <rect width="24" height="24" fill="#fff" />
          <rect x="6.05" y="-0.45" width="15.4" height="21.4" rx="4.2" fill="#000" />
        </mask>
        <mask id="re-spark">
          <rect width="24" height="24" fill="#fff" />
          <path transform="translate(7.31 4.37) scale(0.56)" d={SPARK} fill="#000" />
        </mask>
      </defs>
      <rect x="3.75" y="4.25" width="13" height="19" rx="3" fill="currentColor" mask="url(#re-back)" />
      <rect x="7.25" y="0.75" width="13" height="19" rx="3" fill="currentColor" mask="url(#re-spark)" />
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
