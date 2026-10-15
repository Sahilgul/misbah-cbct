export type Lut = Uint8ClampedArray;

function makeLut(fn: (g: number) => [number, number, number]): Lut {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = fn(i / 255);
    lut[i * 3] = r * 255;
    lut[i * 3 + 1] = g * 255;
    lut[i * 3 + 2] = b * 255;
  }
  return lut;
}

/** Pinkish gray, close to the lab's printed report. */
export const PINK = makeLut((g) => [0.07 + g ** 0.95, 0.04 + 0.86 * g ** 1.1, 0.08 + 0.92 * g]);
export const GRAY = makeLut((g) => [g, g, g]);

/** Draws 8-bit pixels into a canvas through a color table. */
export function paintGray(canvas: HTMLCanvasElement, pixels: Uint8Array, width: number, height: number, lut: Lut) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  const out = img.data;
  for (let i = 0, j = 0; i < pixels.length; i++, j += 4) {
    const k = pixels[i] * 3;
    out[j] = lut[k];
    out[j + 1] = lut[k + 1];
    out[j + 2] = lut[k + 2];
    out[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return ctx;
}

/** Brightness and contrast for raw scan values. */
export function windowValues(values: Uint16Array | ArrayLike<number>, center: number, width: number): Uint8Array {
  const out = new Uint8Array(values.length);
  const lo = center - width / 2;
  const s = 255 / Math.max(width, 1);
  for (let i = 0; i < values.length; i++) {
    const v = (values[i] - lo) * s;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}
