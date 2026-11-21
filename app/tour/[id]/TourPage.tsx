"use client";

import TourViewer from "@/components/TourViewer";
import type { SharedTour } from "./page";

// The page a buyer opens: the tour fills the screen, with the project's name,
// logo and a way to get in touch. Only what the owner entered is shown.
export default function TourPage({ tour }: { tour: SharedTour }) {
  const tel = tour.phone.replace(/[^\d+*#]/g, "");
  return (
    <main className="tour-page">
      <TourViewer spaces={tour.spaces} entry={tour.entry} title={[tour.name, tour.location].filter(Boolean).join(" · ") || undefined}>
        {(tour.logo || tel || tour.website) && (
          <aside className="tour-cta">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {tour.logo && <img src={tour.logo} alt={tour.name} />}
            {tel ? (
              <a className="tv-pill tour-cta-main" href={`tel:${tel}`}>
                {tour.cta || "לתיאום ביקור"} <span dir="ltr">{tour.phone}</span>
              </a>
            ) : tour.website ? (
              <a className="tv-pill tour-cta-main" href={tour.website} target="_blank" rel="noreferrer">
                {tour.cta || "לפרטים נוספים"}
              </a>
            ) : null}
          </aside>
        )}
      </TourViewer>
    </main>
  );
}
