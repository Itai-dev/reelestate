"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getUser, sb } from "@/lib/cloud";
import Logo from "./Logo";

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
  const [acct, setAcct] = useState<{ avatar?: string; initial: string } | null | undefined>(undefined);
  useEffect(() => {
    const read = (u: User | null) =>
      setAcct(u ? { avatar: u.user_metadata?.avatar_url as string | undefined, initial: (u.email ?? "?")[0].toUpperCase() } : null);
    getUser().then(read).catch(() => setAcct(null));
    const { data } = sb().auth.onAuthStateChange((_e: string, s: { user: User } | null) => read(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  const link = (href: string, label: string) => (
    <Link href={href} aria-current={path === href ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <nav className="nav" aria-label="ראשי">
      <div className="nav-inner">
        <div className="nav-links">
          {acct === null ? link("/login", "התחברות") : acct ? (
            <Link href="/projects" className="nav-me" aria-current={path === "/projects" ? "page" : undefined}>
              {acct.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={acct.avatar} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span>{acct.initial}</span>
              )}
              הפרויקטים שלי
            </Link>
          ) : null}
          {link("/", "סטודיו")}
          {link("/pricing", "מחירים")}
          {me?.user && link("/account", "חשבון")}
        </div>
        <Link href="/" className="nav-brand" aria-label="Reel Estate, לסטודיו">
          <Logo size={26} />
        </Link>
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
