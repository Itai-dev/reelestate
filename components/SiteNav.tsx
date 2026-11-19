"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getUser, sb, signOut } from "@/lib/cloud";
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

type Acct = { avatar?: string; initial: string; name?: string; email?: string };

// The avatar opens the account menu: everything that isn't the landing page lives here.
function AccountMenu({ acct, me }: { acct: Acct; me: Me | null }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const item = (href: string, label: string, note?: string) => (
    <Link href={href} role="menuitem" className="menu-item" aria-current={path === href ? "page" : undefined}>
      <span>{label}</span>
      {note && <small>{note}</small>}
    </Link>
  );
  return (
    <div className="acct" ref={box}>
      <button
        type="button"
        className="acct-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="התפריט שלי"
        onClick={() => setOpen((o) => !o)}
      >
        {acct.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={acct.avatar} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span>{acct.initial}</span>
        )}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            {acct.name && <b>{acct.name}</b>}
            {acct.email && <small dir="ltr">{acct.email}</small>}
            {me?.accounts && me.user && (
              <Link href="/account" className="menu-credits">
                <b>{me.credits?.total ?? 0}</b> קרדיטים
              </Link>
            )}
          </div>
          <div className="menu-group">
            {item("/projects", "הסטודיו", "כל הפרויקטים")}
            {item("/studio?new=1", "פרויקט חדש")}
          </div>
          <div className="menu-group">
            {me?.accounts && me.user && item("/account", "חשבון ומנוי")}
            {item("/pricing", "מסלולים ומחירים")}
            {me?.accounts && item("/pricing#packs", "קניית קרדיטים")}
            {item("/pricing#faq", "שאלות נפוצות")}
          </div>
          <div className="menu-group">
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={async () => {
                await signOut().catch(() => {});
                window.location.href = "/";
              }}
            >
              <span>התנתקות</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SiteNav() {
  const me = useMe();
  const path = usePathname();
  const [acct, setAcct] = useState<Acct | null | undefined>(undefined);
  useEffect(() => {
    const read = (u: User | null) =>
      setAcct(
        u
          ? {
              avatar: u.user_metadata?.avatar_url as string | undefined,
              initial: (u.email ?? "?")[0].toUpperCase(),
              name: (u.user_metadata?.full_name as string | undefined) ?? undefined,
              email: u.email ?? undefined,
            }
          : null,
      );
    getUser().then(read).catch(() => setAcct(null));
    const { data } = sb().auth.onAuthStateChange((_e: string, s: { user: User } | null) => read(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <nav className="nav" aria-label="ראשי">
      <div className="nav-inner">
        <div className="nav-links">
          {acct === null ? (
            <Link href={`/login?next=${encodeURIComponent(path || "/projects")}`} className="nav-login">
              התחברות
            </Link>
          ) : acct ? (
            <AccountMenu acct={acct} me={me} />
          ) : null}
        </div>
        <Link href="/" className="nav-brand" aria-label="Reel Estate, לעמוד הבית">
          <Logo size={26} />
        </Link>
      </div>
    </nav>
  );
}
