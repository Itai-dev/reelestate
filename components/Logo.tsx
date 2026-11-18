// The Reel Estate mark: two stacked story frames, the front one with a play cut.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="logo-mark">
      <defs>
        <mask id="re-mark">
          <rect width="24" height="24" fill="#fff" />
          <rect x="1.6" y="5.6" width="14.8" height="18.8" rx="3" fill="#000" />
        </mask>
        <mask id="re-play">
          <rect width="24" height="24" fill="#fff" />
          <path d="M7.2 12.3v5.4l4.1-2.7z" fill="#000" stroke="#000" strokeWidth="1.7" strokeLinejoin="round" />
        </mask>
      </defs>
      <rect x="8.8" y="1" width="12.6" height="17" rx="2.2" fill="currentColor" mask="url(#re-mark)" />
      <rect x="3" y="7" width="12" height="16" rx="2.2" fill="currentColor" mask="url(#re-play)" />
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
