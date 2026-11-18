"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { deleteProject, getUser, listProjects, signOut, signedUrls, type CloudProject } from "@/lib/cloud";
import Thinking from "@/components/Thinking";
import { GoogleButton } from "@/components/Studio";
import { IconPlus } from "@/components/Icons";

const when = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default function Projects() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [items, setItems] = useState<CloudProject[] | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const u = await getUser().catch(() => null);
      setUser(u);
      if (!u) return;
      try {
        const list = await listProjects();
        setItems(list);
        setCovers(await signedUrls(list.map((p) => p.cover_path).filter((x): x is string => Boolean(x))));
      } catch {
        setError("לא הצלחנו לטעון את הפרויקטים. רעננו את העמוד.");
        setItems([]);
      }
    })();
  }, []);

  if (user === undefined) return <main className="page"><Thinking lines={["טוען את החשבון"]} /></main>;

  if (!user)
    return (
      <main className="page narrow">
        <header className="page-head">
          <h1>הפרויקטים שלי</h1>
          <p>מתחברים עם Google, וכל פרויקט נשמר בחשבון: התמונות, הקליפים, המותג והטקסטים. פותחים אותו מכל מכשיר.</p>
        </header>
        <GoogleButton next="/projects" />
      </main>
    );

  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email;
  return (
    <main className="page">
      <header className="page-head projects-head">
        <div>
          <h1>הפרויקטים שלי</h1>
          <p>
            מחובר בתור {name}.{" "}
            <button
              type="button"
              className="link"
              onClick={async () => {
                await signOut();
                location.href = "/";
              }}
            >
              התנתקות
            </button>
          </p>
        </div>
        <Link className="btn btn-primary" href="/?new=1">
          <IconPlus /> פרויקט חדש
        </Link>
      </header>
      {error && <p className="error-inline">{error}</p>}
      {items === null ? (
        <Thinking lines={["טוען את הפרויקטים"]} />
      ) : items.length === 0 ? (
        <div className="block empty-block">
          <p>עוד אין פרויקטים שמורים. פרויקט שתפתחו בסטודיו יישמר כאן אוטומטית.</p>
          <Link className="btn btn-outline" href="/">
            לסטודיו
          </Link>
        </div>
      ) : (
        <div className="projects">
          {items.map((p) => {
            const shots = ((p.data as { shots?: unknown[] }).shots ?? []).length;
            return (
              <article key={p.id} className="project">
                <Link href={`/?p=${p.id}`} className="project-open">
                  <span className="project-cover">
                    {p.cover_path && covers[p.cover_path] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={covers[p.cover_path]} alt="" />
                    ) : null}
                  </span>
                  <b>{p.name || "בלי שם"}</b>
                  <small>
                    {shots} חללים · עודכן {when(p.updated_at)}
                  </small>
                </Link>
                <button
                  type="button"
                  className="link project-del"
                  onClick={async () => {
                    if (!confirm(`למחוק את "${p.name || "בלי שם"}"? התמונות והקליפים יימחקו מהחשבון.`)) return;
                    await deleteProject(user.id, p.id).catch(() => setError("המחיקה נכשלה"));
                    setItems((xs) => xs?.filter((x) => x.id !== p.id) ?? null);
                  }}
                >
                  מחיקה
                </button>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
