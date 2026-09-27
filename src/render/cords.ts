/**
 * The cords. Each connected call is a pair of cloth cords: one plugged into
 * the caller's jack, one into the called line's, both hanging down into a
 * pair of holes in the keyshelf with their weights below. Plugs travel up on
 * a spring when a call is connected and drop back when it clears. The
 * visitor's listening cord is coral.
 */
import type { CallView } from "../worker/protocol";
import { INK, rgba } from "./palette";

export interface JackPos {
  x: number;
  y: number;
  /** Off this screen's field (phones show one district at a time). */
  off: boolean;
}

interface End {
  key: string;
  line: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hx: number;
  hy: number;
  coral: boolean;
  shade: number;
  leaving: boolean;
  born: number;
  sway: number;
  tx: number;
  ty: number;
}

export class CordRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ends = new Map<string, End>();
  jacks: JackPos[] = [];
  operatorJack: JackPos | null = null;
  listenHole: [number, number] = [0, 0];
  shelfY = 0;
  cssW = 0;
  cssH = 0;
  dpr = 1;
  still = false;
  private lastT = 0;
  active = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  resize(w: number, h: number, dpr: number) {
    this.cssW = Math.max(1, Math.round(w));
    this.cssH = Math.max(1, Math.round(h));
    this.dpr = Math.min(2, dpr);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
  }

  /** Reconcile the cords with the calls on the board. */
  sync(calls: CallView[], listening: number, operatorAnswered: boolean, now: number) {
    const want = new Set<string>();
    for (const c of calls) {
      if (c.phase !== "ring" && c.phase !== "talk" && c.phase !== "clear") continue;
      if (c.phase === "clear" && !this.ends.has(`${c.id}:a`)) continue;
      const a = this.jacks[c.fromLine];
      const b = c.toLine >= 0 ? this.jacks[c.toLine] : null;
      if (!a) continue;
      const mid = b ? (a.x + b.x) / 2 : a.x;
      const hx = Math.max(24, Math.min(this.cssW - 24, mid));
      this.want(`${c.id}:a`, c.fromLine, a, hx - 4, c.phase === "clear", false, 0, now);
      want.add(`${c.id}:a`);
      if (b) {
        this.want(`${c.id}:b`, c.toLine, b, hx + 4, c.phase === "clear", false, 1, now);
        want.add(`${c.id}:b`);
      }
      if (c.id === listening && c.phase !== "clear") {
        this.want(`L`, c.fromLine, a, this.listenHole[0], false, true, 2, now, this.listenHole[1]);
        want.add("L");
      }
    }
    if (operatorAnswered && this.operatorJack) {
      this.want("L", -2, this.operatorJack, this.listenHole[0], false, true, 2, now, this.listenHole[1]);
      want.add("L");
    }
    for (const [k, e] of this.ends) if (!want.has(k)) e.leaving = true;
  }

  private want(key: string, line: number, jack: JackPos, hx: number, leaving: boolean, coral: boolean, shade: number, now: number, hy = this.shelfY) {
    const tx = jack.off ? (jack.x < this.cssW / 2 ? -14 : this.cssW + 14) : jack.x;
    const ty = jack.off ? this.shelfY - 40 : jack.y;
    let e = this.ends.get(key);
    if (!e || e.line !== line) {
      e = { key, line, x: hx, y: hy, vx: 0, vy: 0, hx, hy, coral, shade, leaving: false, born: now, sway: (line * 0.37) % 1, tx, ty };
      if (this.still) {
        e.x = tx;
        e.y = ty;
      }
      this.ends.set(key, e);
    }
    e.hx = hx;
    e.hy = hy;
    e.leaving = leaving;
    e.tx = tx;
    e.ty = ty;
  }

  draw(now: number) {
    const dt = Math.min(0.05, (now - (this.lastT || now)) / 1000);
    this.lastT = now;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    let moving = false;
    const order = [...this.ends.values()].sort((a, b) => Number(a.coral) - Number(b.coral));
    for (const e of order) {
      const gx = e.leaving ? e.hx : e.tx;
      const gy = e.leaving ? e.hy : e.ty;
      if (this.still) {
        if (e.leaving) {
          this.ends.delete(e.key);
          continue;
        }
        e.x = gx;
        e.y = gy;
      } else {
        // A critically damped spring towards the jack (or back to the hole).
        const k = e.leaving ? 90 : 60;
        const d = 2 * Math.sqrt(k) * 0.9;
        e.vx += ((gx - e.x) * k - e.vx * d) * dt;
        e.vy += ((gy - e.y) * k - e.vy * d) * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (Math.abs(e.vx) + Math.abs(e.vy) > 2 || Math.abs(gx - e.x) + Math.abs(gy - e.y) > 1) moving = true;
        if (e.leaving && Math.abs(e.y - e.hy) < 4 && Math.abs(e.x - e.hx) < 4) {
          this.ends.delete(e.key);
          continue;
        }
      }
      this.drawCord(ctx, e, now);
    }
    this.active = moving || this.ends.size > 0;
    return moving;
  }

  private drawCord(ctx: CanvasRenderingContext2D, e: End, now: number) {
    const sway = this.still ? 0 : Math.sin(now / 1400 + e.sway * 6.28) * 2.2;
    const x = e.x;
    const y = e.y + 7;
    const hx = e.hx;
    const hy = e.hy;
    const fall = Math.max(18, (hy - y) * 0.62);
    const cloth = e.coral ? INK.coral : e.shade === 0 ? "#3d8a74" : e.shade === 1 ? "#2f6f60" : INK.coral;
    // Shadow on the board face.
    ctx.strokeStyle = rgba("#000000", 0.28);
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 2);
    ctx.bezierCurveTo(x + 2 + sway, y + fall, hx + 2, hy - 26, hx + 2, hy);
    ctx.stroke();
    // The cloth.
    ctx.strokeStyle = cloth;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + sway, y + fall, hx, hy - 26, hx, hy);
    ctx.stroke();
    // Its weave, a lighter thread.
    ctx.strokeStyle = rgba(e.coral ? "#ffd0c6" : "#a8dcc8", 0.35);
    ctx.lineWidth = 0.8;
    ctx.setLineDash([1.5, 2.5]);
    ctx.stroke();
    ctx.setLineDash([]);
    // The plug: nickel sleeve, ivory tip into the jack.
    ctx.fillStyle = "#c4cdca";
    ctx.fillRect(x - 2.4, e.y - 1, 4.8, 8);
    ctx.fillStyle = rgba("#ffffff", 0.45);
    ctx.fillRect(x - 1.6, e.y - 0.5, 1, 7);
    ctx.fillStyle = e.coral ? INK.coral : "#2a3b3a";
    ctx.fillRect(x - 2.8, e.y + 6, 5.6, 2);
  }

  get busy(): boolean {
    return this.ends.size > 0;
  }
}
