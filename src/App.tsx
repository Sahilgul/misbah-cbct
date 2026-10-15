import { useEffect, useMemo, useRef, useState } from "react";
import { GRAY, PINK } from "./colors";
import { Cuts, type Cut } from "./components/Cuts";
import { Panoramic } from "./components/Panoramic";
import { SliceViews } from "./components/SliceViews";
import { Viewer3D } from "./components/Viewer3D";
import { loadFromFiles, loadFromUsb, type Volume } from "./scan/load";
import {
  buildTextures, crossSection, findArch, normals, panoramic, panoramicCurve, resample,
  type Gray, type Point, type Textures,
} from "./scan/process";

type Ready = { vol: Volume; textures: Textures; arch: Point[]; pano: Gray; cuts: Cut[] };

const CUT_LABELS = [
  "Back corner", "Back tooth", "Side", "Toward the front", "Front",
  "Toward the front", "Side", "Back tooth", "Back corner",
];

const PRESETS = [
  { label: "Bone", center: 1100, width: 2200 },
  { label: "Wide", center: 1500, width: 3500 },
  { label: "Teeth", center: 1800, width: 1400 },
];

async function prepare(vol: Volume, status: (s: string) => void): Promise<Ready> {
  status("Building the 3D picture...");
  const textures = await buildTextures(vol);
  status("Finding the jaw line...");
  await new Promise((r) => setTimeout(r, 0));
  const arch = resample(findArch(vol), 480);
  const pano = panoramic(vol, panoramicCurve(arch));
  const nrm = normals(arch);
  const cuts = CUT_LABELS.map((label, i) => {
    const k = Math.round((i / (CUT_LABELS.length - 1)) * (arch.length - 1));
    return { label, ...crossSection(vol, arch[k], nrm[k]) };
  });
  return { vol, textures, arch, pano, cuts };
}

export function App() {
  const [ready, setReady] = useState<Ready | null>(null);
  const [status, setStatus] = useState("Reading the scan from the USB...");
  const [error, setError] = useState<string | null>(null);
  const [labColors, setLabColors] = useState(true);
  const [center, setCenter] = useState(1100);
  const [width, setWidth] = useState(2200);
  const lut = labColors ? PINK : GRAY;

  const progress = (done: number, total: number) => setStatus(`Reading the scan: ${done} of ${total} slices`);

  const run = (load: () => Promise<Volume>) => {
    setError(null);
    load()
      .then((vol) => prepare(vol, setStatus))
      .then(setReady)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run(() => loadFromUsb(progress));
  }, []);

  const archDraw = useMemo(() => (ready ? ready.arch.filter((_, i) => i % 8 === 0) : []), [ready]);
  const start = useMemo(() => {
    if (!ready) return { x: 256, y: 256, z: 240 };
    const front = ready.arch[ready.arch.length >> 1];
    return { x: Math.round(front[0]), y: Math.round(front[1]), z: 240 };
  }, [ready]);

  return (
    <main>
      <header>
        <h1>Dental CBCT</h1>
        <p>Lab-style 3D, panoramic, and slice views rebuilt from the scan on the USB. For looking only; the dentist reads the scan.</p>
      </header>

      {!ready && (
        <section className="panel loading">
          {error ? (
            <>
              <p className="error">{error}</p>
              <label className="pick">
                Pick the scan folder from the USB (the one named GWG...)
                <input
                  type="file"
                  // @ts-expect-error webkitdirectory is not in the React types
                  webkitdirectory=""
                  multiple
                  onChange={(e) => e.target.files && run(() => loadFromFiles(e.target.files!, progress))}
                />
              </label>
            </>
          ) : (
            <p>{status}</p>
          )}
        </section>
      )}

      {ready && (
        <>
          <Viewer3D textures={ready.textures} />
          <Panoramic image={ready.pano} lut={lut} />
          <section className="panel">
            <div className="controls">
              <label>
                Brightness <span className="num">{center}</span>
                <input type="range" min={0} max={4095} value={center} onChange={(e) => setCenter(Number(e.target.value))} />
              </label>
              <label>
                Contrast <span className="num">{width}</span>
                <input type="range" min={50} max={4095} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
              </label>
              <div className="buttons">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={center === p.center && width === p.width ? "on" : ""}
                    onClick={() => { setCenter(p.center); setWidth(p.width); }}
                  >
                    {p.label}
                  </button>
                ))}
                <button type="button" className={labColors ? "on" : ""} onClick={() => setLabColors((v) => !v)}>
                  Lab colors
                </button>
              </div>
            </div>
            <SliceViews vol={ready.vol} lut={lut} center={center} width={width} arch={archDraw} start={start} />
          </section>
          <Cuts cuts={ready.cuts} lut={lut} center={center} width={width} />
        </>
      )}
    </main>
  );
}
