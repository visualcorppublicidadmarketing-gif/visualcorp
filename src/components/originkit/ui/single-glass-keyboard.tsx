/* eslint-disable */
// Single Glass Keyboard — Originkit

// Delivered by Originkit · stack: nextjs
"use client";

const ControlType = new Proxy({}, { get: (_, k) => String(k) });

"use client"

/**
 * BerylCap — a clear glass "esc." keycap, raymarched in WebGL2. Studio
 * softboxes in orange, magenta and blue pour through it, split into spectral
 * fringes; its bevels catch white rims, it floats, turns and presses itself
 * every few seconds. The pointer is read against the key itself: as it comes
 * near, the key turns to face it and drifts toward it, and a hand-held light
 * follows the cursor through and across the glass; resting on the key sinks
 * it part way like a fingertip, and a click presses it home.
 *
 * Refined from the user's GlassKeycap. Every control it had is kept under the
 * same key, title, type, range and unit; Placement is new.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 800
 */
import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"

// ── moved controls (builder) ──
/**
 * Controls moved in the builder: into Advanced, out of it, or into groups of
 * their own. The code reads each one where it was first written, so the props
 * are put back in that shape before anything reads them.
 */
const MOVED_CONTROLS: { into: Record<string, string>; out: Record<string, string> } = {"into":{},"out":{"hover":"advanced"}}
const GROUP_FALLBACKS: Record<string, any> = {  }
function withMovedControls(props: any): any {
    const out = { ...props }
    for (const [k, g] of Object.entries(MOVED_CONTROLS.into)) out[k] = props?.[g]?.[k] ?? GROUP_FALLBACKS[g]?.[k]
    for (const [k, g] of Object.entries(MOVED_CONTROLS.out)) {
        if (out[k] !== undefined) out[g] = { ...(out[g] ?? {}), [k]: out[k] }
    }
    return out
}
// ── /moved controls ──

/** Tuning values behind the look. Out of the box these are the look. */
const DEFAULT_ADVANCED = {
    turn: 41,
    elevation: 47,
    capHeight: 61,
    topRatio: 67,
    cornerRadius: 8,
    dishDepth: 4,
    wall: 10,
    tiltRange: 12,
    nodRange: 5,
    bobAmount: 5,
    driftPeriod: 8000,
    lightPeriod: 12000,
    pressInterval: 6,
    pressDepth: 10,
    pressTilt: 2,
    pressDamping: 52,
    ior: 155,
    lightIntensity: 100,
    rimStrength: 100,
    rimPower: 30,
    glow: 8,
    light1Color: "#FF5A2A",
    light1Angle: 172,
    light2Color: "#FF3FA8",
    light2Angle: 152,
    light3Color: "#3A5BFF",
    light3Angle: 186,
    light4Color: "#D8D6E6",
    light4Angle: 183,
    keyColor: "#F4F4FF",
    keyAngle: 0,
    keyHeight: 65,
    hover: 50,
    grain: 35,
    vignette: 0,
}
type Advanced = typeof DEFAULT_ADVANCED

interface Placement {
    x: number
    y: number
    angle: number
    tilt: number
}
const DEFAULT_PLACEMENT: Placement = { x: 0, y: 0, angle: 0, tilt: 0 }

/** Where the print sits on the top face and how it is drawn. */
interface Print {
    x: number
    y: number
    size: number
    angle: number
    tint: boolean
}
const DEFAULT_PRINT: Print = { x: 0, y: 0, size: 100, angle: 0, tint: true }

/** ControlType.File gives a URL; older or hand-written props may pass { src }. */
type ImageSource = string | { src?: string } | null | undefined
function srcOf(v: ImageSource): string {
    return typeof v === "string" ? v : v?.src || ""
}

interface LegendFont {
    fontFamily?: string
    fontWeight?: number | string
    fontStyle?: string
    fontSize?: number | string
    letterSpacing?: string
    lineHeight?: string
}

export interface BerylCapProps {
    /** Text printed on the top of the key. */
    legend?: string
    /** SVG or image printed in place of the legend text. */
    mark?: ImageSource
    background?: string
    font?: LegendFont
    legendColor?: string
    print?: Partial<Print>
    /** Height of the keycap on the stage, in px; capped so the key fits the frame. */
    size?: number
    /** Strength of the spectral split in the glass. */
    dispersion?: number
    placement?: Partial<Placement>
    /** Drift, light sweep and press tempo. Motion is a hand-rolled loop, so there is no Transition row. */
    speed?: number
    advanced?: Partial<Advanced>
    /** Let a desktop mouse steer the key while it is anywhere in the browser page. */
    followPointerOutside?: boolean
    style?: CSSProperties
}

/** Camera distance in key units: a long lens, fitted to the reference's perspective. */
const EYE = 13

