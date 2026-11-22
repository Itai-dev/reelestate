import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { authConfigured, supabaseAdmin } from "@/lib/supabase";
import { viewOf, type Tour, type ViewEntry, type ViewSpace } from "@/lib/tour";
import TourPage from "./TourPage";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  user_id: string;
  name: string;
  data: {
    tour?: Tour;
    info?: { name?: string; location?: string; cta?: string; phone?: string; website?: string };
    files?: { tour?: Record<string, string>; logo?: string };
  } | null;
};

export type SharedTour = {
  spaces: ViewSpace[];
  entry?: ViewEntry;
  name: string;
  location: string;
  cta: string;
  phone: string;
  website: string; // a checked https address, or ""
  logo?: string;
};

const DAY = 60 * 60 * 24;

// A tour its owner switched on for sharing. The page reads the project on the
// server and hands out day-long addresses for the tour's own files only, so
// nothing else in the account is exposed.
const read = cache(async (id: string): Promise<SharedTour | null> => {
  if (!authConfigured() || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  const db = supabaseAdmin();
  const { data } = await db.from("re_projects").select("id,user_id,name,data").eq("id", id).maybeSingle();
  const row = data as Row | null;
  const tour = row?.data?.tour;
  if (!row || !tour?.published || !Array.isArray(tour.spaces)) return null;

  // only files inside this project's own folder are ever signed
  const folder = `${row.user_id}/${row.id}/`;
  const own = (p: unknown): p is string => typeof p === "string" && p.startsWith(folder) && !p.includes("..");
  const shown = (key: string) => !key.startsWith("base:") && key !== "closeup"; // working files stay private
  const files = Object.fromEntries(Object.entries(row.data?.files?.tour ?? {}).filter(([k, p]) => shown(k) && own(p)));
  const logo = own(row.data?.files?.logo) ? row.data!.files!.logo! : undefined;
  const paths = [...new Set([...Object.values(files), ...(logo ? [logo] : [])])];
  if (!paths.length) return null;
  const { data: signed } = await db.storage.from("re-media").createSignedUrls(paths, DAY);
  const url = new Map<string, string>();
  for (const s of signed ?? []) if (s.path && s.signedUrl) url.set(s.path, s.signedUrl);

  const view = viewOf(tour, (key) => (files[key] ? url.get(files[key]) : undefined));
  if (!view.spaces.length) return null;
  const info = row.data?.info ?? {};
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    ...view,
    name: text(info.name, 120) || text(row.name, 120),
    location: text(info.location, 120),
    cta: text(info.cta, 120),
    phone: text(info.phone, 40),
    website: site(text(info.website, 200)),
    logo: logo ? url.get(logo) : undefined,
  };
});

// The owner's site as a safe link: http(s) only.
function site(v: string) {
  if (!v) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const t = await read((await params).id);
  if (!t) return { title: "סיור אינטראקטיבי", robots: { index: false } };
  const where = [t.name, t.location].filter(Boolean).join(", ");
  return {
    title: where ? `${where} — סיור אינטראקטיבי` : "סיור אינטראקטיבי",
    description: "מסתובבים בנכס: מבט 360° בכל חלל, מעבר בין החללים ותצוגת תאורה מבוקר עד לילה.",
    // shared by link; the owner decides where it appears
    robots: { index: false },
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const t = await read((await params).id);
  if (!t) notFound();
  return <TourPage tour={t} />;
}
