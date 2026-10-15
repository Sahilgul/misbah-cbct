import type { Volume } from "./load";

export type Point = [number, number];

export type Textures = {
  /** 8-bit density, half resolution, light smoothing. */
  detail: Uint8Array;
  /** Same grid, stronger smoothing. Used for surfaces and lighting. */
  smooth: Uint8Array;
  nx: number;
  ny: number;
  nz: number;
};

const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));

/** Raw scan value to 8-bit. Scan values run from 0 to 4095. */
const to8 = (v: number) => Math.min(255, v / 16);

export async function buildTextures(vol: Volume): Promise<Textures> {
  const nx = vol.nx >> 1;
  const ny = vol.ny >> 1;
  const nz = vol.nz >> 1;
  const half = new Float32Array(nx * ny * nz);
  const cx = (nx - 1) / 2;
  const cy = (ny - 1) / 2;
  const r2 = (0.5 * nx - 1.5) ** 2;
  const src = vol.data;
  const sx = vol.nx;
  const sxy = vol.nx * vol.ny;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      const dy = y - cy;
      for (let x = 0; x < nx; x++) {
        const dx = x - cx;
        const o = (z * ny + y) * nx + x;
        if (dx * dx + dy * dy > r2 || z < 1 || z > nz - 2) {
          half[o] = 0;
          continue;
        }
        const b = 2 * z * sxy + 2 * y * sx + 2 * x;
        const sum =
          src[b] + src[b + 1] + src[b + sx] + src[b + sx + 1] +
          src[b + sxy] + src[b + sxy + 1] + src[b + sxy + sx] + src[b + sxy + sx + 1];
        half[o] = to8(sum / 8);
      }
    }
    if (z % 40 === 0) await yieldToBrowser();
  }
  const detail = Uint8Array.from(half);
  await yieldToBrowser();
  blur3d(half, nx, ny, nz, [1, 4, 6, 4, 1]);
  await yieldToBrowser();
  blur3d(half, nx, ny, nz, [1, 4, 6, 4, 1]);
  const smooth = Uint8Array.from(half);
  return { detail, smooth, nx, ny, nz };
}

function blur3d(v: Float32Array, nx: number, ny: number, nz: number, k: number[]) {
  const r = k.length >> 1;
  const sum = k.reduce((a, b) => a + b, 0);
  const w = k.map((x) => x / sum);
  const line = new Float32Array(Math.max(nx, ny, nz));
  const pass = (len: number, count: number, offset: (i: number) => number, stride: number) => {
    for (let i = 0; i < count; i++) {
      const base = offset(i);
      for (let j = 0; j < len; j++) line[j] = v[base + j * stride];
      for (let j = 0; j < len; j++) {
        let acc = 0;
        for (let t = -r; t <= r; t++) {
          const q = Math.min(len - 1, Math.max(0, j + t));
          acc += line[q] * w[t + r];
        }
        v[base + j * stride] = acc;
      }
    }
  };
  pass(nx, ny * nz, (i) => i * nx, 1);
  pass(ny, nx * nz, (i) => Math.floor(i / nx) * nx * ny + (i % nx), nx);
  pass(nz, nx * ny, (i) => i, nx * ny);
}

/** Finds the curve of the teeth on a top-down view of the bite. */
export function findArch(vol: Volume): Point[] {
  const { nx, ny, data } = vol;
  const mip = new Uint16Array(nx * ny);
  for (let z = 190; z < Math.min(300, vol.nz); z += 2) {
    const off = z * nx * ny;
    for (let i = 0; i < nx * ny; i++) if (data[off + i] > mip[i]) mip[i] = data[off + i];
  }
  const cx = nx / 2;
  const cy = 190;
  const found: Point[] = [];
  for (let k = 0; k < 90; k++) {
    const t = Math.PI * 0.85 + (k / 89) * Math.PI * 1.3;
    const dx = Math.cos(t);
    const dy = Math.sin(t);
    let best: [number, number, number, number] | null = null;
    for (let r = 40; r < 210; r++) {
      const x = Math.round(cx + r * dx);
      const y = Math.round(cy + r * dy);
      if (x < 0 || x >= nx || y < 0 || y >= ny || y > 255) break;
      const v = mip[y * nx + x];
      if (!best || v > best[0]) best = [v, x, y, r];
      if (best[0] > 1800 && v < best[0] - 500 && r > best[3] + 8) break;
    }
    if (best && best[0] > 1400) found.push([best[1], best[2]]);
  }
  return movingAverage(found, 11);
}