const VERT = `#version 300 es
void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// Everything about the cap is solved in its own frame: the eye ray is turned
// into object space once, so the SDF never pays for a matrix per step.
const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uCentre;
uniform float uPx;
uniform vec2 uRoll;
uniform mat3 uInv;
uniform vec3 uOff;
uniform vec3 uTarget;
uniform float uElev;
uniform vec4 uShape;
uniform vec3 uDish;
uniform vec2 uWall;
uniform vec2 uIor;
uniform float uEnvRot;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec4 uAz;
uniform vec3 uKeyCol;
uniform vec2 uKeyDir;
uniform vec3 uPtr;
uniform float uPtrGain;
uniform vec4 uPL;
uniform float uLight;
uniform float uRim;
uniform float uRimPow;
uniform float uGlow;
uniform sampler2D uLegend;
uniform vec3 uLegendCol;
uniform float uLegendSize;
uniform float uLegLod;
uniform float uTint;
uniform float uGrain;
uniform float uSeed;
uniform float uVig;
uniform vec2 uRes;

const float PI = 3.14159265;
const float TAU = 6.28318531;
// Spectral samples per exit ray: six hues read as a continuous rainbow fringe
// where three RGB taps show hard red/green/blue ghosts.
const int NS = 6;
const float EYE = ${EYE.toFixed(1)};
// Rounding of the bottom edges; the top lip takes uDish.z.
const float BOTTOM_ROUND = 0.03;
// Interfaces followed per ray before giving up on light trapped by total
// internal reflection: in, out to the cavity, in again, out is four.
const int EV = 7;

float smax(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return max(a, b) + h * h * k * 0.25;
}

// Tapered rounded box, bw half-wide at the base, narrowing by s per unit up.
// "open" drops the bottom face, which is how the cavity runs out of the cap.
float sdFrustum(vec3 p, float bw, float s, float h, float r, float eTop, float eBot, bool open) {
    float y = clamp(p.y, 0.0, h);
    float w = bw - s * y;
    float corner = min(r * (1.0 - 0.3 * y / h), w * 0.95);
    vec2 q = abs(p.xz) - vec2(w - corner);
    float dSide = (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner) / sqrt(1.0 + s * s);
    float dY = open ? p.y - h : abs(p.y - h * 0.5) - h * 0.5;
    float e = p.y > h * 0.5 ? eTop : eBot;
    vec2 m = vec2(dSide + e, dY + e);
    return length(max(m, 0.0)) + min(max(m.x, m.y), 0.0) - e;
}

// The cap is a shell, as a real keycap is: an outer frustum with a dished top,
// hollowed by a cavity open at the bottom. uWall = (side wall, cavity ceiling);
// a zero wall makes it the solid block of the original.
float sdCap(vec3 p) {
    float bw = uShape.x;
    float h = uShape.z;
    float s = (bw - uShape.y) / h;
    float d = sdFrustum(p, bw, s, h, uShape.w, uDish.z, BOTTOM_ROUND, false);
    // Spherical dish, blended into the lip so the rim rolls over instead of creasing.
    d = smax(d, -(length(p - vec3(0.0, h + 3.0 - uDish.y, 0.0)) - 3.0), 0.05);
    if (uWall.x > 0.0) d = max(d, -sdFrustum(p, bw - uWall.x, s, uWall.y, max(uShape.w - uWall.x, 0.02), 0.05, 0.0, true));
    return d;
}

// Exit distance from inside the glass through the outer skin, solved exactly
// against the four tapered walls, the base, the top plane and the dish sphere.
// Rounding is left to calcN at the exit, so a leg costs no march at all.
float exitT(vec3 p, vec3 d) {
    float bw = uShape.x;
    float h = uShape.z;
    float s = (bw - uShape.y) / h;
    float t = 1e4;
    float dn = d.x + s * d.y;
    if (dn > 0.0) t = min(t, (bw - p.x - s * p.y) / dn);
    dn = -d.x + s * d.y;
    if (dn > 0.0) t = min(t, (bw + p.x - s * p.y) / dn);
    dn = d.z + s * d.y;
    if (dn > 0.0) t = min(t, (bw - p.z - s * p.y) / dn);
    dn = -d.z + s * d.y;
    if (dn > 0.0) t = min(t, (bw + p.z - s * p.y) / dn);
    if (d.y < 0.0) t = min(t, -p.y / d.y);
    if (d.y > 0.0) t = min(t, (h - p.y) / d.y);
    vec3 oc = p - vec3(0.0, h + 3.0 - uDish.y, 0.0);
    float b = dot(oc, d);
    float disc = b * b - (dot(oc, oc) - 9.0);
    if (disc > 0.0) {
        float t0 = -b - sqrt(disc);
        if (t0 > 0.0) t = min(t, t0);
    }
    return max(t, 0.0);
}

// One half-space n.x <= o of the convex cavity, folded into the ray's
// (enter, leave) interval; fl marks when that crossing is the open floor.
void halfSpace(vec3 nrm, float o, vec3 p, vec3 d, bool isFloor, inout vec2 tt, inout bvec2 fl) {
    float nd = dot(nrm, d);
    float np = dot(nrm, p);
    if (abs(nd) < 1e-6) {
        if (np > o) tt.x = 1e5;
        return;
    }
    float t = (o - np) / nd;
    if (nd > 0.0) {
        if (t < tt.y) {
            tt.y = t;
            fl.y = isFloor;
        }
    } else if (t > tt.x) {
        tt.x = t;
        fl.x = isFloor;
    }
}

// The cavity: four walls parallel to the skin, a ceiling, and the open floor at y = 0.
vec2 cavity(vec3 p, vec3 d, out bvec2 fl) {
    float s = (uShape.x - uShape.y) / uShape.z;
    float bi = uShape.x - uWall.x;
    vec2 tt = vec2(-1e4, 1e4);
    fl = bvec2(false);
    halfSpace(vec3(1.0, s, 0.0), bi, p, d, false, tt, fl);
    halfSpace(vec3(-1.0, s, 0.0), bi, p, d, false, tt, fl);
    halfSpace(vec3(0.0, s, 1.0), bi, p, d, false, tt, fl);
    halfSpace(vec3(0.0, s, -1.0), bi, p, d, false, tt, fl);
    halfSpace(vec3(0.0, 1.0, 0.0), uWall.y, p, d, false, tt, fl);
    halfSpace(vec3(0.0, -1.0, 0.0), 0.0, p, d, true, tt, fl);
    return tt;
}

// Normal filtered to the pixel's footprint (e): bevels and the cavity's inner
// edges thinner than a pixel blend instead of flickering face to face.
vec3 calcN(vec3 p, float e) {
    const vec2 k = vec2(1.0, -1.0);
    return normalize(
        k.xyy * sdCap(p + k.xyy * e) +
        k.yyx * sdCap(p + k.yyx * e) +
        k.yxy * sdCap(p + k.yxy * e) +
        k.xxx * sdCap(p + k.xxx * e));
}

// One studio strip light, laid in azimuth/elevation: a long bar at angle
// \`ang\`, \`len\` long and \`wid\` wide (radians). Its centre line burns toward
// white and its brightness ramps along its length, so every bar carries its
// own gradient into the glass.
vec3 strip(float az, float el, vec3 c, float a0, float e0, float ang, float len, float wid) {
    vec2 q = vec2((mod(az - a0 + PI, TAU) - PI) * cos(e0), el - e0);
    float ca = cos(ang);
    float sa = sin(ang);
    vec2 r = vec2(ca * q.x + sa * q.y, ca * q.y - sa * q.x);
    float along = 1.0 - smoothstep(len * 0.55, len, abs(r.x));
    float x = abs(r.y) / wid;
    float body = 1.0 - smoothstep(0.45, 1.0, x);
    float core = exp(-x * x * 6.0);
    float ramp = 0.65 + 0.35 * r.x / len;
    return c * along * ramp * (body * 0.3 + core * 2.4);
}

vec3 env(vec3 d) {
    float el = asin(clamp(d.y, -1.0, 1.0));
    float az0 = atan(d.x, d.z);
    float az = az0 - uEnvRot;
    // Dark studio: a faint ceiling, so nothing reads as void.
    vec3 c = vec3(0.003, 0.003, 0.005) + vec3(0.012, 0.011, 0.02) * smoothstep(-0.2, 0.9, d.y);
    // Laid out from the reference. Seen through a hollow cap, every face looks
    // into the same patch of the studio, behind and below the key, so that is
    // where each light's main bar sits; its twin elsewhere is what the faces
    // catch as the key turns and the lights sweep round.
    float r = 0.01745;
    // Upright bars: each wall maps azimuth across its width and elevation up its
    // height, so tall narrow lights are what draw the reference's vertical streaks.
    vec3 s = strip(az, el, uC0, uAz.x, -36.0 * r, 0.2, 0.3, 0.09);
    s += strip(az, el, uC0, uAz.x + 33.0 * r, -42.0 * r, 1.45, 0.3, 0.04);
    s += strip(az, el, uC0, uAz.x, -70.0 * r, 0.0, 0.6, 0.035) * 0.35;
    s += strip(az, el, uC1, uAz.y, -42.0 * r, 1.5707, 0.35, 0.03);
    s += strip(az, el, uC1, uAz.y + 20.0 * r, -49.0 * r, 1.5707, 0.1, 0.03);
    s += strip(az, el, uC1, uAz.y + 130.0 * r, 20.0 * r, 1.3, 0.7, 0.08);
    s += strip(az, el, uC2, uAz.z, -45.0 * r, 1.5707, 0.3, 0.018) * 0.6;
    s += strip(az, el, uC2, uAz.z, 38.0 * r, 0.05, 1.0, 0.1);
    s += strip(az, el, uC3, uAz.w, -30.0 * r, 1.5707, 0.45, 0.1) * 0.04;
    s += strip(az, el, uC3, uAz.w - 123.0 * r, 20.0 * r, 1.5, 0.75, 0.05);
    // Thin white bars beside the colour: they draw the crisp lines in the glass.
    s += strip(az, el, vec3(1.0), uAz.x + 28.0 * r, -55.0 * r, 0.05, 0.3, 0.025) * 1.2;
    s += strip(az, el, vec3(1.0), uAz.x + 43.0 * r, -40.0 * r, 1.5707, 0.3, 0.012);
    s += strip(az, el, vec3(1.0), uAz.z, 47.0 * r, 0.0, 0.6, 0.02) * 0.8;
    s += strip(az, el, vec3(1.0), uAz.x - 8.0 * r, -25.0 * r, 1.45, 0.3, 0.02);
    c += s * uLight;
    // The pointer is a hand-held light: one behind the key that the glass
    // carries through to the viewer, one in front that the faces reflect.
    if (uPL.z > 0.0) {
        c += strip(az0, el, uKeyCol, PI - uPL.x, -40.0 * r + uPL.y, 1.5707, 0.35, 0.05) * uPL.z * 1.4;
        c += strip(az0, el, uKeyCol, uPL.x, 35.0 * r + uPL.y, 0.0, 0.3, 0.08) * uPL.z * 0.9;
    }
    // Key light rides with the camera, not the sweep, so the ridges always catch it.
    c += strip(az0, el, uKeyCol, uKeyDir.x, uKeyDir.y, 0.0, 0.3, 0.12) * 1.2;
    return c;
}

uint hashU(uvec3 v) {
    uint x = v.x * 1597334677u ^ v.y * 3812015801u ^ v.z * 2798796415u;
    x ^= x >> 16;
    x *= 2246822519u;
    x ^= x >> 13;
    return x;
}

// One eye ray through canvas point frag, shaded and composited on the stage.
// sig tells main which light path it took, so main can spot edges.
vec3 sampleAt(vec2 frag, out float sig, out float alpha) {
    sig = 0.0;
    alpha = 0.0;
    vec2 uv = (frag - uCentre) / uPx;
    uv = mat2(uRoll.x, uRoll.y, -uRoll.y, uRoll.x) * uv;
    float se = sin(uElev);
    float ce = cos(uElev);
    vec3 fwd = -vec3(0.0, se, ce);
    vec3 up = vec3(0.0, ce, -se);
    vec3 rdW = normalize(vec3(uv.x, 0.0, 0.0) + up * uv.y + fwd * EYE);
    vec3 roW = uTarget - fwd * EYE;
    mat3 toW = transpose(uInv);
    vec3 ro = uInv * (roW - uOff);
    vec3 rd = uInv * rdW;

    float bw = uShape.x;
    float h = uShape.z;
    float pxW = 1.0 / uPx;
    vec3 col = vec3(0.0);
    float glass = 0.0;
    bool halo = false;
    float legA = 0.0;
    vec3 legC = vec3(0.0);

    // Slab test against the cap's box (plus a glow margin): pixels that miss it
    // never march, and those that hit start at the box.
    float mg = 0.2;
    vec3 inv = 1.0 / rd;
    vec3 t0 = (vec3(-bw - mg, -mg, -bw - mg) - ro) * inv;
    vec3 t1 = (vec3(bw + mg, h + mg, bw + mg) - ro) * inv;
    vec3 tmn = min(t0, t1);
    vec3 tmx = max(t0, t1);
    float tN = max(max(tmn.x, tmn.y), max(tmn.z, 0.0));
    float tF = min(min(tmx.x, tmx.y), tmx.z);

    if (tN < tF) {
        float t = 0.0;
        float minD = 1e9;
        bool hit = false;
        float eps = max(0.0004, pxW * 0.3);
        // The rounded cap sits inside its sharp hull, which is convex: intersect
        // the hull exactly, then march only the last stretch to the rounded skin.
        float s = (bw - uShape.y) / h;
        vec2 hc = vec2(-1e4, 1e4);
        bvec2 fl = bvec2(false);
        halfSpace(vec3(1.0, s, 0.0), bw, ro, rd, false, hc, fl);
        halfSpace(vec3(-1.0, s, 0.0), bw, ro, rd, false, hc, fl);
        halfSpace(vec3(0.0, s, 1.0), bw, ro, rd, false, hc, fl);
        halfSpace(vec3(0.0, s, -1.0), bw, ro, rd, false, hc, fl);
        halfSpace(vec3(0.0, 1.0, 0.0), h, ro, rd, false, hc, fl);
        halfSpace(vec3(0.0, -1.0, 0.0), 0.0, ro, rd, false, hc, fl);
        if (hc.x < hc.y && hc.y > 0.0) {
            t = max(hc.x, 0.0);
            for (int i = 0; i < 40; i++) {
                float d = sdCap(ro + rd * t);
                minD = min(minD, d);
                if (d < eps) { hit = true; break; }
                t += d;
                if (t > hc.y) break;
            }
        }
        // Rays that miss the hull only need their closest approach, for the glow.
        if (!hit && uGlow > 0.0 && minD > pxW * 3.0) {
            float tg = tN;
            for (int i = 0; i < 28; i++) {
                float d = sdCap(ro + rd * tg);
                minD = min(minD, d);
                tg += max(d * 0.8, pxW * 0.5);
                if (tg > tF) break;
            }
        }
        if (hit) {
            vec3 p = ro + rd * t;
            float ne = max(0.0015, pxW * 0.8);
            vec3 n = calcN(p, ne);
            float cosi = clamp(dot(n, -rd), 0.0, 1.0);
            float ior = uIor.x;

            // Shared path, traced once at the middle wavelength: glass, the air
            // cavity, glass again, with total internal reflection wherever the
            // angle forbids leaving. Those bounces are where real glass gets its
            // sparkle, and the hollow is what doubles every edge.
            vec3 d = refract(rd, n, 1.0 / ior);
            vec3 q = p - n * 0.002;
            bool inGlass = true;
            vec3 evN[EV];
            int evK[EV];
            int nev = 0;
            // 0 trapped, 1 out through the skin, 2 out through the open bottom
            int fate = 0;
            float path = 0.0;
            for (int i = 0; i < EV; i++) {
                bvec2 fl;
                if (inGlass) {
                    float tO = exitT(q, d);
                    float tC = 1e4;
                    if (uWall.x > 0.0) {
                        vec2 c = cavity(q, d, fl);
                        if (c.x <= c.y && c.x > 0.0 && !fl.x) tC = c.x;
                    }
                    float tt = min(tO, tC);
                    q += d * tt;
                    path += tt;
                    vec3 nn = calcN(q, ne);
                    evN[i] = nn;
                    nev = i + 1;
                    vec3 ex = refract(d, -nn, ior);
                    if (dot(ex, ex) < 1e-4) {
                        evK[i] = 0;
                        d = reflect(d, nn);
                        q -= nn * 0.002;
                        continue;
                    }
                    evK[i] = 1;
                    d = ex;
                    if (tC < tO) {
                        inGlass = false;
                        q += nn * 0.002;
                    } else {
                        fate = 1;
                        break;
                    }
                } else {
                    vec2 c = cavity(q, d, fl);
                    if (fl.y) {
                        fate = 2;
                        break;
                    }
                    q += d * c.y;
                    vec3 nn = calcN(q, ne);
                    evN[i] = nn;
                    evK[i] = 2;
                    nev = i + 1;
                    d = refract(d, nn, 1.0 / ior);
                    q -= nn * 0.002;
                    inGlass = true;
                }
            }

            sig = 1.0 + float(nev) + 10.0 * float(fate);

            // Each wavelength replays the same interfaces at its own index.
            vec3 tr = vec3(0.0);
            vec3 wsum = vec3(0.0);
            for (int k = 0; k < NS; k++) {
                float f = float(k) / float(NS - 1);
                vec3 w = clamp(abs(fract(f * 0.72 + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
                float ik = ior + uIor.y * (f * 2.0 - 1.0);
                vec3 dk = refract(rd, n, 1.0 / ik);
                for (int i = 0; i < EV; i++) {
                    if (i >= nev) break;
                    vec3 nn = evN[i];
                    if (evK[i] == 0) {
                        dk = reflect(dk, nn);
                    } else if (evK[i] == 1) {
                        vec3 ex = refract(dk, -nn, ik);
                        dk = dot(ex, ex) < 1e-4 ? reflect(dk, nn) : ex;
                    } else {
                        dk = refract(dk, nn, 1.0 / ik);
                    }
                }
                tr += w * env(toW * dk) * (fate == 0 ? 0.3 : 1.0);
                wsum += w;
            }
            tr /= wsum;
            tr *= mix(1.0, 0.75, clamp(path / 2.0, 0.0, 1.0));

            vec3 refl = env(toW * reflect(rd, n));
            float F = 0.04 + 0.96 * pow(1.0 - cosi, 5.0);
            col = tr * (1.0 - F) + refl * F;

            float g = 1.0 - cosi;
            col += vec3(pow(g, uRimPow * 1.08), pow(g, uRimPow), pow(g, uRimPow * 0.92)) * uRim;

            // Bevels: a rounded edge faces a whole arc of the studio at once and
            // pipes light along the wall, so on a real cap it is the brightest
            // thing in frame. Picked out by normals lying between two faces.
            vec2 nh = abs(n.xz);
            float vert = smoothstep(0.45, 0.8, min(nh.x, nh.y) / max(max(nh.x, nh.y), 1e-3)) * (1.0 - smoothstep(0.45, 0.7, n.y));
            float lip = smoothstep(0.32, 0.5, n.y) * (1.0 - smoothstep(0.86, 0.95, n.y)) * step(h * 0.75, p.y);
            float base = smoothstep(0.1, 0.4, -n.y) * step(p.y, 0.1);
            float edge = max(max(vert, lip), base * 0.5);
            col += edge * (vec3(0.85, 0.88, 1.0) * 0.9 + tr) * uRim;

            // Pointer torch: a pool of the key light under the cursor, measured in
            // screen pixels so it sits exactly there at any zoom or Placement. The
            // bevels and the grazing gloss catch it hardest, as real glass does.
            vec2 dp = (frag - uPtr.xy) / uPtr.z;
            float pool = exp(-dot(dp, dp));
            col += uKeyCol * uPtrGain * pool * (0.2 + edge * 1.4 + F * 2.5 + exp(-dot(dp, dp) * 12.0) * 0.35);

            // The print (legend text or the uploaded mark) covers the top face's
            // square. Its mip level comes from the CPU, so sampling it inside this
            // branch never leans on screen-space derivatives.
            if (n.y > 0.6 && p.y > h * 0.85) {
                vec2 tuv = p.xz / uLegendSize + 0.5;
                if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
                    float fade = smoothstep(0.6, 0.8, n.y);
                    vec4 pr = textureLod(uLegend, tuv, uLegLod);
                    legA = pr.a * fade;
                    legC = mix(pr.rgb, uLegendCol, uTint);
                    // Print sits under a glossy surface: a faint bloom around it.
                    float halo = textureLod(uLegend, tuv, uLegLod + 3.0).a * fade;
                    col += legC * halo * 0.18;
                }
            }
            glass = 1.0;
        } else {
            // Soft halo sized in key units, so it reads the same at any zoom and never
            // shows the march's steps; the silhouette itself is smoothed in main.
            col = vec3(0.85, 0.85, 0.95) * uGlow * exp(-max(minD, 0.0) / (0.035 + pxW));
            glass = 1.0;
            halo = true;
        }
    }

    // Filmic roll-off: hot orange burns through yellow to white, as on film.
    col = 1.0 - exp(-col * 1.35);
    // The print sits on the surface, so it is laid on after the roll-off and stays pure.
    col = mix(col, legC, legA);
    if (halo) {
        alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
        return col;
    }
    alpha = glass;
    return col * glass;
}

// Rotated-grid offsets for the edge resample; the first is the pixel centre.
const vec2 RG[5] = vec2[5](vec2(0.0), vec2(0.125, 0.375), vec2(-0.375, 0.125), vec2(0.375, -0.125), vec2(-0.125, -0.375));

void main() {
    vec2 frag = gl_FragCoord.xy;
    // Edge-adaptive anti-aliasing: where a 2x2 quad straddles the silhouette, a
    // bevel, a change of light path or a hard colour step, four more rays on a
    // rotated grid average the pixel. Flat glass and the stage pay for one.
    // One call site, so the big body is compiled once.
    vec3 outC = vec3(0.0);
    float outA = 0.0;
    float n = 0.0;
    bool edge = false;
    for (int i = 0; i < 5; i++) {
        float sg;
        float sa;
        vec3 c = sampleAt(frag + RG[i], sg, sa);
        if (i == 0) {
            vec3 fc = fwidth(c);
            edge = fwidth(sg) > 0.5 || max(fc.r, max(fc.g, fc.b)) > 0.12;
        }
        outC += c;
        outA += sa;
        n += 1.0;
        if (!edge) break;
    }
    outC /= n;
    outA /= n;

    vec2 nd = (frag - 0.5 * uRes) / (0.5 * uRes);
    outC *= 1.0 - uVig * smoothstep(0.2, 1.4, length(nd));
    // Grain per device pixel, so it reads as fine film rather than blocks;
    // strongest in the mid-tones, faint on the black stage.
    uvec2 cell = uvec2(frag);
    float r = float(hashU(uvec3(cell, uint(uSeed))) >> 8) / 16777216.0;
    float lum = dot(outC, vec3(0.299, 0.587, 0.114));
    outC += (r - 0.5) * uGrain * (0.25 + 0.75 * smoothstep(0.0, 0.35, lum) * (1.0 - 0.6 * lum)) * outA;
    float finalAlpha = clamp(outA, 0.0, 1.0);
    vec3 finalColor = finalAlpha > 0.0001 ? outC / finalAlpha : vec3(0.0);
    outColor = vec4(clamp(finalColor, 0.0, 1.0), finalAlpha);
}`

