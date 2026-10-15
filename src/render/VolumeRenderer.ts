import type { Textures } from "../scan/process";
import { add, cross, invert, lookAt, multiply, normalize, perspective, scale, sub, type Vec3 } from "./mat4";
import { FRAGMENT, VERTEX } from "./shaders";

export type RenderMode = "face" | "bone" | "through" | "lab";

export type Camera = {
  /** Degrees around the head. 0 looks at the face. */
  azimuth: number;
  /** Degrees up or down. */
  elevation: number;
  /** Distance from the center, in head sizes. */
  distance: number;
};

const MODE_ID: Record<RenderMode, number> = { face: 0, bone: 1, through: 2, lab: 3 };
const SKIN_OPACITY: Record<RenderMode, number> = { face: 1, bone: 0, through: 0.38, lab: 0 };

const RAW_TO_TEX = 1 / 4080;

export class VolumeRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private half: Vec3;
  private texel: Vec3;

  constructor(private canvas: HTMLCanvasElement, tex: Textures) {
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("This browser cannot show 3D (WebGL2 is off).");
    this.gl = gl;
    this.program = this.link(VERTEX, FRAGMENT);
    const longest = Math.max(tex.nx, tex.ny, tex.nz);
    this.half = [tex.nx / longest / 2, tex.ny / longest / 2, tex.nz / longest / 2];
    this.texel = [1 / tex.nx, 1 / tex.ny, 1 / tex.nz];
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.upload(0, tex.detail, tex);
    this.upload(1, tex.smooth, tex);
    gl.useProgram(this.program);
    gl.uniform1i(this.loc("uDetail"), 0);
    gl.uniform1i(this.loc("uSmooth"), 1);
  }

  private link(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    return p;
  }

  private upload(unit: number, data: Uint8Array, tex: Textures) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
    }
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, tex.nx, tex.ny, tex.nz, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  }

  private loc(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }

  render(camera: Camera, mode: RenderMode, quality: "fast" | "best") {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * (quality === "fast" ? 0.6 : 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);

    const az = (camera.azimuth * Math.PI) / 180;
    const el = (camera.elevation * Math.PI) / 180;
    const target: Vec3 = [0, -0.02, -0.02];
    const dir: Vec3 = [Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)];
    const eye = add(target, scale(dir, camera.distance));
    const up: Vec3 = [0, 0, 1];
    const view = lookAt(eye, target, up);
    const proj = perspective((28 * Math.PI) / 180, w / h, 0.05, 10);
    const inv = invert(multiply(proj, view));

    const forward = normalize(sub(target, eye));
    const right = normalize(cross(forward, up));
    const camUp = cross(right, forward);
    const key = normalize(add(add(scale(right, -0.45), scale(camUp, 0.6)), scale(forward, -0.65)));
    const fill = normalize(add(add(scale(right, 0.6), scale(camUp, -0.1)), scale(forward, -0.75)));

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.loc("uInvViewProj"), false, inv);
    gl.uniform3fv(this.loc("uCamPos"), eye);
    gl.uniform3fv(this.loc("uHalf"), this.half);
    gl.uniform3fv(this.loc("uTexel"), this.texel);
    gl.uniform1i(this.loc("uMode"), MODE_ID[mode]);
    gl.uniform1f(this.loc("uStep"), quality === "fast" ? 1.2 : 0.5);
    gl.uniform1f(this.loc("uSkinIso"), 800 * RAW_TO_TEX);
    gl.uniform1f(this.loc("uBoneIso"), 1500 * RAW_TO_TEX);
    gl.uniform1f(this.loc("uToothIso"), 2300 * RAW_TO_TEX);
    gl.uniform1f(this.loc("uSkinOpacity"), SKIN_OPACITY[mode]);
    gl.uniform3fv(this.loc("uKey"), key);
    gl.uniform3fv(this.loc("uFill"), fill);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
