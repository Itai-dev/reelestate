import type { Aspect, LightId, ModelKey, MotionId, Pace, RoomId } from "@/lib/presets";
import { buildPrompt } from "@/lib/presets";
import type { ReelInfo } from "@/lib/reel";

export type ShotStatus = "idle" | "preparing" | "queued" | "rendering" | "done" | "error";

export type Shot = {
  id: string;
  room: RoomId;
  motion: MotionId;
  light: LightId;
  life: boolean;
  fx: number;
  fy: number;
  imgW: number;
  imgH: number;
  customPrompt?: string;
  status: ShotStatus;
  position?: number;
  error?: string;
  requestId?: string;
  modelKey?: ModelKey;
  pendingSig?: string;
  genSig?: string;
  videoUrl?: string;
};

export type Settings = {
  aspect: Aspect;
  layout: "full" | "split";
  pace: Pace;
  model: ModelKey;
  labels: boolean;
};

export type Info = ReelInfo;

export type Media = Record<string, { img: string; vid?: string }>;

export const promptOf = (s: Shot) => s.customPrompt ?? buildPrompt(s);

// What a clip depends on. If it changes after generation, the clip is out of date.
export const sigOf = (s: Shot, aspect: Aspect) =>
  `${aspect}|${s.fx.toFixed(2)}|${s.fy.toFixed(2)}|${promptOf(s)}`;
