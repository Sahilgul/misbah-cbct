export const VERTEX = /* glsl */ `#version 300 es
out vec2 vNdc;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
  vNdc = p;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D uDetail;
uniform sampler3D uSmooth;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec3 uHalf;
uniform vec3 uTexel;
uniform int uMode;
uniform float uStep;
uniform float uSkinIso;
uniform float uBoneIso;
uniform float uToothIso;
uniform float uSkinOpacity;
uniform vec3 uKey;
uniform vec3 uFill;

in vec2 vNdc;
out vec4 outColor;

const vec3 SKIN = vec3(0.86, 0.63, 0.52);
const vec3 BONE = vec3(0.90, 0.84, 0.72);
const vec3 TOOTH = vec3(0.98, 0.97, 0.93);

vec3 toTex(vec3 p) { return p / (2.0 * uHalf) + 0.5; }

bool hitBox(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 inv = 1.0 / rd;
  vec3 a = (-uHalf - ro) * inv;
  vec3 b = (uHalf - ro) * inv;
  vec3 lo = min(a, b);
  vec3 hi = max(a, b);
  t0 = max(max(lo.x, lo.y), lo.z);
  t1 = min(min(hi.x, hi.y), hi.z);
  return t1 > max(t0, 0.0);
}

vec3 grad(sampler3D tex, vec3 t, float r) {
  vec3 e = uTexel * r;
  return vec3(
    texture(tex, t + vec3(e.x, 0, 0)).r - texture(tex, t - vec3(e.x, 0, 0)).r,
    texture(tex, t + vec3(0, e.y, 0)).r - texture(tex, t - vec3(0, e.y, 0)).r,
    texture(tex, t + vec3(0, 0, e.z)).r - texture(tex, t - vec3(0, 0, e.z)).r);
}

vec3 light(vec3 base, vec3 n, vec3 v, float shininess, float spec, float wrap) {
  float key = clamp((dot(n, uKey) + wrap) / (1.0 + wrap), 0.0, 1.0);
  float fill = clamp((dot(n, uFill) + 0.3) / 1.3, 0.0, 1.0);
  float sky = 0.5 + 0.5 * n.z;
  vec3 ambient = mix(vec3(0.20, 0.17, 0.17), vec3(0.36, 0.36, 0.40), sky);
  vec3 h = normalize(uKey + v);
  float s = pow(max(dot(n, h), 0.0), shininess) * spec;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.18;
  return base * (ambient + key * 0.80 + fill * 0.25) + vec3(s + rim);
}

float ramp(float v, float lo, float hi) { return clamp((v - lo) / (hi - lo), 0.0, 1.0); }

/** False at the edge of the scanned area, where tissue is cut off and would look like a wall. */
bool insideScan(vec3 tc) {
  return length(tc.xy - 0.5) < 0.475 && tc.z > 0.025 && tc.z < 0.975;
}

void main() {
  vec4 a = uInvViewProj * vec4(vNdc, -1.0, 1.0);
  vec4 b = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 ro = uCamPos;
  vec3 rd = normalize(b.xyz / b.w - a.xyz / a.w);
  vec3 bg = mix(vec3(0.05, 0.055, 0.07), vec3(0.12, 0.13, 0.16), vNdc.y * 0.5 + 0.5);
  if (uMode == 3) bg = vec3(0.02, 0.015, 0.015);

  float t0, t1;
  if (!hitBox(ro, rd, t0, t1)) { outColor = vec4(bg, 1.0); return; }
  t0 = max(t0, 0.0);
  float dt = uStep * 2.0 * uHalf.x * uTexel.x;
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = t0 + dt * jitter;
  vec3 v = -rd;

  vec3 col = vec3(0.0);
  float alpha = 0.0;
  float prevS = 0.0;
  float prevD = 0.0;
  bool skinHit = uSkinOpacity <= 0.0;

  for (int i = 0; i < 2400; i++) {
    if (t > t1 || alpha > 0.985) break;
    vec3 tc = toTex(ro + rd * t);
    float d = texture(uDetail, tc).r;

    if (uMode == 3) {
      float raw = d * 4080.0;
      float bone = ramp(raw, 1400.0, 1900.0);
      float tooth = ramp(raw, 2100.0, 2600.0);
      float soft = ramp(raw, 850.0, 1100.0) * (1.0 - bone);
      float ws = soft * 0.007;
      float wb = bone * 0.040 * (1.0 - tooth);
      float wt = tooth * 0.18;
      float a0 = clamp(ws + wb + wt, 0.0, 0.95);
      if (a0 > 0.0) {
        vec3 rgb = (ws * vec3(0.80, 0.30, 0.12) + wb * vec3(1.0, 0.60, 0.36) + wt * vec3(1.0, 0.93, 0.85)) / (ws + wb + wt);
        float aa = 1.0 - pow(1.0 - a0, uStep);
        col += (1.0 - alpha) * aa * rgb;
        alpha += (1.0 - alpha) * aa;
      }
    } else {
      float s = texture(uSmooth, tc).r;
      if (!skinHit && prevS < uSkinIso && s >= uSkinIso) {
        float f = (uSkinIso - prevS) / max(s - prevS, 1e-5);
        vec3 hp = toTex(ro + rd * (t - dt * (1.0 - f)));
        if (insideScan(hp)) {
          vec3 n = -normalize(grad(uSmooth, hp, 1.5) + 1e-7);
          vec3 c = light(SKIN, n, v, 24.0, 0.10, 0.55);
          float op = uSkinOpacity;
          if (op < 1.0) op = mix(op, 1.0, pow(1.0 - abs(dot(n, v)), 2.5) * 0.6);
          col += (1.0 - alpha) * op * c;
          alpha += (1.0 - alpha) * op;
          skinHit = true;
        }
      }
      if (uMode != 0 && prevD < uBoneIso && d >= uBoneIso && insideScan(tc)) {
        float f = (uBoneIso - prevD) / max(d - prevD, 1e-5);
        vec3 hp = toTex(ro + rd * (t - dt * (1.0 - f)));
        vec3 n = -normalize(grad(uDetail, hp, 1.0) * 0.6 + grad(uSmooth, hp, 1.0) * 0.4 + 1e-7);
        float inside = texture(uDetail, hp + rd * uTexel * 2.0).r;
        float tooth = ramp(inside, uToothIso - 0.04, uToothIso + 0.04);
        vec3 base = mix(BONE, TOOTH, tooth);
        vec3 c = light(base, n, v, mix(18.0, 60.0, tooth), mix(0.12, 0.45, tooth), 0.25);
        col += (1.0 - alpha) * c;
        alpha = 1.0;
        break;
      }
      prevS = s;
    }
    prevD = d;
    t += dt;
  }

  if (uMode == 3) {
    col = col * pow(max(alpha, 1e-3), -0.3) * 1.15;
  }
  outColor = vec4(clamp(col + (1.0 - alpha) * bg, 0.0, 1.0), 1.0);
}`;
