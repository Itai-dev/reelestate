"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type Me = {
  accounts: boolean;
  billing?: boolean;
  user: { email: string } | null;
  profile?: { fullName: string | null; phone: string | null; plan: string | null; status: string; periodEnd: string | null };
  credits?: { plan: number; extra: number; total: number };
};

// Other components call this after spending or buying credits.
export const refreshMe = () => window.dispatchEvent(new Event("reel:me"));

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/me", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && setMe(d))
        .catch(() => alive && setMe({ accounts: false, user: null }));
    load();
    window.addEventListener("reel:me", load);
    return () => {
      alive = false;
      window.removeEventListener("reel:me", load);
    };
  }, []);
  return me;
}

export default function SiteNav() {
  const me = useMe();
  const path = usePathname();
  const link = (href: string, label: string) => (
    <Link href={href} aria-current={path === href ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <nav className="nav" aria-label="ראשי">
      <div className="nav-inner">
        <Link href="/" className="nav-brand" dir="ltr">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M3.5 11.2L12 4l8.5 7.2V20h-17z" />
            <path d="M10 10.5v6l5-3z" className="nav-play" />
          </svg>
          reel estate
        </Link>
        <div className="nav-links">
          {link("/", "סטודיו")}
          {link("/pricing", "מחירים")}
          {me?.user && link("/account", "חשבון")}
        </div>
        <div className="nav-account">
          {me?.accounts &&
            (me.user ? (
              <Link href="/account" className="nav-credits" aria-current={path === "/account" ? "page" : undefined}>
                <b>{me.credits?.total ?? 0}</b> קרדיטים
              </Link>
            ) : (
              <Link href={`/login?next=${encodeURIComponent(path || "/")}`} className="btn btn-outline btn-small">
                התחברות
              </Link>
            ))}
        </div>
      </div>
    </nav>
  );
}
