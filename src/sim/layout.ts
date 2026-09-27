/**
 * The architecture of Halcyon, built from its people. Every window is part of
 * a household's flat or a workplace's rooms, and each window has an owner
 * (worked out afresh when people move). Buildings are sized to hold exactly
 * the windows their occupants need: there are no empty facades.
 *
 * World units: street level at y = 470; each district is as wide as its
 * buildings need (the switchboard's fields below share the proportions). The
 * Wharf's water lies to the left; Juniper Hill rises, in two terraces, to the
 * right.
 */
import type { Founding } from "./city";
import { Rng } from "./rng";
import type { Household, WorkKind, Workplace } from "./types";

export const WORLD_H = 520;
export const GROUND = 470;
export const FLOOR_H = 10;
export const COL_W = 7;
export const WIN_W = 3.4;
export const WIN_H = 5;
export const EL_Y = 438;
export const WATER_X = 96;
/** The terraces of Juniper Hill: the back row stands this much higher. */
export const TERRACE = 30;

export type Style =
  | "tenement" | "warehouse" | "elevator" | "customs" | "tower" | "hotel" | "civic" | "dome" | "store" | "apartment"
  | "club" | "palais" | "orpheum" | "shop" | "townhouse" | "mansion" | "church" | "infirmary" | "school" | "firehouse"
  | "ship" | "lighthouse" | "shed" | "newspaper" | "office";

export interface Building {
  id: number;
  district: number;
  style: Style;
  name: string;
  x: number;
  w: number;
  base: number;
  /** Height of the windowed body, before crowns and roofs. */
  h: number;
  /** Columns on each floor (setbacks narrow towards the top). */
  cols: number[];
  firstWin: number;
  winCount: number;
  /** Street address for the hover card. */
  address: string;
  variant: number;
  /** 1 for the back terrace of the Hill. */
  row: 0 | 1;
}

export interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
  b: number;
  /** 0 household, 1 workplace. */
  uk: 0 | 1;
  unit: number;
  slot: number;
  /** Last slot of a household: the parlour, lit when anyone is home. */
  parlour: boolean;
  floor: number;
}

export interface Layout {
  width: number;
  /** District boundaries: six x positions. */
  districtX: number[];
  hill: [number, number];
  el: { x0: number; x1: number; stations: number[] };
  buildings: Building[];
  windows: Win[];
  /** Far skyline across the bay: [x, top] pairs, no windows. */
  far: number[];
}

interface Unit {
  uk: 0 | 1;
  id: number;
  n: number;
}

const OFFICE: WorkKind[] = ["insurance", "law", "bank", "paper", "cityhall", "harbour", "customs", "shipping"];

export function floorHeight(style: Style): number {
  return style === "ship" ? 7 : style === "mansion" || style === "civic" || style === "dome" ? 12 : style === "palais" ? 13 : FLOOR_H;
}

export function groundAt(x: number, hill: [number, number]): number {
  if (x <= hill[0]) return GROUND;
  const t = Math.min(1, (x - hill[0]) / Math.max(1, hill[1] - hill[0]));
  return GROUND - 44 * (t * t * (3 - 2 * t));
}

