# Frame extension, step 2 (run on each generated square); needs opencv-python-headless
"""compose.py <frame.webp> <generated.png> <out.webp>
Line the generated square up with the original frame (features + RANSAC), then lay the untouched original over it
with a soft seam, so only the bands above and below come from the generator. Prints the alignment quality."""
import sys, json
import numpy as np, cv2
TOP, BOT, S = 300, 100, 2000
orig = cv2.imread(sys.argv[1], cv2.IMREAD_COLOR)            # 2000x1600
gen = cv2.imread(sys.argv[2], cv2.IMREAD_COLOR)
gen = cv2.resize(gen, (S, S), interpolation=cv2.INTER_LANCZOS4)
canvas = np.zeros((S, S, 3), np.uint8); canvas[TOP:TOP + 1600] = orig
orb = cv2.ORB_create(6000)
mask = np.zeros((S, S), np.uint8); mask[TOP + 40:TOP + 1560, 40:S - 40] = 255
k1, d1 = orb.detectAndCompute(cv2.cvtColor(gen, cv2.COLOR_BGR2GRAY), mask)
k2, d2 = orb.detectAndCompute(cv2.cvtColor(canvas, cv2.COLOR_BGR2GRAY), mask)
m = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d1, d2)
m = sorted(m, key=lambda x: x.distance)[:1500]
src = np.float32([k1[x.queryIdx].pt for x in m]); dst = np.float32([k2[x.trainIdx].pt for x in m])
M, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3)
n = int(inl.sum()) if inl is not None else 0
scale = float(np.hypot(M[0, 0], M[1, 0])) if M is not None else 0
info = {"matches": len(m), "inliers": n, "scale": round(scale, 4), "shift": [round(float(M[0, 2]), 1), round(float(M[1, 2]), 1)] if M is not None else None}
ok = M is not None and n >= 60 and 0.9 < scale < 1.1
warped = cv2.warpAffine(gen, M, (S, S), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE) if ok else gen
# residual difference inside the original's area after alignment
diff = float(np.abs(warped[TOP:TOP + 1600].astype(int) - orig.astype(int)).mean())
info.update(ok=bool(ok), residual=round(diff, 1))
a = np.ones((S, S), np.float32); F = 46  # feathered seam inside the original's edges
ramp = np.linspace(0, 1, F, dtype=np.float32)
a[:TOP] = 0; a[TOP + 1600:] = 0
a[TOP:TOP + F] = ramp[:, None]; a[TOP + 1600 - F:TOP + 1600] = ramp[::-1][:, None]
out = (canvas * a[..., None] + warped * (1 - a[..., None])).astype(np.uint8)
out = cv2.resize(out, (1600, 1600), interpolation=cv2.INTER_AREA)
cv2.imwrite(sys.argv[3], out, [cv2.IMWRITE_WEBP_QUALITY, 76])
print(json.dumps(info))
