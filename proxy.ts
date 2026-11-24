// Keeps the Supabase session cookie fresh on every page load.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SB_ANON, SB_URL } from "./lib/sb-public";

export async function proxy(request: NextRequest) {
  const url = SB_URL;
  const key = SB_ANON;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // skip static files, images, the payment provider's server callbacks and the
  // public tour pages and the standalone DW22 picker (their visitors have no session)
  matcher: ["/((?!_next/static|_next/image|icon.svg|mock/|fal-media/|tour/|dw22|api/billing/notify|api/billing/webhook).*)"],
};
