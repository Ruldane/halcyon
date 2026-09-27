/**
 * The city through the exchange's windows. The architecture is cached; the
 * windows layer is redrawn only when someone's light changes (at most four
 * times a second); per frame we composite, then draw what moves: the El, the
 * Light's beam, searchlights on an opening night, rain, a fire, and the
 * overlays (the call being listened to, a traced rumour, the one followed).
 */
import { GROUND, WATER_X, type Win } from "../sim/layout";
import type { CallView, StaticCity, TickMsg } from "../worker/protocol";
import { INK, mix, rgba, tones } from "./palette";
import { drawStatic, lighthouseLamp, type View } from "./skyline";

export interface TraceDraw {
  hops: { from: number; to: number; alone: boolean }[];
  step: number;
  born: number;
}

export interface Overlay {
  listening: CallView | null;
  trace: TraceDraw | null;
  follow: number | null;
  hover: number;
  focus: number;
  highlight: number[];
}

export interface Clock {
  hour: number;
  day: number;
  dow: number;
  dayIndex: number;
  moon: number;
  dusk: number;
}

const WIN_DARK = 0;
const WIN_LIT = 1;
const WIN_PHONE = 2;
const WIN_CANDLE = 3;

export class CityRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private city: StaticCity;
  private staticCv: HTMLCanvasElement;
  private winCv: HTMLCanvasElement;
  private skyCv: HTMLCanvasElement;
  /** Sky, architecture and windows composited once, redrawn only when one of them changes. */
  private baseCv: HTMLCanvasElement;
  private baseKey = "";
  private baseDirty = true;
  private glow: HTMLCanvasElement;
  cssW = 0;
  cssH = 0;
  dpr = 1;
  view: View = { s: 1, x0: 0, y0: 0 };
  /** Panorama: the whole city fits; otherwise the camera pans. */
  panorama = true;
  camX = 0;
  camTarget = 0;
  private staticKey = "";
  private skyKey = "";
  private winDirty = true;
  /** Windows whose light changed since the layer was last drawn. */
  private pending = new Set<number>();
  private lastWinDraw = 0;
  private states: Uint8Array;
  private grid = new Map<number, number[]>();
  private minTop = 0;
  still = false;
  quality = 0;
  lastClock: Clock | null = null;
  private lightning = 0;
  private nextLightning = 0;

  constructor(canvas: HTMLCanvasElement, city: StaticCity) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.city = city;
    this.staticCv = document.createElement("canvas");
    this.winCv = document.createElement("canvas");
    this.skyCv = document.createElement("canvas");
    this.baseCv = document.createElement("canvas");
    this.glow = makeGlow();
    this.states = new Uint8Array(city.windows.length);
    this.minTop = Math.min(...city.buildings.map((b) => b.base - b.h)) - 48;
    for (let i = 0; i < city.windows.length; i++) {
      const w = city.windows[i];
      const key = cellKey(w.x + w.w / 2, w.y + w.h / 2);
      let a = this.grid.get(key);
      if (!a) this.grid.set(key, (a = []));
      a.push(i);
    }
    this.camX = city.districtX[2] + (city.districtX[3] - city.districtX[2]) / 2;
    this.camTarget = this.camX;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.cssW = Math.max(1, Math.round(cssW));
    this.cssH = Math.max(1, Math.round(cssH));
    const maxPx = 7_000_000;
    let d = dpr;
    while (d > 1 && this.cssW * this.cssH * d * d > maxPx / 2) d -= 0.25;
    this.dpr = Math.max(1, d - this.quality * 0.25);
    this.computeView();
    // The architecture cache spans the whole city: keep it under 4096 device pixels wide.
    const cacheW = this.city.width * this.view.s * this.dpr;
    if (cacheW > 4096) this.dpr = Math.max(0.75, this.dpr * (4096 / cacheW));
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.staticKey = "";
    this.skyKey = "";
    this.winDirty = true;
  }

  setQuality(q: number) {
    if (q === this.quality) return;
    this.quality = q;
    this.resize(this.cssW, this.cssH, window.devicePixelRatio || 1);
  }

  private computeView() {
    const c = this.city;
    const needH = GROUND + 34 - this.minTop;
    const sFitW = this.cssW / c.width;
    const sFitH = this.cssH / needH;
    this.panorama = sFitW * 1.08 >= Math.min(sFitH, 1.05) || this.cssW >= 900;
    let s: number;
    if (this.panorama) s = Math.min(sFitW, sFitH * 1.25);
    else s = Math.min(sFitH, this.cssW / 250);
    const visW = this.cssW / s;
    const visH = this.cssH / s;
    const y0 = GROUND + 34 - visH;
    let x0: number;
    if (this.panorama) x0 = (c.width - visW) / 2;
    else x0 = Math.max(0, Math.min(c.width - visW, this.camX - visW / 2));
    this.view = { s, x0, y0 };
  }

  /** Pan in district mode. */
  panBy(dxCss: number) {
    if (this.panorama) return;
    this.camX -= dxCss / this.view.s;
    const visW = this.cssW / this.view.s;
    this.camX = Math.max(visW / 2, Math.min(this.city.width - visW / 2, this.camX));
    this.camTarget = this.camX;
    this.computeView();
  }

  focusDistrict(d: number, instant: boolean) {
    const x = (this.city.districtX[d] + this.city.districtX[d + 1]) / 2;
    this.camTarget = x;
    if (instant) {
      this.camX = x;
      this.computeView();
    }
  }

  visibleDistricts(): number[] {
    const { s, x0 } = this.view;
    const x1 = x0 + this.cssW / s;
    const out: number[] = [];
    for (let d = 0; d < 5; d++) {
      const a = this.city.districtX[d];
      const b = this.city.districtX[d + 1];
      const overlap = Math.min(b, x1) - Math.max(a, x0);
      if (overlap > (b - a) * 0.4 || overlap > (x1 - x0) * 0.45) out.push(d);
    }
    return out;
  }

  centreDistrict(): number {
    const mid = this.view.x0 + this.cssW / this.view.s / 2;
    for (let d = 0; d < 5; d++) if (mid < this.city.districtX[d + 1]) return d;
    return 4;
  }

  worldToScreen(x: number, y: number): [number, number] {
    return [(x - this.view.x0) * this.view.s, (y - this.view.y0) * this.view.s];
  }

  screenToWorld(x: number, y: number): [number, number] {
    return [x / this.view.s + this.view.x0, y / this.view.s + this.view.y0];
  }

  windowCentre(i: number): [number, number] {
    const w = this.city.windows[i];
    return this.worldToScreen(w.x + w.w / 2, w.y + w.h / 2);
  }

  /** Nearest window to a point on screen, within a few pixels. */
  hit(x: number, y: number, radiusCss = 9): number {
    const [wx, wy] = this.screenToWorld(x, y);
    const r = radiusCss / this.view.s;
    let best = -1;
    let bestD = r * r;
    for (let gx = -1; gx <= 1; gx++) {
      for (let gy = -1; gy <= 1; gy++) {
        const list = this.grid.get(cellKey(wx + gx * 20, wy + gy * 20));
        if (!list) continue;
        for (const i of list) {
          const w = this.city.windows[i];
          const dx = w.x + w.w / 2 - wx;
          const dy = w.y + w.h / 2 - wy;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best;
  }

  windowState(i: number): number {
    return this.states[i];
  }

  /** Work out every window's light from the citizens' state. */
  updateWindows(tick: TickMsg, owners: Int16Array) {
    const wins = this.city.windows;
    const cit = tick.citizens;
    const next = new Uint8Array(wins.length);
    const downSet = tick.down;
    const unitLit = new Map<number, number>();
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      const o = owners[i];
      if (o < 0 || (tick.fire && tick.fire.building === w.b)) continue;
      const cs = cit[o] ?? 0;
      const act = cs & 7;
      const phone = (cs & 8) !== 0;
      const b = this.city.buildings[w.b];
      const powerOut = downSet.includes(b.district);
      let st = WIN_DARK;
      if (w.uk === 0) {
        if (act === 1) st = powerOut ? WIN_CANDLE : phone ? WIN_PHONE : WIN_LIT;
      } else if (act === 2 && !powerOut) st = phone ? WIN_PHONE : WIN_LIT;
      next[i] = st;
      if (w.uk === 0 && st !== WIN_DARK) unitLit.set(w.unit, Math.max(unitLit.get(w.unit) ?? 0, st === WIN_CANDLE ? WIN_CANDLE : WIN_LIT));
    }
    // A parlour is lit if anyone is home.
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      if (w.uk === 0 && w.parlour && next[i] === WIN_DARK && !(tick.fire && tick.fire.building === w.b)) next[i] = unitLit.get(w.unit) ?? WIN_DARK;
    }
    for (let i = 0; i < next.length; i++) {
      if (next[i] === this.states[i]) continue;
      // Harbour reflections span the water: redraw those in full.
      if (wins[i].x <= WATER_X + 4) this.winDirty = true;
      else this.pending.add(i);
    }
    this.states = next;
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  draw(now: number, clock: Clock, tick: TickMsg | null, overlay: Overlay) {
    const ctx = this.ctx;
    this.lastClock = clock;
    const { dpr } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (!this.panorama && Math.abs(this.camTarget - this.camX) > 0.5) {
      this.camX += (this.camTarget - this.camX) * (this.still ? 1 : 0.12);
      this.computeView();
    }
    const day = clock.day;
    const dayQ = Math.round(day * 20) / 20;
    const storm = tick?.storm ?? null;

    // Sky.
    const skyKey = `${W}x${H}:${dayQ}:${Math.round(clock.dusk * 10)}:${storm ? 1 : 0}:${Math.round(clock.moon * 16)}:${Math.round(this.view.y0)}`;
    if (skyKey !== this.skyKey) {
      this.skyKey = skyKey;
      this.skyCv.width = W;
      this.skyCv.height = H;
      drawSky(this.skyCv.getContext("2d")!, W, H, day, clock, !!storm, this, dpr);
      this.baseDirty = true;
    }
    // Architecture: the whole city's width at this scale.
    const sw = Math.ceil(this.city.width * this.view.s * dpr) + 4;
    const staticKey = `${sw}x${H}:${dayQ}:${this.view.s.toFixed(4)}:${this.view.y0.toFixed(2)}`;
    if (staticKey !== this.staticKey) {
      this.staticKey = staticKey;
      this.staticCv.width = sw;
      this.staticCv.height = H;
      this.winCv.width = sw;
      this.winCv.height = H;
      const sctx = this.staticCv.getContext("2d")!;
      drawStatic(sctx, this.city, { s: this.view.s, x0: 0, y0: this.view.y0 }, day, dpr, sw, H);
      this.winDirty = true;
      this.baseDirty = true;
    }
    if ((this.winDirty || this.pending.size) && now - this.lastWinDraw > (this.still ? 900 : 240)) {
      this.lastWinDraw = now;
      if (this.winDirty || this.pending.size > 160) this.drawWindows(day, dpr, sw, H, null);
      else this.drawWindows(day, dpr, sw, H, [...this.pending]);
      this.winDirty = false;
      this.pending.clear();
      this.baseDirty = true;
    }

    const sx = Math.round(this.view.x0 * this.view.s * dpr);
    const baseKey = `${W}x${H}:${sx}`;
    if (this.baseDirty || baseKey !== this.baseKey) {
      this.baseKey = baseKey;
      this.baseDirty = false;
      if (this.baseCv.width !== W || this.baseCv.height !== H) {
        this.baseCv.width = W;
        this.baseCv.height = H;
      }
      const b = this.baseCv.getContext("2d", { alpha: false })!;
      b.drawImage(this.skyCv, 0, 0);
      b.drawImage(this.staticCv, -sx, 0);
      b.drawImage(this.winCv, -sx, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.baseCv, 0, 0);
    // Lightning brightens the sky, gently and rarely.
    if (storm && !this.still) {
      if (now > this.nextLightning) {
        this.lightning = 1;
        this.nextLightning = now + 9000 + Math.random() * 14000;
      }
      if (this.lightning > 0.01) {
        ctx.fillStyle = rgba("#cfe3dd", 0.1 * this.lightning);
        ctx.fillRect(0, 0, W, H * 0.7);
        this.lightning *= 0.9;
      }
    }

    // World-space drawing from here.
    ctx.setTransform(this.view.s * dpr, 0, 0, this.view.s * dpr, -this.view.x0 * this.view.s * dpr, -this.view.y0 * this.view.s * dpr);
    const t = tick?.t ?? Date.now();
    this.drawMoving(ctx, now, t, clock, tick);
    this.drawOverlays(ctx, now, overlay);
    if (storm) this.drawRain(ctx, now, storm.rain);
  }

  /**
   * Draw the windows layer. With a list of changed windows, only their
   * neighbourhoods are cleared and redrawn (clipped), so a light going on
   * costs a handful of windows, not the whole city.
   */
  private drawWindows(day: number, dpr: number, W: number, H: number, changed: number[] | null) {
    const ctx = this.winCv.getContext("2d")!;
    const s = this.view.s;
    if (!changed) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, -this.view.y0 * s * dpr);
      this.paintWindows(ctx, day, null);
      return;
    }
    ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, -this.view.y0 * s * dpr);
    const R = 11;
    for (const i of changed) {
      const w = this.city.windows[i];
      const x0 = w.x - R;
      const y0 = w.y - R;
      const x1 = w.x + w.w + R;
      const y1 = w.y + w.h + R;
      const near = new Set<number>();
      for (let gx = x0 - 20; gx <= x1 + 20; gx += 20) {
        for (let gy = y0 - 20; gy <= y1 + 20; gy += 20) {
          const list = this.grid.get(cellKey(gx, gy));
          if (list) for (const j of list) near.add(j);
        }
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
      this.paintWindows(ctx, day, near);
      ctx.restore();
    }
  }

  private paintWindows(ctx: CanvasRenderingContext2D, day: number, only: Set<number> | null) {
    const T = tones(day);
    const night = 1 - day;
    const litCol = mix(T.glass, mix(INK.lampDeep, INK.lamp, 0.55 + night * 0.45), 0.4 + 0.6 * night);
    const phoneCol = mix(T.glass, INK.lampHot, 0.55 + 0.45 * night);
    const wins = this.city.windows;
    const glowA = 0.1 + night * 0.4;
    const ids = only ? [...only] : null;
    const each = (fn: (i: number) => void) => {
      if (ids) for (const i of ids) fn(i);
      else for (let i = 0; i < wins.length; i++) fn(i);
    };
    // Glass first, then light, then glow.
    ctx.fillStyle = T.glass;
    each((i) => this.states[i] === WIN_DARK && rect(ctx, wins[i]));
    ctx.fillStyle = litCol;
    each((i) => this.states[i] === WIN_LIT && rect(ctx, wins[i]));
    ctx.fillStyle = phoneCol;
    each((i) => this.states[i] === WIN_PHONE && rect(ctx, wins[i]));
    ctx.fillStyle = rgba(INK.lampDeep, 0.55);
    each((i) => this.states[i] === WIN_CANDLE && rect(ctx, wins[i]));
    // Sills catch the light a little.
    ctx.fillStyle = rgba(INK.lamp, 0.18 * night);
    each((i) => {
      const st = this.states[i];
      if (st === WIN_LIT || st === WIN_PHONE) {
        const w = wins[i];
        ctx.fillRect(w.x - 0.3, w.y + w.h, w.w + 0.6, 0.5);
      }
    });
    if (glowA > 0.12 && this.quality < 3) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = glowA;
      each((i) => {
        const st = this.states[i];
        if (st === WIN_DARK) return;
        const w = wins[i];
        const k = st === WIN_PHONE ? 4.6 : st === WIN_CANDLE ? 2.2 : 3.4;
        const gw = w.w * k;
        const gh = w.h * k * 0.8;
        ctx.globalAlpha = glowA * (st === WIN_CANDLE ? 0.5 : st === WIN_PHONE ? 1.2 : 1);
        ctx.drawImage(this.glow, w.x + w.w / 2 - gw / 2, w.y + w.h / 2 - gh / 2, gw, gh);
      });
      // Reflections in the harbour.
      ctx.globalAlpha = glowA * 0.6;
      for (let i = 0; i < (ids ? 0 : wins.length); i++) {
        const st = this.states[i];
        if (st === WIN_DARK) continue;
        const w = wins[i];
        if (w.x > WATER_X + 4) continue;
        const depth = GROUND - (w.y + w.h);
        ctx.drawImage(this.glow, w.x - 1, GROUND + 2 + depth * 0.25, w.w + 2, 10 + depth * 0.2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private drawMoving(ctx: CanvasRenderingContext2D, now: number, simT: number, clock: Clock, tick: TickMsg | null) {
    const night = 1 - clock.day;
    const city = this.city;
    const lowQ = this.quality >= 2;
    // The Light.
    const light = city.buildings.find((b) => b.style === "lighthouse");
    if (light && night > 0.25) {
      const [lx, ly] = lighthouseLamp(light);
      ctx.fillStyle = rgba(INK.lampHot, 0.9);
      ctx.beginPath();
      ctx.arc(lx, ly, 1.6, 0, Math.PI * 2);
      ctx.fill();
      if (!this.still && !lowQ) {
        const a = ((now / 11000) % 1) * Math.PI * 2;
        const dx = Math.cos(a);
        const len = 190 * Math.abs(dx) + 20;
        const g = ctx.createLinearGradient(lx, ly, lx + dx * len, ly);
        g.addColorStop(0, rgba(INK.lampHot, 0.34 * night));
        g.addColorStop(1, rgba(INK.lampHot, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + dx * len, ly - 7 * Math.abs(dx));
        ctx.lineTo(lx + dx * len, ly + 7 * Math.abs(dx));
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.drawImage(this.glow, lx - 10, ly - 7, 20, 14);
      }
    }
    // The Meridian Tower's beacon, and its floodlit crown.
    const tower = city.buildings.find((b) => b.style === "tower");
    if (tower && night > 0.3) {
      const top = tower.base - tower.h;
      const cx = tower.x + tower.w / 2;
      const g = ctx.createLinearGradient(0, top, 0, top - 40);
      g.addColorStop(0, rgba(INK.jade, 0.22 * night));
      g.addColorStop(1, rgba(INK.jade, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - tower.w * 0.4, top - 40, tower.w * 0.8, 40);
      const on = this.still ? 1 : (now / 1000) % 2.4 < 1.2 ? 1 : 0.25;
      ctx.fillStyle = rgba(INK.lamp, on * 0.95);
      ctx.beginPath();
      ctx.arc(cx, top - 66, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Friday and Saturday nights, the tower's searchlights sweep the clouds.
    if (tower && night > 0.5 && (clock.dow === 5 || clock.dow === 6) && (clock.hour >= 20 || clock.hour < 1) && !lowQ) {
      const bx = tower.x + tower.w / 2;
      const by = tower.base - tower.h - 30;
      for (let k = 0; k < 2; k++) {
        const a = this.still ? (k ? -0.55 : 0.45) : Math.sin(now / 7300 + k * 2.6) * 0.75;
        const len = 420;
        const ex = bx + Math.sin(a) * len;
        const ey = by - Math.cos(a) * len;
        const g = ctx.createLinearGradient(bx, by, ex, ey);
        g.addColorStop(0, rgba(INK.ivory, 0.16));
        g.addColorStop(1, rgba(INK.ivory, 0));
        ctx.fillStyle = g;
        const px = Math.cos(a) * 12;
        const py = Math.sin(a) * 12;
        ctx.beginPath();
        ctx.moveTo(bx - 0.8, by);
        ctx.lineTo(ex - px, ey - py);
        ctx.lineTo(ex + px, ey + py);
        ctx.lineTo(bx + 0.8, by);
        ctx.fill();
      }
    }
    // The Evening Star's clock keeps Halcyon's time.
    const star = city.buildings.find((b) => b.style === "newspaper");
    if (star) {
      const top = star.base - star.h;
      const cx = star.x + star.w / 2;
      const cy = top - 8;
      ctx.strokeStyle = rgba(INK.night1, 0.9);
      ctx.lineWidth = 0.55;
      const hA = ((clock.hour % 12) / 12) * Math.PI * 2 - Math.PI / 2;
      const mA = ((clock.hour % 1) * Math.PI * 2) - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(hA) * 2.2, cy + Math.sin(hA) * 2.2);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(mA) * 3.3, cy + Math.sin(mA) * 3.3);
      ctx.stroke();
      if (night > 0.3) ctx.drawImage(this.glow, cx - 7, cy - 6, 14, 12);
    }
    // Opening night: searchlights over Lantern Row.
    if (tick && tick.opening >= 0 && night > 0.3) {
      const b = city.buildings[tick.opening];
      if (b) {
        const bx = b.x + b.w / 2;
        const by = b.base - b.h - 6;
        for (let k = 0; k < 2; k++) {
          const a = this.still ? (k ? -0.35 : 0.3) : Math.sin(now / 5200 + k * 2.1) * 0.5 + (k ? -0.2 : 0.2);
          const len = 360;
          const ex = bx + Math.sin(a) * len;
          const ey = by - Math.cos(a) * len;
          const g = ctx.createLinearGradient(bx, by, ex, ey);
          g.addColorStop(0, rgba(INK.ivory, 0.22));
          g.addColorStop(1, rgba(INK.ivory, 0));
          ctx.fillStyle = g;
          const px = Math.cos(a) * 9;
          const py = Math.sin(a) * 9;
          ctx.beginPath();
          ctx.moveTo(bx - 1, by);
          ctx.lineTo(ex - px, ey - py);
          ctx.lineTo(ex + px, ey + py);
          ctx.lineTo(bx + 1, by);
          ctx.fill();
        }
      }
    }
    // The El: trains on a timetable of the city's own clock.
    this.drawTrains(ctx, simT, clock, night);
    // A fire.
    if (tick?.fire) {
      const b = city.buildings[tick.fire.building];
      if (b) {
        const top = b.base - b.h;
        const flick = this.still ? 0.8 : 0.72 + Math.sin(now / 130) * 0.1 + Math.sin(now / 57) * 0.08;
        const g = ctx.createRadialGradient(b.x + b.w / 2, top + b.h * 0.3, 2, b.x + b.w / 2, top + b.h * 0.3, b.w * 1.3);
        g.addColorStop(0, rgba(INK.ember, 0.75 * flick));
        g.addColorStop(0.5, rgba(INK.lampDeep, 0.25 * flick));
        g.addColorStop(1, rgba(INK.lampDeep, 0));
        ctx.fillStyle = g;
        ctx.fillRect(b.x - b.w, top - b.w, b.w * 3, b.h + b.w * 1.5);
        // Smoke.
        ctx.fillStyle = rgba(night > 0.5 ? "#9fb3ae" : "#56605e", 0.18);
        for (let k = 0; k < 7; k++) {
          const p = this.still ? k / 7 : ((now / 5000 + k / 7) % 1);
          ctx.beginPath();
          ctx.arc(b.x + b.w / 2 + p * 30 + Math.sin(p * 6 + k) * 4, top - p * 90, 3 + p * 12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private drawTrains(ctx: CanvasRenderingContext2D, simT: number, clock: Clock, night: number) {
    const { x0, x1, stations } = this.city.el;
    const h = clock.hour;
    if (h > 1 && h < 5.2) return;
    const headway = h >= 7 && h < 19.5 ? 6 * 60_000 : 13 * 60_000;
    const trip = 210_000;
    const stops = [x0 + 6, ...stations, x1 - 30];
    for (let dir = 0; dir < 2; dir++) {
      const offset = dir * headway * 0.5;
      const phase = (simT + offset) % headway;
      if (phase > trip) continue;
      let u = phase / trip;
      // Dwell at stations: ease the parameter into steps.
      const segs = stops.length - 1;
      const seg = Math.min(segs - 1, Math.floor(u * segs));
      const local = u * segs - seg;
      const eased = this.still ? 0 : local < 0.18 ? 0 : (local - 0.18) / 0.82;
      const e2 = eased * eased * (3 - 2 * eased);
      let x = stops[seg] + (stops[seg + 1] - stops[seg]) * e2;
      if (dir === 1) x = x1 + x0 - x - 40;
      u = 0;
      void u;
      const y = 438 - 6.4;
      for (let car = 0; car < 3; car++) {
        const cx = x + car * 13.5;
        ctx.fillStyle = mix("#10282b", "#5c706d", clock.day);
        ctx.fillRect(cx, y, 12.6, 5.6);
        ctx.fillStyle = rgba(INK.lamp, 0.35 + night * 0.6);
        for (let k = 0; k < 4; k++) ctx.fillRect(cx + 1.4 + k * 2.8, y + 1.3, 1.6, 1.8);
      }
    }
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, now: number, o: Overlay) {
    const wins = this.city.windows;
    const s = this.view.s;
    const lw = 1 / s;
    const ring = (i: number, color: string, r: number, width: number, alpha = 1) => {
      if (i < 0 || i >= wins.length) return;
      const w = wins[i];
      ctx.strokeStyle = rgba(color, alpha);
      ctx.lineWidth = width * lw;
      ctx.beginPath();
      ctx.arc(w.x + w.w / 2, w.y + w.h / 2, r / s + Math.max(w.w, w.h) * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    };
    const pulse = this.still ? 1 : 0.75 + 0.25 * Math.sin(now / 500);
    // The call you are listening to: its two windows, and the line between.
    if (o.listening) {
      const a = o.highlight[0] ?? -1;
      const b = o.highlight[1] ?? -1;
      if (a >= 0 && b >= 0) arc(ctx, wins[a], wins[b], rgba(INK.coral, 0.75), 1.3 * lw, 1);
      ring(a, INK.coral, 4, 1.4, pulse);
      ring(b, INK.coral, 4, 1.4, pulse);
    }
    // A traced rumour, hop by hop.
    if (o.trace) {
      const hops = o.trace.hops;
      const progress = this.still ? hops.length : Math.min(hops.length, (now - o.trace.born) / 380);
      for (let k = 0; k < hops.length; k++) {
        const hp = hops[k];
        if (hp.from < 0 || hp.to < 0) continue;
        const part = Math.max(0, Math.min(1, progress - k));
        if (part <= 0) break;
        const active = o.trace.step === k;
        const faded = o.trace.step >= 0 && !active;
        if (hp.alone) {
          ring(hp.to, INK.coral, 3, 1, faded ? 0.3 : 0.9);
          continue;
        }
        arc(ctx, wins[hp.from], wins[hp.to], rgba(INK.coral, faded ? 0.28 : 0.85), (active ? 2 : 1.2) * lw, part);
        if (part >= 1) ring(hp.to, INK.coral, active ? 5 : 2.5, active ? 1.6 : 1, faded ? 0.35 : 0.95);
      }
      if (hops.length && hops[0].from >= 0) ring(hops[0].from, INK.coral, 6, 1.8, 1);
    }
    if (o.follow !== null && o.highlight.length > 2) ring(o.highlight[2], INK.coral, 7, 1.2, pulse);
    if (o.hover >= 0) ring(o.hover, INK.ivory, 3, 1, 0.9);
    if (o.focus >= 0 && o.focus !== o.hover) ring(o.focus, INK.ivory, 4, 1.6, 1);
  }

  private drawRain(ctx: CanvasRenderingContext2D, now: number, rain: number) {
    // On the glass, in screen space.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const n = this.still ? 70 : this.quality >= 2 ? 90 : 190;
    ctx.strokeStyle = rgba("#bcd3cd", 0.16 + rain * 0.1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const seed = i * 97.13;
      const x = ((seed * 13.7) % this.cssW) + (this.still ? 0 : ((now / 7) % 40) - 20);
      const speed = 0.35 + ((seed * 0.37) % 1) * 0.5;
      const y = this.still ? (seed * 7.1) % this.cssH : ((now * speed + seed * 31) % (this.cssH + 40)) - 20;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 12);
    }
    ctx.stroke();
  }
}

function rect(ctx: CanvasRenderingContext2D, w: Win) {
  ctx.fillRect(w.x, w.y, w.w, w.h);
}

function arc(ctx: CanvasRenderingContext2D, a: Win, b: Win, color: string, width: number, part: number) {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const lift = 26 + Math.abs(bx - ax) * 0.22;
  const cx = (ax + bx) / 2;
  const cy = Math.min(ay, by) - lift;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  if (part >= 1) ctx.quadraticCurveTo(cx, cy, bx, by);
  else {
    const steps = 24;
    for (let k = 1; k <= Math.ceil(steps * part); k++) {
      const t = Math.min(part, k / steps);
      const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx;
      const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by;
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

function cellKey(x: number, y: number): number {
  return Math.floor(x / 20) * 1000 + Math.floor(y / 20);
}

function makeGlow(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, "rgba(255,214,140,0.9)");
  r.addColorStop(0.35, "rgba(255,196,110,0.35)");
  r.addColorStop(1, "rgba(255,196,110,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, day: number, clock: Clock, storm: boolean, r: CityRenderer, dpr: number) {
  const night = 1 - day;
  const top = mix("#030f13", "#6d9794", day);
  const mid = mix("#0a252a", "#a9c2bb", day);
  let horizon = mix("#17393e", "#d8e0d2", day);
  if (clock.dusk > 0) horizon = mix(horizon, "#d6a765", clock.dusk * 0.45);
  const [, gy] = r.worldToScreen(0, GROUND);
  const g = ctx.createLinearGradient(0, 0, 0, gy * dpr);
  g.addColorStop(0, storm ? mix(top, "#1b2a2b", 0.5) : top);
  g.addColorStop(0.6, storm ? mix(mid, "#243536", 0.5) : mid);
  g.addColorStop(1, storm ? mix(horizon, "#2c3c3c", 0.5) : horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (night > 0.45 && !storm) {
    // Stars, fixed to the city (a hash, so they don't jump on resize).
    for (let i = 0; i < 160; i++) {
      const x = ((Math.sin(i * 91.7) * 43758.5) % 1 + 1) % 1;
      const y = ((Math.sin(i * 12.9 + 4) * 24634.6) % 1 + 1) % 1;
      const a = (0.25 + ((i * 7) % 10) / 20) * (night - 0.4);
      ctx.fillStyle = `rgba(236,228,207,${a})`;
      ctx.fillRect(x * W, y * H * 0.55, dpr * (i % 9 === 0 ? 1.4 : 0.9), dpr * (i % 9 === 0 ? 1.4 : 0.9));
    }
    // The moon, in its real phase.
    const mx = W * 0.78;
    const my = H * 0.16;
    const mr = Math.round(11 * dpr);
    // The moon in its real phase: a lit disc with its shadow cut away.
    const m = document.createElement("canvas");
    m.width = m.height = mr * 2 + 4;
    const mc = m.getContext("2d")!;
    mc.fillStyle = rgba(INK.ivory, 0.92);
    mc.beginPath();
    mc.arc(mr + 2, mr + 2, mr, 0, Math.PI * 2);
    mc.fill();
    const p = clock.moon;
    const lit = (1 - Math.cos(p * Math.PI * 2)) / 2;
    mc.globalCompositeOperation = "destination-out";
    mc.beginPath();
    mc.arc(mr + 2 + (p < 0.5 ? -1 : 1) * mr * 2 * lit, mr + 2, mr + 0.5, 0, Math.PI * 2);
    mc.fill();
    // Earthshine on the dark part.
    ctx.fillStyle = rgba(INK.ivory, 0.08);
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(m, mx - mr - 2, my - mr - 2);
  }
  // The city's own light on the haze at the horizon.
  if (night > 0.3) {
    const glow = ctx.createLinearGradient(0, gy * dpr - H * 0.34, 0, gy * dpr);
    glow.addColorStop(0, rgba(INK.lampDeep, 0));
    glow.addColorStop(1, rgba(INK.lampDeep, 0.13 * night));
    ctx.fillStyle = glow;
    ctx.fillRect(0, gy * dpr - H * 0.34, W, H * 0.34);
  }
  if (storm) {
    ctx.fillStyle = "rgba(20,32,33,0.45)";
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.ellipse(((i * 0.13 + 0.05) % 1) * W, H * (0.08 + (i % 3) * 0.07), W * 0.18, H * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
