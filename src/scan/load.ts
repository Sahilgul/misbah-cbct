export const NX = 512;
export const NY = 512;

/** CBCT volume, x fastest, then y (front to back), then z (bottom to top). */
export type Volume = {
  data: Uint16Array;
  nx: number;
  ny: number;
  nz: number;
};

type Progress = (done: number, total: number) => void;
type SliceSource = { count: number; read: (index: number) => Promise<ArrayBuffer> };

const SLICE = /_vol_0_(\d{3})$/;

async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function loadFrom(source: SliceSource, onProgress: Progress): Promise<Volume> {
  const nz = source.count;
  const sliceSize = NX * NY;
  const data = new Uint16Array(sliceSize * nz);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < nz) {
      const z = next++;
      const raw = await gunzip(await source.read(z));
      if (raw.byteLength !== sliceSize * 2) throw new Error(`Slice ${z} has an unexpected size`);
      data.set(new Uint16Array(raw), z * sliceSize);
      onProgress(++done, nz);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return { data, nx: NX, ny: NY, nz };
}

/** Reads the single reduced scan shipped with the site. Values are 0–4080 in steps of 16. */
export async function loadBuiltin(): Promise<Volume> {
  const res = await fetch("/volume.cbct");
  if (!res.ok) throw new Error("The built-in scan was not found.");
  const raw = await gunzip(await res.arrayBuffer());
  const view = new DataView(raw);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "CBCT") throw new Error("The built-in scan file is not a volume.");
  const nx = view.getUint16(4, true);
  const ny = view.getUint16(6, true);
  const nz = view.getUint16(8, true);
  const count = nx * ny * nz;
  if (raw.byteLength !== 10 + count) throw new Error("The built-in scan file is incomplete.");
  const bytes = new Uint8Array(raw, 10, count);
  const data = new Uint16Array(count);
  for (let i = 0; i < count; i++) data[i] = bytes[i] * 16;
  return { data, nx, ny, nz };
}

/** Reads the slices that the dev server streams from the USB. */
export async function loadFromUsb(onProgress: Progress): Promise<Volume> {
  const res = await fetch("/scan/index.json");
  if (!res.ok) throw new Error("The USB scan was not found. Plug in the USB or pick the folder.");
  const { slices } = (await res.json()) as { slices: string[] };
  if (!slices.length) throw new Error("No scan slices on the USB.");
  return loadFrom(
    {
      count: slices.length,
      read: async (i) => {
        const r = await fetch(`/scan/${encodeURIComponent(slices[i])}`);
        if (!r.ok) throw new Error(`Could not read slice ${i}`);
        return r.arrayBuffer();
      },
    },
    onProgress,
  );
}

/** Reads the slices from a folder the user picks, for when the USB is mounted somewhere else. */
export async function loadFromFiles(files: FileList, onProgress: Progress): Promise<Volume> {
  const slices = Array.from(files)
    .filter((f) => SLICE.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!slices.length) throw new Error("That folder has no scan slices. Pick the GWG folder from the USB.");
  return loadFrom({ count: slices.length, read: (i) => slices[i].arrayBuffer() }, onProgress);
}
