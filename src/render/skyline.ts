/**
 * The architecture of Halcyon, drawn once per scale and time of day into an
 * offscreen cache: a 1929 night rendering in teal, with lit piers and crowns,
 * fire escapes and water towers, grain silos, the elevated railway, the ship
 * at Quay Street and the Light on the breakwater. Nothing here moves; windows
 * and all living light are drawn by the city renderer on top.
 */
import { COL_W, EL_Y, GROUND, WATER_X, floorHeight, groundAt, type Building } from "../sim/layout";
import type { StaticCity } from "../worker/protocol";
import { INK, mix, rgba, tones } from "./palette";

export interface View {
  /** World units to CSS pixels. */
  s: number;
  /** World x at the canvas's left edge. */
  x0: number;
  /** World y at the canvas's top edge. */
  y0: number;
}

type Ctx = CanvasRenderingContext2D;

/** Deterministic jitter for decoration. */
const jit = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function bodyWidthAt(b: Building, floor: number): number {
  const pad = b.w - b.cols[0] * COL_W;
  const c = b.cols[Math.min(floor, b.cols.length - 1)];
  if (b.style === "ship" || b.style === "lighthouse") return b.w;
  return c * COL_W + pad * (c / b.cols[0]);
}

/** The building's silhouette as stacked tiers: [x, top, w, bottom]. */
export function tiers(b: Building): [number, number, number, number][] {
  const fh = floorHeight(b.style);
  const out: [number, number, number, number][] = [];
  let start = 0;
  for (let f = 1; f <= b.cols.length; f++) {
    if (f === b.cols.length || b.cols[f] !== b.cols[start]) {
      const w = bodyWidthAt(b, start);
      const bottom = start === 0 ? b.base : b.base - 6 - start * fh;
      const top = b.base - 6 - f * fh;
      out.push([b.x + (b.w - w) / 2, top, w, bottom]);
      start = f;
    }
  }
  return out;
}

export function drawStatic(ctx: Ctx, city: StaticCity, v: View, day: number, dpr: number, W: number, H: number) {
  const T = tones(day);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(v.s * dpr, 0, 0, v.s * dpr, -v.x0 * v.s * dpr, -v.y0 * v.s * dpr);
  const lw = 1 / v.s;

  // Across the bay: the far city, in haze.
  ctx.fillStyle = T.far;
  ctx.beginPath();
  const far = city.far;
  ctx.moveTo(far[0], GROUND);
  for (let i = 0; i < far.length; i += 2) {
    const x = far[i];
    const top = far[i + 1];
    const nx = i + 2 < far.length ? far[i + 2] : x + 30;
    ctx.lineTo(x, top);
    ctx.lineTo(nx - 1, top);
    ctx.lineTo(nx - 1, top + 4 + jit(i, 3) * 10);
  }
  ctx.lineTo(city.width + 40, GROUND);
  ctx.closePath();
  ctx.fill();
  // Haze over the far city.
  const haze = ctx.createLinearGradient(0, GROUND - 180, 0, GROUND);
  haze.addColorStop(0, rgba("#000000", 0));
  haze.addColorStop(1, rgba(day > 0.5 ? "#d7e2d6" : "#1b4a4f", 0.55));
  ctx.fillStyle = haze;
  ctx.fillRect(-20, GROUND - 180, city.width + 60, 180);

  // The hill itself, behind Juniper Hill's terraces.
  ctx.fillStyle = mix(T.ground, T.facade, 0.35);
  ctx.beginPath();
  ctx.moveTo(city.hill[0] - 40, GROUND);
  for (let x = city.hill[0] - 40; x <= city.width + 20; x += 8) ctx.lineTo(x, groundAt(x, city.hill) - 36 - Math.max(0, (x - city.hill[0]) * 0.06));
  ctx.lineTo(city.width + 20, GROUND + 40);
  ctx.lineTo(city.hill[0] - 40, GROUND + 40);
  ctx.closePath();
  ctx.fill();

  // Buildings: back terrace first (they were placed that way).
  for (const b of city.buildings) drawBuilding(ctx, b, T, day, lw, city);

  // Street level.
  ctx.fillStyle = T.street;
  ctx.beginPath();
  ctx.moveTo(WATER_X, GROUND);
  for (let x = WATER_X; x <= city.width + 20; x += 6) ctx.lineTo(x, groundAt(x, city.hill));
  ctx.lineTo(city.width + 20, GROUND + 60);
  ctx.lineTo(WATER_X, GROUND + 60);
  ctx.closePath();
  ctx.fill();
  // Kerb line.
  ctx.strokeStyle = rgba(INK.nickel, 0.18 + day * 0.2);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(WATER_X, GROUND + 0.5);
  for (let x = WATER_X; x <= city.width + 20; x += 6) ctx.lineTo(x, groundAt(x, city.hill) + 0.5);
  ctx.stroke();

  // The harbour.
  const water = ctx.createLinearGradient(0, GROUND - 4, 0, GROUND + 60);
  water.addColorStop(0, T.water);
  water.addColorStop(1, mix(T.water, "#000000", 0.4));
  ctx.fillStyle = water;
  ctx.fillRect(-20, GROUND - 2, WATER_X + 20, 70);
  // Quay edge and pier.
  ctx.fillStyle = T.shadow;
  ctx.fillRect(WATER_X - 3, GROUND - 3, 5, 60);
  ctx.fillStyle = T.steel;
  ctx.fillRect(20, GROUND - 1.5, WATER_X - 20, 2);
  for (let x = 24; x < WATER_X; x += 9) ctx.fillRect(x, GROUND, 0.8, 7);
  // Breakwater under the Light.
  ctx.fillStyle = T.shadow;
  ctx.fillRect(-10, GROUND + 1, 26, 5);

  drawEl(ctx, city, T, lw);
  // Street lamps along the kerb, lit after dusk.
  const night = 1 - day;
  for (let x = WATER_X + 8; x < city.width; x += 23) {
    const g = groundAt(x, city.hill);
    ctx.fillStyle = rgba(INK.nickelDim, 0.5);
    ctx.fillRect(x + 0.35, g - 6.4, 0.4, 6.4);
    ctx.fillStyle = night > 0.35 ? rgba(INK.lamp, 0.85 * night) : T.steel;
    ctx.fillRect(x, g - 7.5, 1.1, 1.1);
  }
}