const D2R = Math.PI / 180

function num(v: unknown, fb: number): number {
    return typeof v === "number" && isFinite(v) ? v : fb
}

function clampN(v: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, v))
}

const colorCache = new Map<string, number[]>()
function toRgb(c: unknown, fb: number[]): number[] {
    if (typeof c !== "string") return fb
    const hit = colorCache.get(c)
    if (hit) return hit
    let out: number[] | null = null
    const rgb = c.match(/rgba?\(([^)]+)\)/i)
    if (rgb) {
        const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat)
        if (parts.length >= 3) out = [parts[0] / 255, parts[1] / 255, parts[2] / 255]
    } else {
        const hex = c.match(/#([0-9a-f]{3,8})/i)
        if (hex) {
            let h = hex[1]
            if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("")
            out = [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]
        }
    }
    const res = out && out.every((x) => isFinite(x)) ? out : fb
    if (colorCache.size > 200) colorCache.clear()
    colorCache.set(c, res)
    return res
}

function bezier(x1: number, y1: number, x2: number, y2: number, x: number) {
    let lo = 0
    let hi = 1
    let t = x
    for (let i = 0; i < 20; i++) {
        const bx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t
        if (bx < x) lo = t
        else hi = t
        t = (lo + hi) / 2
    }
    return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
}

