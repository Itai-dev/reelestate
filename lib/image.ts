// Photo helpers: decode, shrink, and crop to the output frame around a focus point.

export async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function canvasToBlob(c: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", quality),
  );
}

// Keeps phone photos reasonable in size (and strips EXIF rotation issues).
export async function normalize(file: Blob, maxSide = 2400): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await decode(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { blob: await canvasToBlob(c, 0.92), w, h };
}

// Source rectangle that covers a dst aspect, centered on the focus point (0..1).
export function coverRect(sw: number, sh: number, dw: number, dh: number, fx = 0.5, fy = 0.5) {
  const scale = Math.max(dw / sw, dh / sh);
  const cw = dw / scale;
  const ch = dh / scale;
  const x = Math.min(Math.max(fx * sw - cw / 2, 0), sw - cw);
  const y = Math.min(Math.max(fy * sh - ch / 2, 0), sh - ch);
  return { x, y, w: cw, h: ch };
}

export async function cropToFrame(
  blob: Blob,
  outW: number,
  outH: number,
  fx: number,
  fy: number,
): Promise<{ canvas: HTMLCanvasElement; blob: () => Promise<Blob> }> {
  const bmp = await decode(blob);
  const r = coverRect(bmp.width, bmp.height, outW, outH, fx, fy);
  const c = document.createElement("canvas");
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, outW, outH);
  bmp.close();
  return { canvas: c, blob: () => canvasToBlob(c, 0.9) };
}

// A 360° image as the tour keeps it: equirectangular (twice as wide as it is
// high), at most maxW wide, as a JPEG. Returns null for an image of any other shape.
export async function preparePano(file: Blob, maxW: number): Promise<{ blob: Blob; w: number; h: number } | null> {
  const bmp = await decode(file);
  try {
    if (!bmp.height || Math.abs(bmp.width / bmp.height - 2) > 0.06) return null;
    const w = Math.min(maxW, bmp.width) & ~1;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = w / 2;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return { blob: await canvasToBlob(c, 0.9), w: c.width, h: c.height };
  } finally {
    bmp.close();
  }
}