function drawEl(ctx: Ctx, city: StaticCity, T: ReturnType<typeof tones>, lw: number) {
  const { x0, x1, stations } = city.el;
  ctx.fillStyle = T.steel;
  ctx.strokeStyle = T.steel;
  ctx.lineWidth = lw * 1.2;
  // Deck.
  ctx.fillRect(x0, EL_Y, x1 - x0, 3.2);
  ctx.fillStyle = mix(T.steel, T.edge, 0.35);
  ctx.fillRect(x0, EL_Y - 0.6, x1 - x0, 0.7);
  // Columns and lattice.
  ctx.fillStyle = T.steel;
  for (let x = x0 + 4; x < x1; x += 26) {
    const g = groundAt(x, city.hill);
    ctx.fillRect(x, EL_Y + 3, 1.6, g - EL_Y - 3);
    ctx.beginPath();
    ctx.moveTo(x + 1.6, EL_Y + 3);
    ctx.lineTo(x + 13, EL_Y + 12);
    ctx.lineTo(x + 24.4, EL_Y + 3);
    ctx.stroke();
  }
  // Stations: small Deco shelters on the deck.
  for (const sx of stations) {
    ctx.fillStyle = T.facade;
    ctx.fillRect(sx - 16, EL_Y - 9, 32, 9);
    ctx.fillStyle = T.edge;
    ctx.fillRect(sx - 18, EL_Y - 10.5, 36, 1.6);
    ctx.fillRect(sx - 6, EL_Y - 13, 12, 2.6);
    // Stairs down.
    ctx.strokeStyle = T.steel;
    ctx.beginPath();
    ctx.moveTo(sx + 16, EL_Y + 3);
    ctx.lineTo(sx + 30, GROUND);
    ctx.stroke();
  }
}