function movingAverage(points: Point[], window: number): Point[] {
  const pad = window >> 1;
  return points.map((_, i) => {
    let sx = 0;
    let sy = 0;
    for (let t = -pad; t <= pad; t++) {
      const p = points[Math.min(points.length - 1, Math.max(0, i + t))];
      sx += p[0];
      sy += p[1];
    }
    return [sx / window, sy / window];
  });
}

export function resample(points: Point[], n: number): Point[] {
  const dist = [0];
  for (let i = 1; i < points.length; i++) {
    dist.push(dist[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = dist[dist.length - 1];
  const out: Point[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (i / (n - 1)) * total;
    while (j < dist.length - 2 && dist[j + 1] < d) j++;
    const span = dist[j + 1] - dist[j] || 1;
    const f = (d - dist[j]) / span;
    out.push([
      points[j][0] + (points[j + 1][0] - points[j][0]) * f,
      points[j][1] + (points[j + 1][1] - points[j][1]) * f,
    ]);
  }
  return out;
}

/** Lengthens both ends of the tooth curve so the panoramic reaches the jaw corners. */
export function panoramicCurve(arch: Point[]): Point[] {
  const pts = resample(arch, 200);
  const centerX = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const tail = (p0: Point, p1: Point): Point[] => {
    let dx = p0[0] - p1[0];
    let dy = p0[1] - p1[1];
    const len = Math.hypot(dx, dy) || 1;
    dx = dx / len + Math.sign(p0[0] - centerX) * 0.45;
    dy = dy / len;
    const l2 = Math.hypot(dx, dy);
    return Array.from({ length: 110 }, (_, s): Point => [p0[0] + (dx / l2) * (s + 1), p0[1] + (dy / l2) * (s + 1)]);
  };
  const head = tail(pts[0], pts[6]).reverse();
  const end = tail(pts[pts.length - 1], pts[pts.length - 7]);
  return resample(movingAverage(resample([...head, ...pts, ...end], 600), 31), 900);
}

export function normals(curve: Point[]): Point[] {
  return curve.map((_, i) => {
    const a = curve[Math.max(0, i - 1)];
    const b = curve[Math.min(curve.length - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    return [-ty / len, tx / len];
  });
}

function sampleXY(vol: Volume, z: number, x: number, y: number): number {
  const { nx, ny, data } = vol;
  const cx = Math.min(nx - 1.001, Math.max(0, x));
  const cy = Math.min(ny - 1.001, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const fx = cx - x0;
  const fy = cy - y0;
  const o = z * nx * ny + y0 * nx + x0;
  return (
    data[o] * (1 - fx) * (1 - fy) +
    data[o + 1] * fx * (1 - fy) +
    data[o + nx] * (1 - fx) * fy +
    data[o + nx + 1] * fx * fy
  );
}

export type Gray = { pixels: Uint8Array; width: number; height: number };

/** Averages a thick band along the jaw curve, like a panoramic X-ray film. */
export function panoramic(vol: Volume, curve: Point[], zLo = 60, zHi = 400, half = 40): Gray {
  const nrm = normals(curve);
  const width = curve.length;
  const height = zHi - zLo;
  const acc = new Float32Array(width * height);
  let total = 0;
  for (let off = -half; off <= half; off++) {
    const w = Math.exp(-0.5 * (off / (half * 0.6)) ** 2);
    total += w;
    for (let i = 0; i < width; i++) {
      const x = curve[i][0] + nrm[i][0] * off;
      const y = curve[i][1] + nrm[i][1] * off;
      for (let z = zLo; z < zHi; z++) {
        acc[(zHi - 1 - z) * width + i] += w * sampleXY(vol, z, x, y);
      }
    }
  }
  for (let i = 0; i < acc.length; i++) acc[i] /= total;
  const sorted = Float32Array.from(acc.filter((_, i) => i % 7 === 0)).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.floor(sorted.length * 0.997)];
  const pixels = new Uint8Array(acc.length);
  for (let i = 0; i < acc.length; i++) {
    const t = Math.min(1, Math.max(0, (acc[i] - lo) / (hi - lo || 1)));
    pixels[i] = Math.round(255 * t ** 1.25);
  }
  return { pixels, width, height };
}

/** Raw scan values on a vertical cut across the jaw at one point of the curve. */
export function crossSection(vol: Volume, p: Point, n: Point, zLo = 100, zHi = 380, halfWidth = 70) {
  const width = halfWidth * 2 + 1;
  const height = zHi - zLo;
  const values = new Uint16Array(width * height);
  for (let k = 0; k < width; k++) {
    const off = k - halfWidth;
    const x = p[0] + n[0] * off;
    const y = p[1] + n[1] * off;
    for (let z = zLo; z < zHi; z++) values[(zHi - 1 - z) * width + k] = sampleXY(vol, z, x, y);
  }
  return { values, width, height };
}
