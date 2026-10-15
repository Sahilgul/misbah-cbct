import { useEffect, useRef } from "react";
import { paintGray, type Lut } from "../colors";
import type { Gray } from "../scan/process";

export function Panoramic({ image, lut }: { image: Gray; lut: Lut }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    paintGray(ref.current!, image.pixels, image.width, image.height, lut);
  }, [image, lut]);
  return (
    <section className="panel">
      <h2>Panoramic</h2>
      <canvas ref={ref} className="pano" />
      <p className="note">Both jaws and all teeth unwrapped flat, like the big pink picture on the lab pages.</p>
    </section>
  );
}
