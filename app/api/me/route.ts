import { authConfigured, currentUser, ensureProfile, usableCredits } from "@/lib/supabase";
import { growConfigured } from "@/lib/grow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!authConfigured()) return Response.json({ accounts: false, user: null });
  const user = await currentUser();
  if (!user) return Response.json({ accounts: true, billing: growConfigured(), user: null });
  const p = await ensureProfile(user);
  return Response.json({
    accounts: true,
    billing: growConfigured(),
    user: { email: user.email },
    profile: {
      fullName: p.full_name,
      phone: p.phone,
      plan: p.plan,
      status: p.sub_status,
      periodEnd: p.current_period_end,
    },
    credits: usableCredits(p),
  });
}
