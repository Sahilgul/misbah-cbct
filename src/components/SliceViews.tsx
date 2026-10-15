import { useEffect, useRef, useState } from "react";
import { paintGray, windowValues, type Lut } from "../colors";
import type { Volume } from "../scan/load";
import type { Point } from "../scan/process";

type Pos = { x: number; y: number; z: number };
type Axis = "z" | "y" | "x";

function slice(vol: Volume, axis: Axis, index: number) {
  const { nx, ny, nz, data } = vol;
  if (axis === "z") return { values: data.subarray(index * nx * ny, (index + 1) * nx * ny), width: nx, height: ny };
  const width = axis === "y" ? nx : ny;
  const values = new Uint16Array(width * nz);
  for (let z = 0; z < nz; z++) {
    const row = (nz - 1 - z) * width;
    const base = z * nx * ny;
    if (axis === "y") {
      values.set(data.subarray(base + index * nx, base + index * nx + nx), row);
    } else {
      for (let y = 0; y < ny; y++) values[row + y] = data[base + y * nx + index];
    }
  }
  return { values, width, height: nz };
}

function View({
  vol, axis, pos, setPos, title, hint, lut, center, width, arch,
}: {
  vol: Volume; axis: Axis; pos: Pos; setPos: (p: Pos) => void; title: string; hint: string;
  lut: Lut; center: number; width: number; arch?: Point[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const index = pos[axis];
  const max = axis === "z" ? vol.nz - 1 : axis === "y" ? vol.ny - 1 : vol.nx - 1;

  useEffect(() => {
    const s = slice(vol, axis, index);
    const ctx = paintGray(ref.current!, windowValues(s.values, center, width), s.width, s.height, lut);
    const [cx, cy] =
      axis === "z" ? [pos.x, pos.y] : axis === "y" ? [pos.x, vol.nz - 1 - pos.z] : [pos.y, vol.nz - 1 - pos.z];
    if (arch && axis === "z") {
      ctx.strokeStyle = "rgba(120, 225, 150, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      arch.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 215, 80, 0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 0.5, 0);
    ctx.lineTo(cx + 0.5, s.height);
    ctx.moveTo(0, cy + 0.5);
    ctx.lineTo(s.width, cy + 0.5);
    ctx.stroke();
  }, [vol, axis, index, pos.x, pos.y, pos.z, lut, center, width, arch]);

  useEffect(() => {
    const canvas = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaY > 0 ? 1 : -1;
      setPos({ ...pos, [axis]: Math.max(0, Math.min(max, pos[axis] + step)) });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [pos, axis, max, setPos]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    const u = Math.round(((e.clientX - r.left) / r.width) * c.width);
    const v = Math.round(((e.clientY - r.top) / r.height) * c.height);
    if (axis === "z") setPos({ ...pos, x: u, y: v });
    else if (axis === "y") setPos({ ...pos, x: u, z: vol.nz - 1 - v });
    else setPos({ ...pos, y: u, z: vol.nz - 1 - v });
  };

  return (
    <div className="slice">
      <h3>{title}</h3>
      <canvas ref={ref} onClick={onClick} />
      <label>
        {hint} <span className="num">{index + 1} / {max + 1}</span>
        <input type="range" min={0} max={max} value={index} onChange={(e) => setPos({ ...pos, [axis]: Number(e.target.value) })} />
      </label>
    </div>
  );
}

export function SliceViews(props: { vol: Volume; lut: Lut; center: number; width: number; arch: Point[]; start: Pos }) {
  const [pos, setPos] = useState<Pos>(props.start);
  const common = { vol: props.vol, pos, setPos, lut: props.lut, center: props.center, width: props.width };
  return (
    <div className="slices">
      <View {...common} axis="z" title="Top view" hint="Move up and down" arch={props.arch} />
      <View {...common} axis="y" title="Front view" hint="Move front to back" />
      <View {...common} axis="x" title="Side view" hint="Move side to side" />
    </div>
  );
}
