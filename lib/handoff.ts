// Carries what someone typed or attached on the landing page into a new studio project.
// Lives in memory, so it survives client-side navigation but not a reload.
export type Handoff = { files: File[]; text: string };

let pending: Handoff | null = null;

export const setHandoff = (h: Handoff) => {
  pending = h;
};

export const takeHandoff = (): Handoff | null => {
  const h = pending;
  pending = null;
  return h;
};