export function buildLayout(f: Founding, seed: number): Layout {
  const r = new Rng(seed ^ 0x51a7);
  const { households, workplaces } = f;
  const buildings: Building[] = [];
  const windows: Win[] = [];

  const hUnit = (h: Household): Unit => ({
    uk: 0,
    id: h.id,
    n: h.kind === "ship" ? Math.max(4, h.members.length * 2) : h.kind === "lighthouse" ? 2 : Math.max(2, h.members.length + 1),
  });
  const wUnit = (w: Workplace): Unit => {
    const per = OFFICE.includes(w.kind) ? (w.kind === "insurance" || w.kind === "law" ? 4 : 2) : w.kind === "hotel" ? 2 : 1;
    let n = Math.max(2, Math.round(w.capacity * per));
    if (w.kind === "shipping") n = 6;
    if (w.kind === "church") n = 3;
    if (w.kind === "lighthouse") n = 1;
    return { uk: 1, id: w.id, n };
  };
  const wk = (kind: WorkKind) => workplaces.filter((w) => w.kind === kind);
  const wOne = (kind: WorkKind) => wk(kind)[0];
  const hh = (d: number, pred: (h: Household) => boolean = () => true) => households.filter((h) => h.district === d && pred(h));

  const takenH = new Set<number>();
  const takeH = (list: Household[], n: number): Unit[] => {
    const out: Unit[] = [];
    for (const h of list) {
      if (out.length >= n) break;
      if (takenH.has(h.id)) continue;
      takenH.add(h.id);
      out.push(hUnit(h));
    }
    return out;
  };

  interface Spec {
    style: Style;
    name: string;
    units: Unit[];
    colsAt: (floor: number) => number;
    minFloors?: number;
    address?: string;
    width?: number;
    gap?: number;
    row?: 0 | 1;
    /** Columns that may be narrowed (the building grows taller instead). */
    flex?: { n: number; min: number };
  }

  const cols = (n: number) => () => n;
  const FLEX: Style[] = ["tenement", "apartment", "shop", "club", "warehouse", "customs", "store", "infirmary", "school", "mansion", "civic", "shed", "orpheum", "palais", "dome"];
  const setback = (tiers: [number, number][]) => (floor: number) => {
    for (const [upTo, c] of tiers) if (floor < upTo) return c;
    return tiers[tiers.length - 1][1];
  };
  const addr = (w?: Workplace) => (w ? `${w.number} ${w.street}` : "");

  // Split a list of household units into buildings of a style, never leaving
  // a lone household in a stub of a building.
  const housing = (style: Style, list: Household[], per: [number, number], c: number, minFloors: number, name = ""): Spec[] => {
    const specs: Spec[] = [];
    const pool = list.filter((h) => !takenH.has(h.id));
    const sizes: number[] = [];
    let left = pool.length;
    while (left > 0) {
      let n = Math.min(left, r.int(per[0], per[1]));
      if (left - n > 0 && left - n < per[0]) n = left;
      sizes.push(n);
      left -= n;
    }
    let i = 0;
    for (const n of sizes) {
      const units = takeH(pool.slice(i, i + n), n);
      i += n;
      if (!units.length) continue;
      const first = households[units[0].id];
      specs.push({ style, name, units, colsAt: cols(c), address: `${first.number} ${first.street}`, minFloors });
    }
    return specs;
  };

  const plan: Spec[][] = [[], [], [], [], []];

  // --- The Wharf ------------------------------------------------------------
  {
    const ship = households.find((h) => h.kind === "ship")!;
    const light = households.find((h) => h.kind === "lighthouse")!;
    takenH.add(ship.id);
    takenH.add(light.id);
    const lw = wOne("lighthouse");
    plan[0].push({ style: "lighthouse", name: "Halcyon Light", units: [hUnit(light), wUnit(lw)], colsAt: cols(1), address: "The breakwater", width: 12, gap: 6, minFloors: 4 });
    plan[0].push({ style: "ship", name: "S.S. Corliss Star", units: [hUnit(ship)], colsAt: cols(9), address: "Moored at Quay Street", width: 54, gap: 5 });
    const cust = wOne("customs");
    plan[0].push({ style: "customs", name: cust.name, units: [wUnit(cust), wUnit(wOne("harbour"))], colsAt: cols(4), address: addr(cust), minFloors: 4 });
    const ship2 = wOne("shipping");
    plan[0].push({ style: "warehouse", name: ship2.name, units: [wUnit(ship2), wUnit(wOne("ferry"))], colsAt: cols(5), address: addr(ship2), minFloors: 3 });
    const flour = wOne("flour");
    plan[0].push({ style: "elevator", name: flour.name, units: [wUnit(flour)], colsAt: cols(2), address: addr(flour), minFloors: 8 });
    const boarding = hh(0, (h) => h.kind === "boarding");
    plan[0].push(...housing("tenement", boarding, [1, 1], 3, 6, "boarding house"));
    plan[0].push(...housing("tenement", hh(0), [4, 6], 4, 6));
    const fish = wOne("fish");
    plan[0].push({ style: "shed", name: fish.name, units: [wUnit(fish)], colsAt: cols(4), address: addr(fish), minFloors: 1 });
  }

  // --- Pell Street ----------------------------------------------------------
  {
    const shops: WorkKind[] = ["bakery", "drugstore", "grocery", "pawn", "laundry"];
    const fam = hh(1);
    const shopUnits = shops.map((k) => wUnit(wOne(k)));
    const total = fam.length;
    const per = Math.ceil(total / shopUnits.length);
    const blocks: Spec[] = [];
    // Tenements with a shop on the ground floor, the city's densest street.
    for (let si = 0; si < shopUnits.length; si++) {
      const w = workplaces[shopUnits[si].id];
      const hs = takeH(fam, per);
      blocks.push({ style: "tenement", name: w.name, units: [shopUnits[si], ...hs], colsAt: cols(4), address: addr(w), minFloors: 7 });
    }
    const fire = wOne("fire");
    blocks.splice(2, 0, { style: "firehouse", name: fire.name, units: [wUnit(fire)], colsAt: cols(3), address: addr(fire), minFloors: 3 });
    plan[1].push(...blocks);
  }

  // --- Midtown --------------------------------------------------------------
  {
    const ins = wOne("insurance");
    const law = wOne("law");
    const hotel = wOne("hotel");
    const bank = wOne("bank");
    const hotelHomes = hh(2, (h) => h.kind === "hotel");
    const flats = housing("apartment", hh(2, (h) => h.kind !== "hotel"), [7, 8], 3, 11);
    plan[2].push(flats[0]);
    plan[2].push({ style: "office", name: bank.name, units: [wUnit(bank)], colsAt: setback([[6, 4], [99, 3]]), address: addr(bank), minFloors: 16 });
    plan[2].push({ style: "newspaper", name: wOne("paper").name, units: [wUnit(wOne("paper"))], colsAt: cols(3), address: addr(wOne("paper")), minFloors: 10 });
    plan[2].push({ style: "tower", name: "Meridian Tower", units: [wUnit(ins), wUnit(law)], colsAt: setback([[11, 4], [20, 3], [99, 2]]), address: addr(ins), minFloors: 27 });
    plan[2].push({ style: "dome", name: wOne("cityhall").name, units: [wUnit(wOne("cityhall"))], colsAt: cols(4), address: addr(wOne("cityhall")), minFloors: 3 });
    plan[2].push({ style: "hotel", name: hotel.name, units: [wUnit(hotel), ...takeH(hotelHomes, 99)], colsAt: setback([[10, 4], [99, 3]]), address: addr(hotel), minFloors: 17 });
    for (const f2 of flats.slice(1)) plan[2].push(f2);
    plan[2].push({ style: "store", name: wOne("store").name, units: [wUnit(wOne("store"))], colsAt: cols(5), address: addr(wOne("store")), minFloors: 4 });
  }

  // --- Lantern Row ----------------------------------------------------------
  {
    const fam = hh(3);
    const venueSpecs: [WorkKind, Style, number][] = [
      ["automat", "shop", 5],
      ["club", "club", 4],
      ["florist", "shop", 5],
      ["pictures", "orpheum", 4],
      ["cafe", "shop", 5],
      ["dancehall", "palais", 3],
      ["books", "shop", 5],
      ["taxi", "shop", 4],
    ];
    const withFlats = venueSpecs.filter(([, s]) => s === "shop" || s === "club").length;
    const per = Math.ceil(fam.length / withFlats);
    for (const [kind, style, minFloors] of venueSpecs) {
      const w = wOne(kind);
      const units = [wUnit(w)];
      if (style === "shop" || style === "club") units.push(...takeH(fam, per));
      plan[3].push({ style, name: w.name, units, colsAt: cols(style === "palais" ? 5 : 3), address: addr(w), minFloors });
    }
  }

  // --- Juniper Hill ---------------------------------------------------------
  {
    const mill = wOne("milliner");
    const velda = households.find((h) => h.members.includes(mill.owner))!;
    const veldaUnits = [wUnit(mill)];
    if (velda && !takenH.has(velda.id)) {
      takenH.add(velda.id);
      veldaUnits.push(hUnit(velda));
    }
    // Front terrace: Juniper Row, the school, Hill Crescent.
    const front: Spec[] = [{ style: "shop", name: mill.name, units: veldaUnits, colsAt: cols(2), address: "14 Juniper Row", minFloors: 3 }];
    front.push(...housing("townhouse", hh(4, (h) => h.cls === 1 && h.street === "Juniper Row"), [1, 1], 2, 3));
    front.splice(Math.min(3, front.length), 0, { style: "school", name: wOne("school").name, units: [wUnit(wOne("school"))], colsAt: cols(4), address: addr(wOne("school")), minFloors: 2 });
    front.push(...housing("townhouse", hh(4, (h) => h.cls === 1 && h.street === "Hill Crescent"), [1, 1], 2, 3));
    // Back terrace, up the hill: the church, the infirmary, Belvedere Road.
    const back: Spec[] = [];
    back.push({ style: "church", name: wOne("church").name, units: [wUnit(wOne("church"))], colsAt: cols(1), address: addr(wOne("church")), minFloors: 3 });
    back.push({ style: "infirmary", name: wOne("infirmary").name, units: [wUnit(wOne("infirmary"))], colsAt: cols(5), address: addr(wOne("infirmary")), minFloors: 5 });
    back.push(...housing("mansion", hh(4, (h) => h.cls === 2), [1, 1], 4, 3));
    back.push(...housing("townhouse", hh(4), [1, 1], 2, 4));
    const wid = (sp: Spec) => sp.colsAt(0) * COL_W + 6;
    const rowW = (list: Spec[]) => list.reduce((a, sp) => a + wid(sp) + 2, 0);
    while (rowW(back) > rowW(front) + 30) {
      const moved = back.findIndex((sp) => sp.style === "townhouse");
      if (moved < 0) break;
      front.push(back.splice(moved, 1)[0]);
    }
    while (rowW(front) > rowW(back) + 30) {
      const moved = front.findIndex((sp, i) => i > 0 && sp.style === "townhouse");
      if (moved < 0) break;
      back.push(front.splice(moved, 1)[0]);
    }
    for (const b of back) b.row = 1;
    plan[4].push(...front, ...back);
  }

  // Anyone left over (should be no one) goes into a Pell Street tenement.
  const rest = households.filter((h) => !takenH.has(h.id));
  if (rest.length) plan[1].push(...housing("tenement", rest, [3, 6], 4, 6));

  // Buildings that may be narrowed, to keep the districts to a common width:
  // Halcyon is a dense city and would rather build up than out.
  for (const list of plan) {
    for (const sp of list) {
      if (!FLEX.includes(sp.style) || sp.width) continue;
      const n0 = sp.colsAt(0);
      if (sp.colsAt(40) !== n0) continue;
      const flex = { n: n0, min: sp.style === "mansion" || sp.style === "palais" || sp.style === "dome" ? 3 : 2 };
      sp.flex = flex;
      sp.colsAt = () => flex.n;
    }
  }
  const MAX_W = 244;
  const MIN_W = 214;

  // --- Place buildings: each district as wide as its widest row. ----------------
  const widthOf = (sp: Spec) => {
    if (sp.width) return sp.width;
    const c = sp.colsAt(0);
    const pad = sp.style === "tower" || sp.style === "hotel" || sp.style === "office" ? 8 : sp.style === "mansion" ? 10 : sp.style === "palais" || sp.style === "dome" ? 10 : 6;
    return c * COL_W + pad;
  };
  const districtX = [0];
  const placed: { sp: Spec; d: number; x: number; w: number }[] = [];
  let hill: [number, number] = [0, 0];
  for (let d = 0; d < 5; d++) {
    const x0 = districtX[d];
    const rowW = [0, 0];
    const rows: Spec[][] = [[], []];
    for (const sp of plan[d]) rows[sp.row ?? 0].push(sp);
    const gapOf = (sp: Spec) => sp.gap ?? (sp.style === "townhouse" ? 1.5 : sp.style === "tenement" && d === 1 ? 1 : 3);
    const measure = () => {
      for (let ri = 0; ri < 2; ri++) rowW[ri] = rows[ri].reduce((a, sp) => a + widthOf(sp) + gapOf(sp), 0);
    };
    measure();
    for (let ri = 0; ri < 2; ri++) {
      while (rowW[ri] > MAX_W) {
        const cand = rows[ri].filter((sp) => sp.flex && sp.flex.n > sp.flex.min).sort((a, b) => b.flex!.n - a.flex!.n)[0];
        if (!cand) break;
        cand.flex!.n--;
        measure();
      }
    }
    const width = Math.max(MIN_W, rowW[0], rowW[1]) + 10;
    for (let ri = 0; ri < 2; ri++) {
      let x = x0 + 5 + (width - 10 - rowW[ri]) / 2 + (ri === 1 ? 4 : 0);
      for (const sp of rows[ri]) {
        const w = widthOf(sp);
        placed.push({ sp, d, x, w });
        x += w + gapOf(sp);
      }
    }
    districtX.push(x0 + width);
    if (d === 4) hill = [x0 - 10, x0 + width * 0.55];
  }
  // Back rows first, so the front terrace stands before them.
  placed.sort((a, b) => (b.sp.row ?? 0) - (a.sp.row ?? 0));
  for (const p of placed) placeBuilding(p.sp, p.d, p.x, p.w);
  const width = districtX[5];

  function placeBuilding(s: Spec, d: number, x: number, w: number) {
    const b: Building = {
      id: buildings.length,
      district: d,
      style: s.style,
      name: s.name,
      x,
      w,
      base: s.style === "ship" ? GROUND + 12 : s.style === "lighthouse" ? GROUND + 4 : groundAt(x + w / 2, hill) - (s.row === 1 ? TERRACE : 0),
      h: 0,
      cols: [],
      firstWin: windows.length,
      winCount: 0,
      address: s.address ?? "",
      variant: r.int(0, 5),
      row: s.row ?? 0,
    };
    buildings.push(b);
    const need = s.units.reduce((a, u) => a + u.n, 0);
    // Floors: fill until every window has a place, then no more.
    const floorCols: number[] = [];
    let cap = 0;
    while (cap < need || floorCols.length < (s.minFloors ?? 1)) {
      const c = Math.max(1, s.colsAt(floorCols.length));
      floorCols.push(c);
      cap += c;
      if (floorCols.length > 40) break;
    }
    // Stretch the last units so the building has no unowned windows.
    const counts = s.units.map((u) => u.n);
    let extra = cap - need;
    let k = counts.length - 1;
    while (extra > 0) {
      counts[k]++;
      extra--;
      k = k === 0 ? counts.length - 1 : k - 1;
    }
    b.cols = floorCols;
    const fh = floorHeight(s.style);
    b.h = floorCols.length * fh + (s.style === "ship" ? 6 : 6);
    // Windows, floor by floor from the street up.
    let unitIdx = 0;
    let slot = 0;
    for (let f = 0; f < floorCols.length; f++) {
      const c = floorCols[f];
      const fw = s.style === "ship" ? w * 0.8 : c * COL_W;
      const left = x + (w - fw) / 2;
      const y = b.base - 6 - (f + 1) * fh + (fh - WIN_H) / 2 + (s.style === "ship" ? 2 : 0);
      for (let i = 0; i < c; i++) {
        while (unitIdx < counts.length && slot >= counts[unitIdx]) {
          unitIdx++;
          slot = 0;
        }
        if (unitIdx >= counts.length) break;
        const u = s.units[unitIdx];
        const cw = fw / c;
        const ww = s.style === "ship" ? 2.6 : s.style === "palais" ? WIN_W * 1.2 : s.style === "church" ? 3 : WIN_W;
        const wh = s.style === "ship" ? 2.6 : s.style === "palais" ? WIN_H * 1.7 : s.style === "church" ? 8 : WIN_H;
        windows.push({
          x: left + cw * i + (cw - ww) / 2,
          y: y + (WIN_H - wh) / 2,
          w: ww,
          h: wh,
          b: b.id,
          uk: u.uk,
          unit: u.id,
          slot,
          parlour: u.uk === 0 && slot === counts[unitIdx] - 1 && counts[unitIdx] > 1,
          floor: f,
        });
        slot++;
      }
    }
    b.winCount = windows.length - b.firstWin;
    for (const u of s.units) {
      if (u.uk === 0) households[u.id].building = b.id;
      else if (workplaces[u.id].building < 0) workplaces[u.id].building = b.id;
    }
  }

  // --- Across the bay: a far skyline with no windows (no one there is ours).
  const far: number[] = [];
  const fr = new Rng(seed ^ 0xfa2);
  for (let x = -10; x < width + 20; ) {
    const w = fr.range(14, 46);
    const tall = x > width * 0.2 && x < width * 0.7 ? fr.range(40, 140) : fr.range(14, 60);
    far.push(x, GROUND - 36 - tall);
    x += w;
  }

  const el = {
    x0: districtX[1] - 30,
    x1: districtX[4] + 10,
    stations: [1, 2, 3].map((d) => (districtX[d] + districtX[d + 1]) / 2 + (d === 2 ? 30 : 0)),
  };
  return { width, districtX, hill, el, buildings, windows, far };
}

/**
 * Current owner of each window: household windows cycle through the
 * household's members, workplace windows through the staff.
 */
export function windowOwners(layout: Layout, households: Household[], workplaces: Workplace[], out?: Int16Array): Int16Array {
  const owners = out ?? new Int16Array(layout.windows.length);
  for (let i = 0; i < layout.windows.length; i++) {
    const w = layout.windows[i];
    if (w.uk === 0) {
      const m = households[w.unit].members;
      owners[i] = m.length === 0 ? -1 : w.parlour ? m[0] : m[w.slot % m.length];
    } else {
      const wp = workplaces[w.unit];
      const s = wp.staff;
      owners[i] = s.length === 0 ? -1 : s[w.slot % s.length];
    }
  }
  return owners;
}
