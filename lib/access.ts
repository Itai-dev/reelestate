import { authConfigured, currentUser } from "./supabase";
import { guard } from "./server";
import type { User } from "@supabase/supabase-js";

// Who may call a paid endpoint: a signed-in user when accounts are set up,
// otherwise (local/dev) whoever knows APP_PASSWORD.
export async function access(req: Request): Promise<{ user: User | null } | Response> {
  if (authConfigured()) {
    const user = await currentUser();
    if (!user) return Response.json({ error: "צריך להתחבר כדי ליצור וידאו", code: "auth" }, { status: 401 });
    return { user };
  }
  const denied = guard(req);
  if (denied) return denied;
  return { user: null };
}

export function siteOrigin(req: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(req.url).origin;
}
