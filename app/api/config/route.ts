import { mode } from "@/lib/server";
import { authConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ mode: mode(), accounts: authConfigured(), protected: !authConfigured() && Boolean(process.env.APP_PASSWORD) });
}
