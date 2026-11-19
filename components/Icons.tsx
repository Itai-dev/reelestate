// Line icons drawn for this app: 24px grid, 1.6px strokes, round joins.
type P = { className?: string };
const S = (p: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" className={`ico ${p.className ?? ""}`} aria-hidden>
    {p.children}
  </svg>
);

export const IconLink = (p: P) => (
  <S {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </S>
);

export const IconSpark = (p: P) => (
  <S {...p}>
    <path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5v1c-4.6.6-6.9 2.9-7.5 7.5h-1c-.6-4.6-2.9-6.9-7.5-7.5v-1c4.6-.6 6.9-2.9 7.5-7.5z" />
  </S>
);

export const IconChevron = (p: P) => (
  <S {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </S>
);

export const IconPlus = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);

export const IconPlay = (p: P) => (
  <S {...p}>
    <path d="M8 5.5v13l10.5-6.5z" />
  </S>
);

export const IconCheck = (p: P) => (
  <S {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </S>
);

export const IconAlert = (p: P) => (
  <S {...p}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4.5M12 17.2v.3" />
  </S>
);

export const IconDetails = (p: P) => (
  <S {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 9h8M8 12.5h8M8 16h5" />
  </S>
);

export const IconSliders = (p: P) => (
  <S {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </S>
);

export const IconChip = (p: P) => (
  <S {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
    <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
  </S>
);

export const IconPalette = (p: P) => (
  <S {...p}>
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.4-2.2-.6-1.3.2-2.6 1.6-2.6h1.8a3.7 3.7 0 0 0 3.7-3.7C20.5 7.3 16.7 3.5 12 3.5z" />
    <circle cx="8" cy="11" r="1.1" />
    <circle cx="11" cy="7.6" r="1.1" />
    <circle cx="15.4" cy="8.4" r="1.1" />
  </S>
);

export const IconTrash = (p: P) => (
  <S {...p}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </S>
);

export const IconArrow = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </S>
);

// A rectangle in the output's proportions, for the format tabs.
export const IconFrame = ({ w, h }: { w: number; h: number }) => {
  const k = 15 / Math.max(w, h);
  const rw = w * k;
  const rh = h * k;
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden>
      <rect x={12 - rw / 2} y={12 - rh / 2} width={rw} height={rh} rx="2" />
    </svg>
  );
};

export const IconSofa = (p: P) => (
  <S {...p}>
    <path d="M5 11V8.5A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5V11" />
    <path d="M3.5 12.5a1.5 1.5 0 0 1 3 0V14h11v-1.5a1.5 1.5 0 0 1 3 0V17a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
    <path d="M6 18v1.5M18 18v1.5" />
  </S>
);

export const IconKitchen = (p: P) => (
  <S {...p}>
    <path d="M5 11h14v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
    <path d="M3 11h18M7.5 11a4.5 4.5 0 0 1 9 0M12 6.5V5" />
  </S>
);

export const IconBed = (p: P) => (
  <S {...p}>
    <path d="M3.5 18.5V7M3.5 15h17v3.5M20.5 15v-2.5A2.5 2.5 0 0 0 18 10h-7v5" />
    <circle cx="7.3" cy="11.6" r="1.6" />
  </S>
);