function drawBuilding(ctx: Ctx, b: Building, T: ReturnType<typeof tones>, day: number, lw: number, city: StaticCity) {
  const fh = floorHeight(b.style);
  const top = b.base - b.h;
  const face = b.row === 1 ? mix(T.facade, T.far, 0.3) : jit(b.id, 1) > 0.5 ? T.facade : mix(T.facade, T.facadeLit, 0.35);
  const edge = T.edge;
  const tiersOf = tiers(b);

  switch (b.style) {
    case "ship":
      drawShip(ctx, b, T, lw);
      return;
    case "lighthouse":
      drawLighthouse(ctx, b, T);
      return;
  }

  // Foundations down the hill.
  const g = groundAt(b.x + b.w / 2, city.hill);
  if (b.row === 1 || g < b.base) {
    ctx.fillStyle = T.shadow;
    ctx.fillRect(b.x, b.base - 1, b.w, Math.max(2, GROUND - b.base + 4));
  }

  // The body, tier by tier.
  ctx.fillStyle = face;
  for (const [x, t, w, bottom] of tiersOf) ctx.fillRect(x, t, w, bottom - t);

  // Plinth.
  ctx.fillStyle = T.shadow;
  ctx.fillRect(b.x, b.base - 6, b.w, 6);

  // Vertical piers: the Deco emphasis, lit from below at night.
  if (["tower", "office", "hotel", "apartment", "newspaper"].includes(b.style)) {
    for (const [x, t, w, bottom] of tiersOf) {
      const n = Math.max(2, Math.round(w / COL_W));
      for (let i = 0; i <= n; i++) {
        const px = x + (i * w) / n;
        const grad = ctx.createLinearGradient(0, bottom, 0, t);
        grad.addColorStop(0, rgba(INK.jade, 0.0));
        grad.addColorStop(1, rgba(day > 0.5 ? "#ffffff" : INK.jade, day > 0.5 ? 0.12 : 0.22));
        ctx.fillStyle = grad;
        ctx.fillRect(px - 0.35, t, 0.7, bottom - t);
      }
      // Setback ledge highlight.
      ctx.fillStyle = edge;
      ctx.fillRect(x - 0.5, t - 0.8, w + 1, 0.9);
    }
  } else {
    // Cornice.
    ctx.fillStyle = edge;
    ctx.fillRect(b.x - 0.8, top - 0.8, b.w + 1.6, 1.4);
    ctx.fillStyle = T.shadow;
    ctx.fillRect(b.x - 0.8, top + 0.6, b.w + 1.6, 0.7);
  }

  // Floor courses, faint.
  ctx.fillStyle = rgba("#000000", 0.14);
  for (let f = 1; f < b.cols.length; f++) {
    const y = b.base - 6 - f * fh;
    const w = bodyWidthAt(b, f - 1);
    ctx.fillRect(b.x + (b.w - w) / 2, y - 0.2, w, 0.4);
  }

  const cx = b.x + b.w / 2;
  const last = tiersOf[tiersOf.length - 1];
  switch (b.style) {
    case "tower": {
      // Stepped crown with fins, and the spire.
      const [lx, lt, lwid] = last;
      ctx.fillStyle = face;
      let y = lt;
      let wdt = lwid;
      for (let k = 0; k < 4; k++) {
        const nw = wdt * 0.72;
        const nh = 9 - k;
        ctx.fillRect(cx - nw / 2, y - nh, nw, nh);
        ctx.fillStyle = edge;
        ctx.fillRect(cx - nw / 2, y - nh - 0.6, nw, 0.7);
        ctx.fillStyle = face;
        y -= nh;
        wdt = nw;
      }
      // Fins.
      ctx.fillStyle = mix(face, edge, 0.4);
      for (let i = -2; i <= 2; i++) ctx.fillRect(cx + i * (lwid / 5.5) - 0.4, lt - 14 + Math.abs(i) * 3, 0.8, 14 - Math.abs(i) * 3);
      // Spire.
      ctx.fillStyle = T.steel;
      ctx.beginPath();
      ctx.moveTo(cx - 1.4, y);
      ctx.lineTo(cx, y - 34);
      ctx.lineTo(cx + 1.4, y);
      ctx.fill();
      void lx;
      break;
    }
    case "office": {
      const [, lt, lwid] = last;
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.moveTo(cx - lwid / 2, lt);
      ctx.lineTo(cx - lwid / 2 + 4, lt - 12);
      ctx.lineTo(cx, lt - 22);
      ctx.lineTo(cx + lwid / 2 - 4, lt - 12);
      ctx.lineTo(cx + lwid / 2, lt);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = lw;
      ctx.stroke();
      // Classical base: columns at the ground floors.
      ctx.fillStyle = mix(face, edge, 0.3);
      for (let i = 0; i < 6; i++) ctx.fillRect(b.x + 2 + (i * (b.w - 4)) / 5 - 0.5, b.base - 6 - fh * 2, 1, fh * 2);
      break;
    }
    case "hotel": {
      const [, lt, lwid] = last;
      ctx.fillStyle = face;
      ctx.fillRect(cx - lwid * 0.35, lt - 7, lwid * 0.7, 7);
      ctx.fillStyle = edge;
      ctx.fillRect(cx - lwid * 0.35, lt - 7.6, lwid * 0.7, 0.8);
      // Flagpole.
      ctx.fillStyle = T.steel;
      ctx.fillRect(cx - 0.3, lt - 22, 0.6, 15);
      // Canopy.
      ctx.fillStyle = T.shadow;
      ctx.fillRect(cx - 9, b.base - 9, 18, 2);
      break;
    }
    case "newspaper": {
      const [, lt, lwid] = last;
      ctx.fillStyle = face;
      ctx.fillRect(cx - lwid * 0.32, lt - 16, lwid * 0.64, 16);
      ctx.fillStyle = edge;
      ctx.fillRect(cx - lwid * 0.32, lt - 16.6, lwid * 0.64, 0.8);
      // Clock face (the renderer sets the hands).
      ctx.fillStyle = mix(INK.ivory, T.facade, 0.35);
      ctx.beginPath();
      ctx.arc(cx, lt - 8, 4.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "apartment": {
      const [, lt, lwid] = last;
      ctx.fillStyle = face;
      ctx.fillRect(cx - lwid * 0.3, lt - 5, lwid * 0.6, 5);
      drawWaterTower(ctx, cx + lwid * 0.22, lt - 5, T, lw);
      break;
    }
    case "dome": {
      const dw = b.w * 0.5;
      ctx.fillStyle = face;
      ctx.fillRect(cx - dw / 2, top - 8, dw, 8);
      ctx.fillStyle = mix(face, edge, 0.25);
      ctx.beginPath();
      ctx.ellipse(cx, top - 8, dw / 2, dw * 0.55, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.fillStyle = face;
      ctx.fillRect(cx - 2, top - 8 - dw * 0.55 - 6, 4, 6);
      ctx.fillStyle = T.steel;
      ctx.fillRect(cx - 0.3, top - 8 - dw * 0.55 - 12, 0.6, 6);
      // Portico columns.
      ctx.fillStyle = mix(face, edge, 0.35);
      for (let i = 0; i < 7; i++) ctx.fillRect(b.x + 3 + (i * (b.w - 6)) / 6 - 0.5, b.base - 6 - fh, 1, fh);
      ctx.beginPath();
      ctx.moveTo(cx - b.w * 0.3, b.base - 6 - fh);
      ctx.lineTo(cx, b.base - 6 - fh - 6);
      ctx.lineTo(cx + b.w * 0.3, b.base - 6 - fh);
      ctx.fill();
      break;
    }
    case "civic":
    case "customs": {
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.moveTo(b.x - 1, top);
      ctx.lineTo(cx, top - 7);
      ctx.lineTo(b.x + b.w + 1, top);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = lw;
      ctx.stroke();
      if (b.style === "customs") {
        ctx.fillStyle = face;
        ctx.fillRect(cx - 3, top - 15, 6, 8);
        ctx.fillStyle = edge;
        ctx.fillRect(cx - 3.6, top - 15.6, 7.2, 0.8);
        ctx.fillStyle = T.steel;
        ctx.fillRect(cx - 0.3, top - 26, 0.6, 11);
      }
      break;
    }
    case "store": {
      ctx.fillStyle = edge;
      ctx.fillRect(b.x, b.base - 6 - fh - 1.5, b.w, 1);
      // Stepped Deco parapet.
      ctx.fillStyle = face;
      ctx.fillRect(cx - b.w * 0.2, top - 4, b.w * 0.4, 4);
      ctx.fillRect(cx - b.w * 0.1, top - 7, b.w * 0.2, 3);
      break;
    }
    case "tenement": {
      if (jit(b.id, 7) > 0.35) drawWaterTower(ctx, b.x + b.w * (0.25 + jit(b.id, 8) * 0.5), top, T, lw);
      // Fire escapes, on Pell Street and the Wharf.
      if (b.district <= 1 && b.cols.length >= 4) {
        ctx.strokeStyle = rgba(day > 0.5 ? "#23393a" : INK.nickel, day > 0.5 ? 0.55 : 0.28);
        ctx.lineWidth = lw * 0.9;
        const ex = b.x + b.w * 0.5 - 4;
        for (let f = 1; f < b.cols.length; f++) {
          const y = b.base - 6 - f * fh + 1;
          ctx.beginPath();
          ctx.moveTo(ex - 5, y);
          ctx.lineTo(ex + 13, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(f % 2 ? ex - 3 : ex + 11, y);
          ctx.lineTo(f % 2 ? ex + 11 : ex - 3, y - fh + 1);
          ctx.stroke();
        }
      }
      break;
    }
    case "warehouse": {
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.moveTo(b.x, top);
      ctx.lineTo(cx, top - 8);
      ctx.lineTo(b.x + b.w, top);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.fillStyle = T.glass;
      for (let i = 0; i < 3; i++) ctx.fillRect(b.x + 4 + i * ((b.w - 8) / 3), b.base - 6 - 7, (b.w - 8) / 3 - 3, 7);
      // A crane over the quay.
      ctx.strokeStyle = T.steel;
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath();
      ctx.moveTo(b.x - 6, GROUND);
      ctx.lineTo(b.x - 6, top - 18);
      ctx.lineTo(b.x - 36, top - 10);
      ctx.moveTo(b.x - 6, top - 18);
      ctx.lineTo(b.x + 4, top - 14);
      ctx.moveTo(b.x - 30, top - 11);
      ctx.lineTo(b.x - 30, top + 6);
      ctx.stroke();
      break;
    }
    case "elevator": {
      // Grain silos.
      ctx.fillStyle = face;
      const sw = b.w / 3;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(b.x + i * sw + 0.4, top + 2, sw - 0.8, b.base - top - 2);
        ctx.fillStyle = rgba(day > 0.5 ? "#ffffff" : INK.jade, 0.1);
        ctx.fillRect(b.x + i * sw + sw * 0.25, top + 2, sw * 0.15, b.base - top - 2);
        ctx.fillStyle = face;
      }
      ctx.fillRect(b.x + 2, top - 9, b.w * 0.55, 9);
      ctx.fillStyle = edge;
      ctx.fillRect(b.x + 2, top - 9.6, b.w * 0.55, 0.8);
      break;
    }
    case "shed": {
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.moveTo(b.x - 2, top + 2);
      ctx.lineTo(b.x + b.w * 0.2, top - 5);
      ctx.lineTo(b.x + b.w * 0.8, top - 5);
      ctx.lineTo(b.x + b.w + 2, top + 2);
      ctx.fill();
      ctx.fillStyle = edge;
      ctx.fillRect(b.x + b.w * 0.2, top - 5.6, b.w * 0.6, 0.8);
      break;
    }
    case "firehouse": {
      ctx.fillStyle = T.glass;
      for (let i = 0; i < 2; i++) {
        const dx = b.x + 4 + i * (b.w / 2 - 2);
        ctx.fillRect(dx, b.base - 6 - fh + 1, b.w / 2 - 6, fh + 5);
        ctx.beginPath();
        ctx.arc(dx + (b.w / 2 - 6) / 2, b.base - 6 - fh + 1, (b.w / 2 - 6) / 2, Math.PI, 0);
        ctx.fill();
      }
      // Hose tower.
      ctx.fillStyle = face;
      ctx.fillRect(b.x + b.w - 7, top - 16, 7, 16);
      ctx.fillStyle = edge;
      ctx.fillRect(b.x + b.w - 7.6, top - 16.6, 8.2, 0.9);
      break;
    }
    case "club":
    case "orpheum":
    case "palais": {
      ctx.fillStyle = face;
      ctx.fillRect(cx - b.w * 0.25, top - 5, b.w * 0.5, 5);
      ctx.fillRect(cx - b.w * 0.12, top - 9, b.w * 0.24, 4);
      ctx.fillStyle = edge;
      ctx.fillRect(cx - b.w * 0.25, top - 5.6, b.w * 0.5, 0.8);
      // Marquee canopy.
      ctx.fillStyle = T.shadow;
      ctx.fillRect(b.x - 2, b.base - 6 - fh + 1, b.w + 4, 2.4);
      if (b.style === "orpheum") {
        // The vertical sign blade.
        ctx.fillStyle = T.steel;
        ctx.fillRect(cx - 2, top - 2, 4, b.base - top - fh - 6);
      }
      break;
    }
    case "shop": {
      ctx.fillStyle = T.shadow;
      ctx.beginPath();
      ctx.moveTo(b.x - 1.5, b.base - 6 - fh + 1);
      ctx.lineTo(b.x + b.w + 1.5, b.base - 6 - fh + 1);
      ctx.lineTo(b.x + b.w + 3, b.base - 6 - fh + 5);
      ctx.lineTo(b.x - 3, b.base - 6 - fh + 5);
      ctx.fill();
      if (jit(b.id, 4) > 0.55) drawWaterTower(ctx, b.x + b.w * 0.3, top, T, lw);
      break;
    }
    case "townhouse": {
      ctx.fillStyle = T.roof;
      ctx.beginPath();
      ctx.moveTo(b.x - 0.5, top);
      ctx.lineTo(b.x + b.w * 0.2, top - 6);
      ctx.lineTo(b.x + b.w * 0.8, top - 6);
      ctx.lineTo(b.x + b.w + 0.5, top);
      ctx.fill();
      ctx.fillStyle = face;
      ctx.fillRect(b.x + b.w * 0.7, top - 10, 2.2, 6);
      break;
    }
    case "mansion": {
      ctx.fillStyle = T.roof;
      ctx.beginPath();
      ctx.moveTo(b.x - 1.5, top);
      ctx.lineTo(b.x + b.w * 0.18, top - 9);
      ctx.lineTo(b.x + b.w * 0.82, top - 9);
      ctx.lineTo(b.x + b.w + 1.5, top);
      ctx.fill();
      ctx.fillStyle = face;
      ctx.fillRect(b.x + b.w * 0.22, top - 13, 2.4, 6);
      ctx.fillRect(b.x + b.w * 0.74, top - 13, 2.4, 6);
      ctx.fillStyle = mix(face, edge, 0.4);
      for (let i = 0; i < 4; i++) ctx.fillRect(cx - 7 + i * 4.6, b.base - 6 - fh, 0.9, fh);
      break;
    }
    case "church": {
      // Nave and spire.
      ctx.fillStyle = face;
      ctx.fillRect(b.x - 10, top + 10, 12, b.base - top - 10);
      ctx.beginPath();
      ctx.moveTo(b.x - 11, top + 10);
      ctx.lineTo(b.x - 4, top + 3);
      ctx.lineTo(b.x + 3, top + 10);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(b.x - 0.5, top);
      ctx.lineTo(cx, top - 30);
      ctx.lineTo(b.x + b.w + 0.5, top);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case "infirmary": {
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.moveTo(cx - 9, top);
      ctx.lineTo(cx, top - 6);
      ctx.lineTo(cx + 9, top);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case "school": {
      ctx.fillStyle = face;
      ctx.fillRect(cx - 3, top - 7, 6, 7);
      ctx.beginPath();
      ctx.moveTo(cx - 4, top - 7);
      ctx.lineTo(cx, top - 12);
      ctx.lineTo(cx + 4, top - 7);
      ctx.fill();
      break;
    }
  }
  // A door at the street.
  if (!["elevator", "shed", "firehouse", "warehouse", "church"].includes(b.style)) {
    ctx.fillStyle = T.glass;
    ctx.fillRect(cx - 1.4, b.base - 5.5, 2.8, 5.5);
  }
}

function drawWaterTower(ctx: Ctx, x: number, roof: number, T: ReturnType<typeof tones>, lw: number) {
  ctx.strokeStyle = T.steel;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x - 2.6, roof);
  ctx.lineTo(x - 2.2, roof - 4);
  ctx.moveTo(x + 2.6, roof);
  ctx.lineTo(x + 2.2, roof - 4);
  ctx.stroke();
  ctx.fillStyle = T.roof;
  ctx.fillRect(x - 3, roof - 9, 6, 5);
  ctx.beginPath();
  ctx.moveTo(x - 3.4, roof - 9);
  ctx.lineTo(x, roof - 12);
  ctx.lineTo(x + 3.4, roof - 9);
  ctx.fill();
  ctx.fillStyle = T.edge;
  ctx.fillRect(x - 3, roof - 7, 6, 0.4);
}

function drawShip(ctx: Ctx, b: Building, T: ReturnType<typeof tones>, lw: number) {
  const y = b.base;
  const x = b.x;
  const w = b.w;
  // Hull.
  ctx.fillStyle = T.shadow;
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 12);
  ctx.lineTo(x + w + 6, y - 12);
  ctx.lineTo(x + w - 2, y + 2);
  ctx.lineTo(x + 3, y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK.jadeDeep;
  ctx.fillRect(x + 2, y - 1, w - 3, 1.2);
  // Superstructure (the portholes are windows).
  ctx.fillStyle = T.facade;
  ctx.fillRect(x + w * 0.12, y - 12 - b.h + 6, w * 0.76, b.h - 6);
  ctx.fillStyle = T.edge;
  ctx.fillRect(x + w * 0.12, y - 12 - b.h + 5.4, w * 0.76, 0.8);
  // Funnel with an ivory band.
  ctx.fillStyle = T.shadow;
  ctx.fillRect(x + w * 0.55, y - 12 - b.h - 10, 6, 11);
  ctx.fillStyle = mix(INK.ivory, T.facade, 0.4);
  ctx.fillRect(x + w * 0.55, y - 12 - b.h - 7, 6, 1.6);
  // Masts and stays.
  ctx.strokeStyle = T.steel;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.2, y - 12 - b.h);
  ctx.lineTo(x + w * 0.2, y - 12 - b.h - 26);
  ctx.moveTo(x + w * 0.86, y - 12 - b.h);
  ctx.lineTo(x + w * 0.86, y - 12 - b.h - 22);
  ctx.moveTo(x - 4, y - 12);
  ctx.lineTo(x + w * 0.2, y - 12 - b.h - 26);
  ctx.lineTo(x + w * 0.86, y - 12 - b.h - 22);
  ctx.lineTo(x + w + 6, y - 12);
  ctx.stroke();
}

function drawLighthouse(ctx: Ctx, b: Building, T: ReturnType<typeof tones>) {
  const cx = b.x + b.w / 2;
  const base = b.base;
  const top = base - b.h - 8;
  ctx.fillStyle = mix(INK.ivory, T.facade, 0.62);
  ctx.beginPath();
  ctx.moveTo(cx - 5, base);
  ctx.lineTo(cx - 3, top);
  ctx.lineTo(cx + 3, top);
  ctx.lineTo(cx + 5, base);
  ctx.fill();
  // Bands.
  ctx.fillStyle = T.shadow;
  for (let i = 1; i < 4; i++) ctx.fillRect(cx - 5 + i * 0.5, base - i * ((base - top) / 4), 10 - i, 1.4);
  // Gallery and lantern room (the renderer lights it).
  ctx.fillStyle = T.steel;
  ctx.fillRect(cx - 4.5, top - 1, 9, 1.2);
  ctx.fillStyle = T.glass;
  ctx.fillRect(cx - 2.6, top - 6, 5.2, 5);
  ctx.fillStyle = T.shadow;
  ctx.beginPath();
  ctx.moveTo(cx - 3.2, top - 6);
  ctx.lineTo(cx, top - 9.5);
  ctx.lineTo(cx + 3.2, top - 6);
  ctx.fill();
}

/** Where the Light's lamp is, for the beam. */
export function lighthouseLamp(b: Building): [number, number] {
  return [b.x + b.w / 2, b.base - b.h - 8 - 3.5];
}
