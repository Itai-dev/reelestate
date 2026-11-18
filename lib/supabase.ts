// Supabase clients. Accounts live in the studio-hq project, in tables
// prefixed re_ (see supabase/migrations).
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const authConfigured = () => Boolean(URL && ANON);

// Per-request client that reads and refreshes the signed-in user's session cookie.
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(URL!, ANON!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component: the proxy refreshes cookies instead */
        }
      },
    },
  });
}

// Server-only client with full access. Never import from client components.
let admin: ReturnType<typeof createClient> | null = null;
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
  if (!admin) admin = createClient(URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  plan: string | null;
  sub_status: "none" | "active" | "past_due" | "canceled";
  current_period_end: string | null;
  plan_credits: number;
  extra_credits: number;
  grow_direct_debit_id: string | null;
  grow_transaction_id: string | null;
  grow_transaction_token: string | null;
  grow_asmachta: string | null;
};

export async function currentUser() {
  if (!authConfigured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

// Creates the profile row on first use (we don't touch auth.users triggers,
// because the project is shared with studio-hq).
export async function ensureProfile(user: { id: string; email?: string | null }): Promise<Profile> {
  const db = supabaseAdmin();
  const { data } = await db.from("re_profiles").select("*").eq("id", user.id).maybeSingle();
  if (data) return data as Profile;
  const { data: created, error } = await db
    .from("re_profiles")
    .upsert({ id: user.id, email: user.email ?? null } as never, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return created as Profile;
}

// Plan credits count only while the paid period is valid.
export function usableCredits(p: Profile) {
  const planValid =
    (p.sub_status === "active" || p.sub_status === "canceled") &&
    p.current_period_end !== null &&
    new Date(p.current_period_end).getTime() > Date.now();
  const plan = planValid ? p.plan_credits : 0;
  return { plan, extra: p.extra_credits, total: plan + p.extra_credits };
}
