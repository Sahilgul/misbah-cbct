import { useCallback, useEffect, useRef, useState } from "react";
import type { Textures } from "../scan/process";
import { VolumeRenderer, type Camera, type RenderMode } from "../render/VolumeRenderer";

const MODES: { id: RenderMode; label: string; note: string }[] = [
  { id: "lab", label: "Lab report style", note: "See-through orange volume rendering, matching the lab's printed 3D views." },
  { id: "bone", label: "Bone and teeth", note: "A solid surface rendering: bone is ivory and teeth are white." },
];

const VIEWS: { label: string; camera: Camera }[] = [
  { label: "Front", camera: { azimuth: 0, elevation: 0, distance: 2.6 } },
  { label: "Lab angle, one side", camera: { azimuth: -60, elevation: -20, distance: 2.6 } },
  { label: "Lab angle, other side", camera: { azimuth: 60, elevation: -20, distance: 2.6 } },
  { label: "Side", camera: { azimuth: -90, elevation: 0, distance: 2.6 } },
  { label: "Other side", camera: { azimuth: 90, elevation: 0, distance: 2.6 } },
  { label: "From below", camera: { azimuth: 0, elevation: -55, distance: 2.6 } },
  { label: "From above", camera: { azimuth: 0, elevation: 60, distance: 2.6 } },
];

export function Viewer3D({ textures }: { textures: Textures }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<VolumeRenderer | null>(null);
  const [mode, setMode] = useState<RenderMode>("lab");
  const [camera, setCamera] = useState<Camera>({ azimuth: -60, elevation: -20, distance: 2.6 });
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; cam: Camera } | null>(null);
  const idle = useRef<number | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      rendererRef.current = new VolumeRenderer(canvasRef.current!, textures);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [textures]);

  const draw = useCallback(
    (quality: "fast" | "best") => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => rendererRef.current?.render(camera, mode, quality));
    },
    [camera, mode],
  );

  useEffect(() => {
    draw(drag.current ? "fast" : "best");
    window.clearTimeout(idle.current);
    if (drag.current) idle.current = window.setTimeout(() => draw("best"), 180);
  }, [draw]);

  useEffect(() => {
    const onResize = () => draw("best");
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cam: camera };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    setCamera({
      ...d.cam,
      azimuth: d.cam.azimuth - (e.clientX - d.x) * 0.4,
      elevation: Math.max(-85, Math.min(85, d.cam.elevation + (e.clientY - d.y) * 0.4)),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
    draw("best");
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCamera((c) => ({ ...c, distance: Math.max(1.2, Math.min(5, c.distance * (e.deltaY > 0 ? 1.08 : 1 / 1.08))) }));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  if (error) return <p className="error">{error}</p>;

  return (
    <section className="panel">
      <h2>3D</h2>
      <div className="three">
        <canvas
          ref={canvasRef}
          className="three-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className="three-side">
          <div className="buttons">
            {MODES.map((m) => (
              <button key={m.id} type="button" className={m.id === mode ? "on" : ""} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="note">{MODES.find((m) => m.id === mode)!.note}</p>
          <div className="buttons">
            {VIEWS.map((v) => (
              <button
                key={v.label}
                type="button"
                className={
                  camera.azimuth === v.camera.azimuth &&
                  camera.elevation === v.camera.elevation &&
                  camera.distance === v.camera.distance
                    ? "on"
                    : ""
                }
                onClick={() => setCamera(v.camera)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="note">Drag to turn; scroll to zoom. This CBCT does not contain a complete face, so facial-surface modes are intentionally omitted.</p>
        </div>
      </div>
    </section>
  );
}
