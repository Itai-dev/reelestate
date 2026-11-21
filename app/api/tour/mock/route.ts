import { mode } from "@/lib/server";
import { isTourLight, type TourLight } from "@/lib/tour";

export const dynamic = "force-dynamic";

// Test images for the tour in mock mode (FAL_MOCK=1), so the whole flow can be
// tried without spending anything. The panorama is a drawn 2:1 room with a grid
// and compass marks: in the viewer the grid lines must come out straight.
const SKY: Record<TourLight, [string, string, string]> = {
  morning: ["#cfe4f2", "#f3e6d2", "#b9ad9c"],
  day: ["#8dbde6", "#e9f1f5", "#c9bfae"],
  sunset: ["#39457e", "#f0a060", "#8f6f5c"],
  night: ["#0b1026", "#1d2748", "#2c2a33"],
};

const HUES = [28, 200, 140, 320, 80, 260];

export function GET(req: Request) {
  if (mode() !== "mock") return new Response("not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const light = isTourLight(q.get("light")) ? (q.get("light") as TourLight) : "day";
  const n = Math.abs(Number(q.get("n")) || 0) % HUES.length;
  const svg = q.get("kind") === "closeup" ? closeup(n) : pano(light, n);
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
}

function pano(light: TourLight, n: number) {
  const W = 3040;
  const H = 1520;
  const [top, mid, floor] = SKY[light];
  const hue = HUES[n];
  const ink = light === "night" || light === "sunset" ? "#ffffff" : "#1d1c19";
  const lines: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * W;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${ink}" stroke-opacity="${i % 6 === 0 ? 0.5 : 0.14}" stroke-width="${i % 6 === 0 ? 5 : 2}"/>`);
  }
  for (let j = 1; j < 12; j++) {
    const y = (j / 12) * H;
    lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${ink}" stroke-opacity="${j === 6 ? 0.6 : 0.14}" stroke-width="${j === 6 ? 5 : 2}"/>`);
  }
  // a window ahead, a door to the right, a sofa behind: enough to keep one's bearings
  const marks = [
    { u: 0.5, t: "0°" },
    { u: 0.75, t: "90°" },
    { u: 0.02, t: "180°" },
    { u: 0.25, t: "270°" },
  ]
    .map((m) => `<text x="${m.u * W}" y="${H * 0.46}" font-size="90" font-family="sans-serif" font-weight="700" fill="${ink}" text-anchor="${m.u < 0.05 ? "start" : "middle"}">${m.t}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${floor}"/><stop offset="1" stop-color="hsl(${hue} 30% ${light === "night" ? 14 : 38}%)"/></linearGradient>
</defs>
<rect width="${W}" height="${H / 2}" fill="url(#s)"/>
<rect y="${H / 2}" width="${W}" height="${H / 2}" fill="url(#f)"/>
<rect x="${W * 0.42}" y="${H * 0.3}" width="${W * 0.16}" height="${H * 0.26}" fill="hsl(${hue} 70% ${light === "night" ? 30 : 62}%)" stroke="${ink}" stroke-width="6"/>
<rect x="${W * 0.72}" y="${H * 0.33}" width="${W * 0.06}" height="${H * 0.3}" fill="hsl(${(hue + 150) % 360} 45% 45%)" stroke="${ink}" stroke-width="6"/>
<rect x="${W * 0.18}" y="${H * 0.52}" width="${W * 0.14}" height="${H * 0.1}" rx="30" fill="hsl(${(hue + 60) % 360} 35% 50%)" stroke="${ink}" stroke-width="6"/>
${lines.join("")}
${marks}
<text x="${W / 2}" y="${H * 0.25}" font-size="70" font-family="sans-serif" fill="${ink}" text-anchor="middle">mock panorama ${n + 1} · ${light}</text>
</svg>`;
}

function closeup(n: number) {
  const hue = HUES[n];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
<rect width="1920" height="1080" fill="hsl(${hue} 25% 70%)"/>
<rect x="460" y="240" width="1000" height="600" fill="hsl(${hue} 30% 86%)" stroke="#1d1c19" stroke-width="10"/>
<text x="960" y="570" font-size="80" font-family="sans-serif" fill="#1d1c19" text-anchor="middle">mock close view</text>
</svg>`;
}
