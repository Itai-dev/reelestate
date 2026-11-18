import type { Metadata } from "next";
import Projects from "./Projects";

export const metadata: Metadata = { title: "הפרויקטים שלי — Reel Estate" };

export default function ProjectsPage() {
  return <Projects />;
}
