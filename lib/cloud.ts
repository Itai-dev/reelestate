"use client";
// Projects saved to the signed-in user's account: one row per project and the
// project's files in a private folder of their own.
import { createBrowserClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { SB_ANON, SB_URL } from "./sb-public";

let client: ReturnType<typeof createBrowserClient> | null = null;
export const sb = () => (client ??= createBrowserClient(SB_URL, SB_ANON));

const BUCKET = "re-media";

export async function getUser(): Promise<User | null> {
  const { data } = await sb().auth.getSession();
  return data.session?.user ?? null;
}

export function signInWithGoogle(next = "/studio") {
  return sb().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
}

export async function signOut() {
  await sb().auth.signOut();
  await fetch("/auth/signout", { method: "POST" }).catch(() => {});
}

export type CloudFiles = { img: Record<string, string>; vid: Record<string, string>; tour?: Record<string, string>; logo?: string; music?: string };

export type CloudProject = {
  id: string;
  name: string;
  data: Record<string, unknown> & { files?: CloudFiles };
  cover_path: string | null;
  updated_at: string;
};

export async function listProjects(): Promise<CloudProject[]> {
  const { data, error } = await sb().from("re_projects").select("id,name,data,cover_path,updated_at").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CloudProject[];
}

export async function getProject(id: string): Promise<CloudProject | null> {
  const { data, error } = await sb().from("re_projects").select("id,name,data,cover_path,updated_at").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as CloudProject | null;
}

export async function saveProject(p: { id: string; userId: string; name: string; data: unknown; cover: string | null }) {
  const { error } = await sb()
    .from("re_projects")
    .upsert({ id: p.id, user_id: p.userId, name: p.name, data: p.data, cover_path: p.cover, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function deleteProject(userId: string, id: string) {
  const folder = `${userId}/${id}`;
  const { data } = await sb().storage.from(BUCKET).list(folder, { limit: 1000 });
  if (data?.length) await sb().storage.from(BUCKET).remove(data.map((f: { name: string }) => `${folder}/${f.name}`));
  const { error } = await sb().from("re_projects").delete().eq("id", id);
  if (error) throw error;
}

export async function upload(path: string, blob: Blob) {
  const { error } = await sb().storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || undefined });
  if (error) throw error;
  return path;
}

export async function download(path: string): Promise<Blob> {
  const { data, error } = await sb().storage.from(BUCKET).download(path);
  if (error || !data) throw error ?? new Error("download failed");
  return data;
}

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await sb().storage.from(BUCKET).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