function fontPxOf(font: LegendFont | undefined): number {
    const v = font?.fontSize
    const n = typeof v === "number" ? v : parseFloat(String(v))
    return isFinite(n) && n > 0 ? n : 15
}

/** Side of the print texture, which covers the whole top face. */
const PRINT_TEX = 1024
/** Share of the top face an uploaded mark spans at Print Size 100%. */
const MARK_SHARE = 0.42
/** Device-pixel budget for the canvas; a 4K frame steps down instead of heating the GPU. */
const PIXEL_BUDGET = 2_400_000
/** How far the softboxes sway either side of their rest azimuth (radians). */
const LIGHT_SWAY = 22 * D2R
/** Rounding of the top lip, in key units (base half-width = 1). */
const TOP_ROUND = 0.07

// Draws the print in top-face space: the canvas is the face's square, its
// centre the face's centre. textPx is the legend's font size in canvas pixels.
function drawPrint(
    ctx: CanvasRenderingContext2D,
    text: string,
    font: LegendFont | undefined,
    img: HTMLImageElement | null,
    pr: Print,
    textPx: number
) {
    const N = PRINT_TEX
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, N, N)
    ctx.translate(N / 2 + (num(pr.x, 0) / 100) * N, N / 2 + (num(pr.y, 0) / 100) * N)
    ctx.rotate(num(pr.angle, 0) * D2R)
    const k = Math.max(0.05, num(pr.size, 100) / 100)
    if (img) {
        // Contain-fit on the mark's own proportions; an SVG with no intrinsic size is treated as square.
        const iw = img.naturalWidth || 1
        const ih = img.naturalWidth ? img.naturalHeight || 1 : 1
        const f = (N * MARK_SHARE * k) / Math.max(iw, ih)
        ctx.drawImage(img, (-iw * f) / 2, (-ih * f) / 2, iw * f, ih * f)
        if (pr.tint) {
            // Keep the mark's shape, take Legend Color from the shader.
            ctx.globalCompositeOperation = "source-in"
            ctx.fillStyle = "#ffffff"
            ctx.fillRect(-N, -N, 2 * N, 2 * N)
            ctx.globalCompositeOperation = "source-over"
        }
        return
    }
    if (!text) return
    const family = font?.fontFamily || `"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif`
    const weight = font?.fontWeight ?? 600
    const style = font?.fontStyle || "normal"
    let px = Math.max(4, textPx * k)
    const set = () => {
        ctx.font = `${style} ${weight} ${px}px ${family}`
    }
    set()
    try {
        ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
            typeof font?.letterSpacing === "string" ? font.letterSpacing : "0px"
    } catch {
        // older engines have no letterSpacing; tracking stays default
    }
    const w = ctx.measureText(text).width
    if (w > N * 0.94) {
        px = Math.max(4, (px * N * 0.94) / w)
        set()
    }
    ctx.fillStyle = "#ffffff"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(text, 0, px * 0.04)
}

