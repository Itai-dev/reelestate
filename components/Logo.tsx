// The Reel Estate mark: one story frame with a spark cut out of it.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="logo-mark">
      <defs>
        <mask id="re-spark">
          <rect width="24" height="24" fill="#fff" />
          <path
            transform="translate(5.675 6.225) scale(0.55)"
            d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5v1c-4.6.6-6.9 2.9-7.5 7.5h-1c-.6-4.6-2.9-6.9-7.5-7.5v-1c4.6-.6 6.9-2.9 7.5-7.5z"
            fill="#000"
            stroke="#000"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <rect x="5" y="1.5" width="14" height="21" rx="3.4" fill="currentColor" mask="url(#re-spark)" />
    </svg>
  );
}

export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo" dir="ltr">
      <LogoMark size={size} />
      <span className="logo-word">Reel Estate</span>
    </span>
  );
}
