import { useEffect, useRef } from "react";
import { paintGray, windowValues, type Lut } from "../colors";

export type Cut = { label: string; values: Uint16Array; width: number; height: number };

function CutCanvas({ cut, lut, center, width }: { cut: Cut; lut: Lut; center: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    paintGray(ref.current!, windowValues(cut.values, center, width), cut.width, cut.height, lut);
  }, [cut, lut, center, width]);
  return (
    <figure>
      <canvas ref={ref} />
      <figcaption>{cut.label}</figcaption>
    </figure>
  );
}

export function Cuts(props: { cuts: Cut[]; lut: Lut; center: number; width: number }) {
  return (
    <section className="panel">
      <h2>Cuts across the jaw</h2>
      <div className="cuts">
        {props.cuts.map((c, i) => (
          <CutCanvas key={i} cut={c} lut={props.lut} center={props.center} width={props.width} />
        ))}
      </div>
      <p className="note">Slices across the jaw from one back corner, around the front teeth, to the other back corner.</p>
    </section>
  );
}