const NAMES = [
    "uCentre", "uPx", "uRoll", "uInv", "uOff", "uTarget", "uElev", "uShape", "uDish", "uIor",
    "uWall", "uEnvRot", "uC0", "uC1", "uC2", "uC3", "uAz", "uKeyCol", "uKeyDir", "uPtr", "uPtrGain", "uPL",
    "uLight", "uRim", "uRimPow", "uGlow", "uLegend", "uLegendCol", "uLegendSize", "uLegLod", "uTint", "uGrain",
    "uSeed", "uVig", "uRes",
] as const
type UName = (typeof NAMES)[number]

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 800
 */
function __OriginkitBase_BerylCap(props: BerylCapProps) {
    props = withMovedControls(props)
    const {
    legend = "ctrl",
    mark,
    background = "#000000",
    font = {"variant":"Semibold","fontSize":"25px","textAlign":"left","fontFamily":"Inter","fontWeight":400,"lineHeight":"1em","letterSpacing":"0em"},
    legendColor = "#FFFFFF",
    print,
    size = 443,
    dispersion = 50,
    placement,
    speed = 50,
    advanced,
    followPointerOutside = false,
    style,
} = props
    const rootRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    // Merged here, at render, so the loop never allocates them.
    const adv: Advanced = { ...DEFAULT_ADVANCED, ...(advanced ?? {}) }
    const pl: Placement = { ...DEFAULT_PLACEMENT, ...(placement ?? {}) }
    const pr: Print = { ...DEFAULT_PRINT, ...(print ?? {}) }
    const live = { legend, font, legendColor, size, dispersion, speed, background, adv, pl, pr }
    const liveRef = useRef(live)
    liveRef.current = live
    const legendDirty = useRef(true)
    const wakeRef = useRef<() => void>(() => {})
    // Bumped when the GPU drops the context, so the effect rebuilds everything.
    const [generation, setGeneration] = useState(0)

    // Every prop change redraws, even when the loop has settled.
    useEffect(() => wakeRef.current())

    // The uploaded mark, decoded once per URL; the loop prints it once it has loaded.
    const markSrc = srcOf(mark)
    const markRef = useRef<{ src: string; img: HTMLImageElement | null; ok: boolean }>({ src: "", img: null, ok: false })
    useEffect(() => {
        if (!markSrc) {
            markRef.current = { src: "", img: null, ok: false }
            legendDirty.current = true
            wakeRef.current()
            return
        }
        const img = new window.Image()
        img.crossOrigin = "anonymous"
        const entry = { src: markSrc, img, ok: false }
        markRef.current = entry
        img.onload = () => {
            if (markRef.current !== entry) return
            entry.ok = true
            legendDirty.current = true
            wakeRef.current()
        }
        img.onerror = () => console.warn("BerylCap: could not load mark", markSrc)
        img.src = markSrc
    }, [markSrc])

    const fontKey = `${font?.fontFamily}|${font?.fontWeight}|${font?.fontStyle}|${font?.letterSpacing}`
    useEffect(() => {
        legendDirty.current = true
        wakeRef.current()
    }, [pr.x, pr.y, pr.size, pr.angle, pr.tint])
    useEffect(() => {
        legendDirty.current = true
        wakeRef.current()
        const fam = font?.fontFamily
        if (fam && document.fonts?.load) {
            const spec = `${font?.fontStyle || "normal"} ${font?.fontWeight ?? 600} 64px ${fam}`
            document.fonts
                .load(spec, legend || "esc.")
                .then(() => {
                    legendDirty.current = true
                    wakeRef.current()
                })
                .catch(() => {})
        }
    }, [legend, fontKey])

    useEffect(() => {
        const rootEl = rootRef.current
        const canvasEl = canvasRef.current
        if (!rootEl || !canvasEl) return
        const ctx = canvasEl.getContext("webgl2", {
            antialias: false,
            alpha: true,
            premultipliedAlpha: false,
            powerPreference: "low-power",
            preserveDrawingBuffer: false,
        })
        if (!ctx) return
        const root: HTMLDivElement = rootEl
        const canvas: HTMLCanvasElement = canvasEl
        const gl: WebGL2RenderingContext = ctx

        let disposed = false
        let raf = 0
        let program: WebGLProgram | null = null
        let tex: WebGLTexture | null = null
        let vao: WebGLVertexArrayObject | null = null
        const slots = {} as Record<UName, { loc: WebGLUniformLocation | null; v: Float64Array }>

        const legCanvas = document.createElement("canvas")
        legCanvas.width = PRINT_TEX
        legCanvas.height = PRINT_TEX
        const legCtx = legCanvas.getContext("2d")

        try {
            const compile = (type: number, src: string) => {
                const s = gl.createShader(type)!
                gl.shaderSource(s, src)
                gl.compileShader(s)
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                    const log = gl.getShaderInfoLog(s)
                    gl.deleteShader(s)
                    throw new Error("shader: " + log)
                }
                return s
            }
            const vs = compile(gl.VERTEX_SHADER, VERT)
            const fs = compile(gl.FRAGMENT_SHADER, FRAG)
            program = gl.createProgram()!
            gl.attachShader(program, vs)
            gl.attachShader(program, fs)
            gl.linkProgram(program)
            gl.deleteShader(vs)
            gl.deleteShader(fs)
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(program))
            gl.useProgram(program)
            for (const n of NAMES) slots[n] = { loc: gl.getUniformLocation(program, n), v: new Float64Array(4).fill(NaN) }
            vao = gl.createVertexArray()
            gl.bindVertexArray(vao)
            tex = gl.createTexture()
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, tex)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
            gl.uniform1i(slots.uLegend.loc, 0)
        } catch (err) {
            // Background stays showing; the component just has no glass.
            console.error("BerylCap:", err)
            return
        }

        // Uniforms upload only when their value changed.
        const f1 = (n: UName, a: number) => {
            const s = slots[n]
            if (s.v[0] !== a) {
                s.v[0] = a
                gl.uniform1f(s.loc, a)
            }
        }
        const f2 = (n: UName, a: number, b: number) => {
            const s = slots[n]
            if (s.v[0] !== a || s.v[1] !== b) {
                s.v[0] = a
                s.v[1] = b
                gl.uniform2f(s.loc, a, b)
            }
        }
        const f3 = (n: UName, a: number, b: number, c: number) => {
            const s = slots[n]
            if (s.v[0] !== a || s.v[1] !== b || s.v[2] !== c) {
                s.v[0] = a
                s.v[1] = b
                s.v[2] = c
                gl.uniform3f(s.loc, a, b, c)
            }
        }
        const f4 = (n: UName, a: number, b: number, c: number, d: number) => {
            const s = slots[n]
            if (s.v[0] !== a || s.v[1] !== b || s.v[2] !== c || s.v[3] !== d) {
                s.v[0] = a
                s.v[1] = b
                s.v[2] = c
                s.v[3] = d
                gl.uniform4f(s.loc, a, b, c, d)
            }
        }
        const c3 = (n: UName, v: unknown, fb: number[]) => {
            const c = toRgb(v, fb)
            f3(n, c[0], c[1], c[2])
        }

        // Layout size from ResizeObserver only; never read per frame.
        let cssW = Math.max(1, root.offsetWidth)
        let cssH = Math.max(1, root.offsetHeight)
        let dpr = 1
        let quality = 1
        let scale = 1
        const applySize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2)
            const budget = Math.min(1, Math.sqrt(PIXEL_BUDGET / Math.max(1, cssW * cssH * dpr * dpr)))
            scale = dpr * budget * quality
            const w = Math.max(1, Math.round(cssW * scale))
            const h = Math.max(1, Math.round(cssH * scale))
            if (canvas.width !== w) canvas.width = w
            if (canvas.height !== h) canvas.height = h
        }
        applySize()
        const ro = new ResizeObserver((entries) => {
            const r = entries[0].contentRect
            cssW = Math.max(1, r.width)
            cssH = Math.max(1, r.height)
            applySize()
            wake()
        })
        ro.observe(root)

        // Pointer: handlers only record; the rect is read once per frame, and only after a move or scroll.
        const ptr = { cx: 0, cy: 0, x: 0, y: 0, over: false, down: false, moved: false }
        const onMove = (e: PointerEvent) => {
            ptr.cx = e.clientX
            ptr.cy = e.clientY
            ptr.over = true
            ptr.moved = true
            wake()
        }
        const onLeave = () => {
            ptr.over = false
            ptr.down = false
            wake()
        }
        const onDown = (e: PointerEvent) => {
            ptr.down = true
            onMove(e)
        }
        const onUp = (e: PointerEvent) => {
            ptr.down = false
            if (e.pointerType !== "mouse") ptr.over = false
            wake()
        }
        const onScroll = () => {
            if (ptr.over) ptr.moved = true
        }
        const onWindowPointerMove = (e: PointerEvent) => {
            if (e.pointerType === "mouse") onMove(e)
        }
        const onWindowPointerOut = (e: PointerEvent) => {
            if (e.pointerType === "mouse" && !e.relatedTarget) onLeave()
        }
        if (followPointerOutside) {
            window.addEventListener("pointermove", onWindowPointerMove, { passive: true })
            window.addEventListener("pointerout", onWindowPointerOut)
        } else {
            root.addEventListener("pointerenter", onMove)
            root.addEventListener("pointermove", onMove)
            root.addEventListener("pointerleave", onLeave)
        }
        root.addEventListener("pointerdown", onDown)
        window.addEventListener("pointerup", onUp)
        window.addEventListener("pointercancel", onLeave)
        window.addEventListener("scroll", onScroll, { passive: true, capture: true })

        const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null
        let reduced = !!mq?.matches
        const onMq = () => {
            reduced = !!mq?.matches
            wake()
        }
        mq?.addEventListener?.("change", onMq)

        // Off-screen instances and hidden tabs stop drawing entirely.
        let visible = true
        const io = new IntersectionObserver((es) => {
            visible = es[es.length - 1].isIntersecting
            wake()
        })
        io.observe(root)
        const onVis = () => wake()
        document.addEventListener("visibilitychange", onVis)

        const onLost = (e: Event) => {
            e.preventDefault()
            disposed = true
            cancelAnimationFrame(raf)
        }
        const onRestored = () => setGeneration((g) => g + 1)
        canvas.addEventListener("webglcontextlost", onLost)
        canvas.addEventListener("webglcontextrestored", onRestored)

        const inv = new Float32Array(9)
        // Pointer motion: the lean is a damped spring (secondary motion); the
        // glint under the cursor follows in ~70 ms.
        const st = { t: 0, press: 0, pv: 0, over: 0, rest: 0, lx: 0, ly: 0, lvx: 0, lvy: 0, gx: 0, gy: 0 }
        let lastDraw = -1
        let due = 0
        let frameEma = 16.7
        let drawn = 0
        let slowFrames = 0
        let fastFrames = 0
        let scheduled = false
        let frameNo = 0
        // What the print texture was last drawn for, so a resize redraws it at the right size.
        let printTextPx = -1
        let printImg: HTMLImageElement | null = null

        function wake() {
            if (disposed || scheduled) return
            scheduled = true
            raf = requestAnimationFrame(loop)
        }
        wakeRef.current = wake

        function loop(now: number) {
            scheduled = false
            if (disposed || !visible || document.hidden) {
                lastDraw = -1
                return
            }
            // Paced to an average 60 fps on any refresh rate: a 120 or 144 Hz
            // screen does no extra work, and alternates 2- and 3-tick frames
            // rather than settling on 48.
            if (lastDraw >= 0 && now < due - 3) {
                wake()
                return
            }
            due = lastDraw < 0 || now - due > 50 ? now + 1000 / 60 : due + 1000 / 60
            const dt = lastDraw < 0 ? 0 : Math.min((now - lastDraw) / 1000, 1 / 20)
            // The first frames carry shader compile and warm-up; they say nothing about the device.
            if (lastDraw >= 0 && ++drawn > 30) {
                frameEma += (now - lastDraw - frameEma) * 0.1
                // Step resolution down when frames run long; back up when there is room again.
                if (frameEma > 24) slowFrames++
                else slowFrames = 0
                if (frameEma < 18) fastFrames++
                else fastFrames = 0
                if (slowFrames > 20 && quality > 0.6) {
                    quality = Math.max(0.6, quality * 0.88)
                    slowFrames = 0
                    applySize()
                } else if (fastFrames > 180 && quality < 1) {
                    quality = Math.min(1, quality * 1.08)
                    fastFrames = 0
                    applySize()
                }
            }
            lastDraw = now
            if (gl.isContextLost()) return

            const L = liveRef.current
            const A = L.adv
            const P = L.pl

            if (ptr.moved) {
                ptr.moved = false
                const r = root.getBoundingClientRect()
                ptr.x = clampN(((ptr.cx - r.left) / Math.max(1, r.width)) * 2 - 1, -1, 1)
                ptr.y = clampN(1 - ((ptr.cy - r.top) / Math.max(1, r.height)) * 2, -1, 1)
            }

            const rate = reduced ? 0 : Math.max(0, num(L.speed, 50)) / 50
            const sdt = dt * rate
            if (reduced) st.t = 0
            else st.t += sdt

            const hv = Math.max(0, num(A.hover, 50)) / 50
            const on = ptr.over && hv > 0

            // Key geometry first: the pointer is read against the key itself, not
            // the frame, so moving across the glass is what moves it.
            const e = clampN(num(A.elevation, 47), 5, 85) * D2R
            const ce = Math.cos(e)
            const se = Math.sin(e)
            const bw = 1
            const tw = clampN(num(A.topRatio, 67), 30, 100) / 100
            const hh = (2 * clampN(num(A.capHeight, 61), 10, 150)) / 100
            const hU = hh * ce + (tw + bw) * Math.SQRT2 * se
            const wU = 2 * bw * Math.SQRT2
            const ty0 = (hh * ce + (tw - bw) * Math.SQRT2 * se) / (2 * ce)
            // Capped so the whole key always fits the frame, phone frames included.
            const sizePx = Math.max(20, Math.min(num(L.size, 230), cssH * 0.9, (cssW * 0.9 * hU) / wU))
            const pxU = (sizePx * scale) / hU

            // Pointer in key radii from the key's centre (x right, y up).
            const keyR = Math.max(10, sizePx * 0.5)
            const kx = ((ptr.x * 0.5 + 0.5) * cssW - cssW * (0.5 + num(P.x, 0) / 100)) / keyR
            const ky = ((ptr.y * 0.5 + 0.5) * cssH - cssH * (0.5 - num(P.y, 0) / 100)) / keyR
            const dist = Math.hypot(kx, ky)
            // Near: 1 over the key, fading out over about three key radii around it.
            const near = on ? Math.exp(-Math.pow(Math.max(0, dist - 1) / 1.6, 2)) : 0
            // Rest: the pointer is on the key itself, as a fingertip would be.
            const restOn = on && dist < 1.05 ? 1 : 0
            const tx = on ? clampN(kx / 1.3, -1, 1) * near : 0
            const ty = on ? clampN(ky / 1.3, -1, 1) * near : 0
            const ks = 1 - Math.exp(-dt * 6)
            st.over += (near - st.over) * ks
            st.rest += (restOn - st.rest) * (1 - Math.exp(-dt * 9))
            const w0 = 7
            st.lvx += (w0 * w0 * (tx - st.lx) - 2 * w0 * st.lvx) * dt
            st.lvy += (w0 * w0 * (ty - st.ly) - 2 * w0 * st.lvy) * dt
            st.lx += st.lvx * dt
            st.ly += st.lvy * dt
            // The glint stays on the cursor wherever it is in the frame.
            const gx0 = on ? ptr.x : 0
            const gy0 = on ? ptr.y : 0
            const kf = 1 - Math.exp(-dt * 14)
            st.gx += (gx0 - st.gx) * kf
            st.gy += (gy0 - st.gy) * kf

            // Key press: eased stroke down, hold, damped spring back (the original's timeline).
            const interval = Math.max(2, num(A.pressInterval, 6))
            const ph = st.t % interval
            let drive = -1
            if (!reduced && rate > 0 && ph < 0.2) drive = ph < 0.12 ? bezier(0.55, 0, 1, 0.45, ph / 0.12) : 1
            // Resting on the key sinks it part way, as a fingertip does; a click takes it to the floor.
            const target = reduced || hv <= 0 ? 0 : ptr.down ? 1 : st.rest * 0.32 * Math.min(hv, 1.5)
            if (reduced) {
                st.press = 0
                st.pv = 0
            } else if (drive >= 0 && drive >= st.press) {
                st.press = drive
                st.pv = 0
            } else {
                const k0 = 14
                const z = clampN(num(A.pressDamping, 52), 5, 200) / 100
                // A held press springs in real time even when Speed is 0.
                const springDt = target > 0 || rate === 0 ? dt : sdt
                const n = 4
                const hs = springDt / n
                for (let i = 0; i < n; i++) {
                    const a = -k0 * k0 * (st.press - target) - 2 * z * k0 * st.pv
                    st.pv += a * hs
                    st.press += st.pv * hs
                }
            }

            const settled =
                rate === 0 &&
                Math.abs(tx - st.lx) + Math.abs(ty - st.ly) + Math.abs(st.lvx) + Math.abs(st.lvy) < 1e-4 &&
                Math.abs(gx0 - st.gx) + Math.abs(gy0 - st.gy) < 1e-4 &&
                Math.abs(near - st.over) + Math.abs(restOn - st.rest) < 1e-3 &&
                Math.abs(st.press - target) + Math.abs(st.pv) < 1e-4

            const Pd = Math.max(0.5, num(A.driftPeriod, 8000) / 1000)
            const T = st.t
            const lean = st.over * hv
            // While the pointer is over the key, the idle drift calms so the pointer is in charge of the pose.
            const calm = 1 - 0.65 * clampN(st.over * Math.min(hv, 1), 0, 1)
            const yaw =
                num(A.turn, 41) + num(A.tiltRange, 12) * calm * Math.sin((2 * Math.PI * T) / Pd) + lean * 30 * st.lx
            // Placement Tilt tips the top away (negative nod), on top of drift, lean and press.
            const nod =
                num(A.nodRange, 5) * calm * Math.sin((2 * Math.PI * T) / (Pd * 0.75)) -
                lean * 18 * st.ly +
                num(A.pressTilt, 2) * st.press -
                clampN(num(P.tilt, 0), -60, 60)

            const bob = hU * (num(A.bobAmount, 5) / 100) * Math.sin((2 * Math.PI * T) / (Pd * 0.5)) * calm
            // Approaching, the key rises to meet the pointer and drifts toward it;
            // once the pointer rests on it, the lift gives way to the half-press.
            const lift = hU * 0.05 * Math.max(0, st.over - st.rest) * hv
            const pull = 0.1 * bw * st.lx * lean
            const drop = hU * (num(A.pressDepth, 10) / 100) * st.press

            const cy = Math.cos(yaw * D2R)
            const sy = Math.sin(yaw * D2R)
            const cx = Math.cos(nod * D2R)
            const sx = Math.sin(nod * D2R)
            // rows of M = Rx(nod)·Ry(yaw); uploaded as columns of M⁻¹ = Mᵀ
            inv[0] = cy
            inv[1] = 0
            inv[2] = sy
            inv[3] = sx * sy
            inv[4] = cx
            inv[5] = -sx * cy
            inv[6] = -cx * sy
            inv[7] = sx
            inv[8] = cx * cy

            // The print texture spans the top face's square; the legend keeps its
            // font size in screen pixels, as in the original.
            const face = 2 * tw
            const textPx = Math.round((((fontPxOf(L.font) / sizePx) * hU) / face) * PRINT_TEX * 4) / 4
            const mk = markRef.current
            const img = mk.ok ? mk.img : null
            if (legCtx && (legendDirty.current || textPx !== printTextPx || img !== printImg)) {
                legendDirty.current = false
                printTextPx = textPx
                printImg = img
                drawPrint(legCtx, String(L.legend ?? ""), L.font, img, L.pr, textPx)
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, tex)
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
                try {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, legCanvas)
                } catch {
                    // A mark served without CORS taints the canvas: fall back to the text.
                    console.warn("BerylCap: the mark's server does not allow it to be drawn; showing the legend instead")
                    mk.ok = false
                    printImg = null
                    drawPrint(legCtx, String(L.legend ?? ""), L.font, null, L.pr, textPx)
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, legCanvas)
                }
                gl.generateMipmap(gl.TEXTURE_2D)
            }

            const ior = clampN(num(A.ior, 155), 100, 250) / 100
            // Hover opens the spectrum: fringes widen as the key wakes under the pointer.
            const sp =
                (Math.max(0, num(L.dispersion, 50)) / 50) *
                0.09 *
                (1 + 0.4 * clampN(st.press, 0, 1)) *
                (1 + 0.7 * st.over * hv)

            const W = canvas.width
            const H = canvas.height
            // Placement: offsets shift the lens, Angle rolls the camera about its view axis.
            const shiftX = (num(P.x, 0) / 100) * W
            const shiftY = -(num(P.y, 0) / 100) * H
            const roll = num(P.angle, 0) * D2R
            const rc = Math.cos(roll)
            const rs = Math.sin(roll)

            // Pointer torch in canvas pixels (y up), about a third of the key wide.
            f3("uPtr", (st.gx * 0.5 + 0.5) * W, (st.gy * 0.5 + 0.5) * H, Math.max(8, sizePx * scale * 0.32))
            f1("uPtrGain", reduced ? 0 : st.over * hv)
            // Hand-held light: about ±40° across and ±20° up with the pointer around the key.
            f4("uPL", st.lx * 0.7, st.ly * 0.35, reduced ? 0 : st.over * hv, 0)

            gl.viewport(0, 0, W, H)
            gl.useProgram(program)
            gl.bindVertexArray(vao)
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, tex)

            f2("uRes", W, H)
            f2("uCentre", W * 0.5 + shiftX, H * 0.5 + shiftY)
            f1("uPx", pxU)
            f2("uRoll", rc, rs)
            gl.uniformMatrix3fv(slots.uInv.loc, false, inv)
            f3("uOff", pull, bob + lift - drop, 0)
            f3("uTarget", 0, ty0, 0)
            f1("uElev", e)
            f4("uShape", bw, tw, hh, (clampN(num(A.cornerRadius, 8), 0, 40) / 100) * 2)
            const dish = (clampN(num(A.dishDepth, 4), 0, 20) / 100) * 2
            f3("uDish", 3.0, dish, TOP_ROUND)
            // Wall as a share of the base half-width; the ceiling sits that far under the dish.
            const wall = (clampN(num(A.wall, 10), 0, 40) / 100) * bw
            f2("uWall", wall, wall > 0 ? hh - dish - wall : 0)
            f2("uIor", ior, sp)
            // The softboxes sway either side of the reference layout rather than
            // spinning: every face looks into one patch of the studio, so a full
            // turn would leave the glass dark for most of the cycle. The pointer
            // also steers them, so moving across the key slides the colour bars
            // through the glass.
            f1(
                "uEnvRot",
                LIGHT_SWAY * Math.sin((2 * Math.PI * T) / Math.max(1, num(A.lightPeriod, 12000) / 1000)) +
                    lean * 0.4 * st.lx
            )
            c3("uC0", A.light1Color, [1, 0.35, 0.16])
            c3("uC1", A.light2Color, [1, 0.25, 0.66])
            c3("uC2", A.light3Color, [0.23, 0.36, 1])
            c3("uC3", A.light4Color, [0.85, 0.84, 0.9])
            f4(
                "uAz",
                num(A.light1Angle, 172) * D2R,
                num(A.light2Angle, 152) * D2R,
                num(A.light3Angle, 186) * D2R,
                num(A.light4Angle, 183) * D2R
            )
            c3("uKeyCol", A.keyColor, [0.96, 0.96, 1])
            f2("uKeyDir", num(A.keyAngle, 0) * D2R, num(A.keyHeight, 65) * D2R)
            f1("uLight", (Math.max(0, num(A.lightIntensity, 100)) / 100) * 2.7 * (1 + 0.3 * st.over * hv))
            f1(
                "uRim",
                (Math.max(0, num(A.rimStrength, 100)) / 100) *
                    0.8 *
                    (1 + 0.3 * clampN(st.press, 0, 1)) *
                    (1 + 0.35 * st.over * hv)
            )
            f1("uRimPow", Math.max(0.5, num(A.rimPower, 30) / 10))
            f1("uGlow", (Math.max(0, num(A.glow, 8)) / 100) * 0.6 * (1 + 0.5 * st.over * hv))
            c3("uLegendCol", L.legendColor, [1, 1, 1])
            f1("uLegendSize", face)
            // Mip level from texels per device pixel, biased sharp: the top is seen
            // obliquely, and a level picked for its short axis greys thin strokes.
            f1("uLegLod", Math.max(0, Math.log2(((PRINT_TEX / face) * 0.75) / Math.max(1e-3, pxU))))
            f1("uTint", printImg && !L.pr.tint ? 0 : 1)
            f1("uGrain", (clampN(num(A.grain, 35), 0, 100) / 100) * 0.25)
            // Grain only crawls while something moves; a settled frame keeps its grain.
            if (!settled) frameNo = (frameNo + 1) % 4096
            f1("uSeed", frameNo)
            f1("uVig", (clampN(num(A.vignette, 0), 0, 100) / 100) * 0.85)

            gl.drawArrays(gl.TRIANGLES, 0, 3)
            if (!settled) wake()
        }
        wake()

        return () => {
            disposed = true
            wakeRef.current = () => {}
            cancelAnimationFrame(raf)
            ro.disconnect()
            io.disconnect()
            if (followPointerOutside) {
                window.removeEventListener("pointermove", onWindowPointerMove)
                window.removeEventListener("pointerout", onWindowPointerOut)
            } else {
                root.removeEventListener("pointerenter", onMove)
                root.removeEventListener("pointermove", onMove)
                root.removeEventListener("pointerleave", onLeave)
            }
            root.removeEventListener("pointerdown", onDown)
            window.removeEventListener("pointerup", onUp)
            window.removeEventListener("pointercancel", onLeave)
            window.removeEventListener("scroll", onScroll, { capture: true })
            mq?.removeEventListener?.("change", onMq)
            document.removeEventListener("visibilitychange", onVis)
            canvas.removeEventListener("webglcontextlost", onLost)
            canvas.removeEventListener("webglcontextrestored", onRestored)
            legendDirty.current = true
            if (gl.isContextLost()) return
            if (tex) gl.deleteTexture(tex)
            if (vao) gl.deleteVertexArray(vao)
            if (program) gl.deleteProgram(program)
        }
    }, [followPointerOutside, generation])

    return (
        <div
            ref={rootRef}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                ...style,
                overflow: "hidden",
                background,
                touchAction: "pan-y",
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    display: "block",
                    pointerEvents: "none",
                }}
            />
        </div>
    )
}

// Control order arranged in the builder.

const __originkitPresetProps = {
  "size": 443
};

export default function BerylCap(props: Record<string, unknown>) {
  return <__OriginkitBase_BerylCap {...(__originkitPresetProps as Record<string, unknown>)} {...props} />;
}
