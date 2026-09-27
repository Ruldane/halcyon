/**
 * Founding Halcyon from a seed: households, citizens, jobs, lines, ties and
 * secrets. Deterministic for a seed; the architecture that houses it all is
 * built from the result in layout.ts.
 */
import { DISTRICTS, FEMALE, MALE, OCC, OPEN_VENUES, SURNAMES, WORKPLACES, type WorkDef } from "./data";
import { Rng } from "./rng";
import {
  Act,
  K,
  type Citizen,
  type HouseKind,
  type Household,
  type Kin,
  type Line,
  type SecretTpl,
  type Tie,
  type Traits,
  type Venue,
  type Workplace,
} from "./types";

export interface Founding {
  citizens: Citizen[];
  households: Household[];
  workplaces: Workplace[];
  venues: Venue[];
  lines: Line[];
}

interface Slot {
  role: "head" | "spouse" | "child" | "parent" | "lodger";
  sex: "f" | "m";
  age: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function traits(r: Rng): Traits {
  const t = () => clamp01(0.5 + r.gauss() * 0.22);
  return {
    soc: t(),
    gossip: t(),
    discretion: t(),
    warmth: t(),
    nerve: t(),
    credulity: t(),
    owl: Math.max(-1, Math.min(1, r.gauss() * 0.45)),
    thrift: t(),
    pious: clamp01(r.next() * r.next() * 1.6),
  };
}

export function blankTie(o: number, k: number, s: number): Tie {
  return { o, k, s, r: 0, tr: s * 0.8, last: 0, n: 0, hh: -1, hc: 0, miss: 0 };
}

export function tieOf(c: Citizen, o: number): Tie | undefined {
  for (const t of c.ties) if (t.o === o) return t;
  return undefined;
}

/** Add (or strengthen) a mutual tie. */
export function link(a: Citizen, b: Citizen, k: number, s: number, kinAB?: Kin, kinBA?: Kin): void {
  if (a.id === b.id) return;
  let ta = tieOf(a, b.id);
  if (!ta) a.ties.push((ta = blankTie(b.id, 0, s)));
  let tb = tieOf(b, a.id);
  if (!tb) b.ties.push((tb = blankTie(a.id, 0, s)));
  ta.k |= k;
  tb.k |= k;
  ta.s = Math.max(ta.s, s);
  tb.s = Math.max(tb.s, s);
  ta.tr = Math.max(ta.tr, s * 0.85);
  tb.tr = Math.max(tb.tr, s * 0.85);
  if (kinAB) ta.kin = kinAB;
  if (kinBA) tb.kin = kinBA;
}

function swapKin(k: Kin, sexOfOther: "f" | "m"): Kin {
  // Given "A is B's k", what is B to A?
  const f = sexOfOther === "f";
  switch (k) {
    case "wife":
    case "husband":
      return f ? "wife" : "husband";
    case "sister":
    case "brother":
      return f ? "sister" : "brother";
    case "mother":
    case "father":
      return f ? "daughter" : "son";
    case "daughter":
    case "son":
      return f ? "mother" : "father";
    case "aunt":
    case "uncle":
      return f ? "niece" : "nephew";
    case "niece":
    case "nephew":
      return f ? "aunt" : "uncle";
    case "grandmother":
    case "grandfather":
      return f ? "granddaughter" : "grandson";
    case "granddaughter":
    case "grandson":
      return f ? "grandmother" : "grandfather";
    case "sister-in-law":
    case "brother-in-law":
      return f ? "sister-in-law" : "brother-in-law";
    default:
      return "cousin";
  }
}

export function found(seed: number, now: number): Founding {
  const r = new Rng(hashSeed(seed));
  const citizens: Citizen[] = [];
  const households: Household[] = [];
  const usedNames = new Set<string>();

  const surnamePool = r.shuffle([...SURNAMES]);
  let surnameIdx = 0;
  const freshSurname = () => surnamePool[surnameIdx++ % surnamePool.length];

  const firstName = (sex: "f" | "m", last: string) => {
    const pool = sex === "f" ? FEMALE : MALE;
    for (let i = 0; i < 20; i++) {
      const f = r.pick(pool);
      if (!usedNames.has(f + " " + last)) {
        usedNames.add(f + " " + last);
        return f;
      }
    }
    return r.pick(pool);
  };

  const makeCitizen = (sex: "f" | "m", age: number, last: string, home: number): Citizen => {
    const c: Citizen = {
      id: citizens.length,
      first: firstName(sex, last),
      last,
      sex,
      title: sex === "m" ? "Mr." : "Miss",
      age,
      home,
      job: null,
      work: -1,
      employed: false,
      traits: traits(r),
      money: 0,
      debts: [],
      company: r.range(0.5, 0.9),
      rest: r.range(0.6, 1),
      mood: r.range(-0.2, 0.4),
      act: Act.Home,
      venue: -1,
      actSince: now,
      call: -1,
      suspicion: 0,
      clicks: 0,
      ties: [],
      knows: {},
      secrets: [],
      hist: [],
      plans: [],
      nextTry: now + r.range(5_000, 400_000),
      retry: null,
      expecting: 0,
      children: 0,
      displacedUntil: 0,
    };
    citizens.push(c);
    return c;
  };

  // --- Households -----------------------------------------------------------
  interface Plan {
    kind: HouseKind;
    district: number;
    cls: 0 | 1 | 2;
    n: number;
  }
  const plans: Plan[] = [
    { kind: "ship", district: 0, cls: 0, n: 1 },
    { kind: "lighthouse", district: 0, cls: 0, n: 1 },
    { kind: "boarding", district: 0, cls: 0, n: 2 },
    { kind: "family", district: 0, cls: 0, n: 13 },
    { kind: "single", district: 0, cls: 0, n: 4 },
    { kind: "boarding", district: 1, cls: 0, n: 1 },
    { kind: "family", district: 1, cls: 0, n: 26 },
    { kind: "single", district: 1, cls: 0, n: 8 },
    { kind: "hotel", district: 2, cls: 1, n: 9 },
    { kind: "family", district: 2, cls: 1, n: 8 },
    { kind: "single", district: 2, cls: 1, n: 6 },
    { kind: "boarding", district: 3, cls: 0, n: 1 },
    { kind: "family", district: 3, cls: 0, n: 13 },
    { kind: "single", district: 3, cls: 1, n: 10 },
    { kind: "family", district: 4, cls: 1, n: 14 },
    { kind: "single", district: 4, cls: 1, n: 5 },
    { kind: "family", district: 4, cls: 2, n: 4 },
  ];

  const streetNums = new Map<string, number>();
  const address = (district: number, streetIdx?: number) => {
    const streets = DISTRICTS[district].streets;
    const street = streets[streetIdx ?? r.int(0, streets.length - 1)];
    let n = (streetNums.get(street) ?? r.int(2, 9)) + r.int(2, 6);
    if (street === "Juniper Row" && n === 14) n = 16;
    streetNums.set(street, n);
    return { street, number: n };
  };

  for (const p of plans) {
    for (let i = 0; i < p.n; i++) {
      const { street, number } = address(p.district, p.kind === "ship" || p.kind === "lighthouse" ? 0 : undefined);
      const h: Household = {
        id: households.length,
        kind: p.kind,
        district: p.district,
        street,
        number,
        flat: "",
        line: -1,
        members: [],
        landlord: -1,
        rent: 0,
        building: -1,
        cls: p.cls,
      };
      households.push(h);
      const slots: Slot[] = [];
      const adult = (lo: number, hi: number) => r.int(lo, hi);
      if (p.kind === "family") {
        const headSex = r.chance(0.82) ? "m" : "f";
        const headAge = adult(24, 66);
        slots.push({ role: "head", sex: headSex, age: headAge });
        if (headSex === "m" && r.chance(0.8)) slots.push({ role: "spouse", sex: "f", age: Math.max(19, headAge - r.int(0, 8)) });
        if (headSex === "f" && r.chance(0.3)) slots.push({ role: "spouse", sex: "m", age: headAge + r.int(0, 6) });
        if (headAge > 40) {
          const kids = r.weighted([0.3, 0.45, 0.25]);
          for (let k = 0; k < kids; k++) slots.push({ role: "child", sex: r.chance(0.5) ? "f" : "m", age: Math.max(17, headAge - r.int(20, 30)) });
        }
        if (headAge < 50 && r.chance(0.16)) slots.push({ role: "parent", sex: r.chance(0.7) ? "f" : "m", age: headAge + r.int(22, 32) });
      } else if (p.kind === "single") {
        slots.push({ role: "head", sex: r.chance(0.55) ? "f" : "m", age: adult(19, 72) });
      } else if (p.kind === "boarding") {
        slots.push({ role: "head", sex: "f", age: adult(45, 70) });
        const lodgers = r.int(3, 5);
        for (let k = 0; k < lodgers; k++) slots.push({ role: "lodger", sex: r.chance(0.6) ? "m" : "f", age: adult(18, 60) });
      } else if (p.kind === "hotel") {
        slots.push({ role: "head", sex: r.chance(0.5) ? "f" : "m", age: adult(25, 78) });
        if (r.chance(0.3)) slots.push({ role: "spouse", sex: slots[0].sex === "m" ? "f" : "m", age: slots[0].age + r.int(-5, 5) });
      } else if (p.kind === "ship") {
        // Filled by the shipping line's hands.
      } else if (p.kind === "lighthouse") {
        // The keeper, and perhaps a spouse, added with the job.
      }
      let family = "";
      for (const s of slots) {
        let last: string;
        if (s.role === "head" || s.role === "lodger") last = freshSurname();
        else if (s.role === "parent" && r.chance(0.35)) last = freshSurname();
        else last = family;
        if (s.role === "head") family = last;
        const c = makeCitizen(s.sex, s.age, last, h.id);
        h.members.push(c.id);
        if (s.role === "spouse") c.title = s.sex === "f" ? "Mrs." : "Mr.";
        if (s.role === "head" && slots.some((x) => x.role === "spouse") && s.sex === "f") c.title = "Mrs.";
        if (s.role === "parent" && s.sex === "f") c.title = "Mrs.";
        if (s.role === "head" && p.kind === "boarding") c.title = "Mrs.";
      }
      // Kin inside the household.
      const members = h.members.map((id) => citizens[id]);
      for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
          const A = members[a];
          const B = members[b];
          const ra = slots[a].role;
          const rb = slots[b].role;
          let kab: Kin | undefined;
          if (ra === "head" && rb === "spouse") kab = B.sex === "f" ? "wife" : "husband";
          else if ((ra === "head" || ra === "spouse") && rb === "child") kab = B.sex === "f" ? "daughter" : "son";
          else if (ra === "child" && rb === "child") kab = B.sex === "f" ? "sister" : "brother";
          else if (ra === "head" && rb === "parent") kab = B.sex === "f" ? "mother" : "father";
          else if (ra === "spouse" && rb === "parent") kab = B.sex === "f" ? "mother" : "father";
          else if (ra === "child" && rb === "parent") kab = B.sex === "f" ? "grandmother" : "grandfather";
          if (kab) {
            // "B is A's kab"; the reverse from B's side.
            const kba = swapKin(kab, A.sex);
            const spouse = kab === "wife" || kab === "husband";
            link(A, B, K.KIN | (spouse ? K.SPOUSE : 0), r.range(0.55, 0.95), kab, kba);
          } else if (ra === "head" && rb === "lodger") {
            link(A, B, K.TENANT, 0.3);
            const tb = tieOf(B, A.id)!;
            tb.k = (tb.k & ~K.TENANT) | K.LANDLORD;
          } else {
            link(A, B, K.NEIGHBOUR, r.range(0.15, 0.5));
          }
        }
      }
    }
  }

  // --- Workplaces and jobs --------------------------------------------------
  const workplaces: Workplace[] = [];
  const workByName = new Map<string, number>();
  const defs: WorkDef[] = [...WORKPLACES];
  // Live-in service for the grand houses of the Hill.
  for (const h of households) {
    if (h.cls === 2 && h.kind === "family") {
      const head = citizens[h.members[0]];
      defs.push({ name: `the ${head.last} house`, kind: "service", district: 4, street: DISTRICTS[4].streets.indexOf(h.street), roles: ["housekeeper", "chauffeur"], revenue: 0 });
    }
  }
  for (const d of defs) {
    const { street, number } = address(d.district, Math.max(0, d.street));
    const w: Workplace = {
      id: workplaces.length,
      name: d.name,
      kind: d.kind,
      district: d.district,
      street,
      number,
      line: -1,
      owner: -1,
      staff: [],
      capacity: d.roles.length,
      till: d.revenue * (d.struggling ? r.range(1.5, 3) : r.range(8, 20)),
      revenue: d.revenue,
      open: true,
      closedUntil: 0,
      building: -1,
      trade: [],
      redDays: 0,
    };
    workplaces.push(w);
    workByName.set(d.name, w.id);
  }
  defs.forEach((d, i) => {
    for (const t of d.trade ?? []) {
      const j = workByName.get(t);
      if (j !== undefined && j !== i) {
        if (!workplaces[i].trade.includes(j)) workplaces[i].trade.push(j);
        if (!workplaces[j].trade.includes(i)) workplaces[j].trade.push(i);
      }
    }
  });

  const shipHouse = households.find((h) => h.kind === "ship")!;
  const lightHouse = households.find((h) => h.kind === "lighthouse")!;

  const hire = (c: Citizen, w: Workplace, occ: string, isOwner: boolean) => {
    c.job = occ;
    c.work = w.id;
    c.employed = true;
    w.staff.push(c.id);
    if (isOwner) w.owner = c.id;
  };

  const suits = (c: Citizen, occ: string, w: Workplace) => {
    const o = OCC[occ];
    if (c.work >= 0 || c.age < 17 || c.age > 67) return 0;
    const h = households[c.home];
    if (h.kind === "ship" || h.kind === "lighthouse") return 0;
    let s = 1;
    s *= c.sex === "f" ? 0.1 + o.f * 2 : 0.1 + (1 - o.f) * 2;
    s *= h.cls === o.cls ? 3 : Math.abs(h.cls - o.cls) === 1 ? 0.6 : 0.05;
    s *= h.district === w.district ? 3 : Math.abs(h.district - w.district) === 1 ? 1.4 : 0.7;
    // Married women of the period mostly kept house.
    const spouseTie = c.ties.find((t) => t.k & K.SPOUSE);
    if (c.sex === "f" && spouseTie) s *= 0.25;
    if (c.age > 60) s *= 0.4;
    if (c.age < 20 && o.cls > 0) s *= 0.5;
    return s;
  };

  defs.forEach((d, wi) => {
    const w = workplaces[wi];
    d.roles.forEach((occ, ri) => {
      let c: Citizen | undefined;
      if (d.name === "Velda's Millinery" && ri === 0) {
        // The milliner of Juniper Row, as the brief would have her.
        const h: Household = { id: households.length, kind: "single", district: 4, street: "Juniper Row", number: 14, flat: "", line: -1, members: [], landlord: -1, rent: 9, building: -1, cls: 1 };
        households.push(h);
        usedNames.add("Velda Orr");
        c = makeCitizen("f", 34, "Orr", h.id);
        c.first = "Velda";
        h.members.push(c.id);
      } else if (occ === "sailor") {
        c = makeCitizen("m", r.int(19, 50), freshSurname(), shipHouse.id);
        shipHouse.members.push(c.id);
      } else if (occ === "keeper") {
        c = makeCitizen(r.chance(0.8) ? "m" : "f", r.int(40, 66), freshSurname(), lightHouse.id);
        lightHouse.members.push(c.id);
        if (r.chance(0.6)) {
          const sp = makeCitizen(c.sex === "m" ? "f" : "m", c.age - r.int(-3, 6), c.last, lightHouse.id);
          sp.title = sp.sex === "f" ? "Mrs." : "Mr.";
          if (c.sex === "f") c.title = "Mrs.";
          lightHouse.members.push(sp.id);
          link(c, sp, K.KIN | K.SPOUSE, 0.85, sp.sex === "f" ? "wife" : "husband", c.sex === "f" ? "wife" : "husband");
        }
      } else if (w.kind === "service") {
        // Live in: a lodger in the grand house.
        const house = households.find((h) => h.cls === 2 && w.name.includes(citizens[h.members[0]].last))!;
        c = makeCitizen(occ === "housekeeper" ? "f" : "m", r.int(24, 60), freshSurname(), house.id);
        house.members.push(c.id);
        for (const m of house.members) if (m !== c.id) link(citizens[m], c, K.NEIGHBOUR, 0.35);
        const head = citizens[house.members[0]];
        link(c, head, K.BUSINESS, 0.4);
        tieOf(c, head.id)!.k |= K.EMPLOYER;
        tieOf(head, c.id)!.k |= K.EMPLOYEE;
      } else {
        let best = -1;
        let bestS = 0;
        for (const cand of citizens) {
          const s = suits(cand, occ, w) * r.range(0.5, 1.5);
          if (s > bestS) {
            bestS = s;
            best = cand.id;
          }
        }
        if (best >= 0 && bestS > 0.9) c = citizens[best];
        else {
          // No one suitable: a new lodger or single tenant takes the job.
          const o = OCC[occ];
          const pool = households.filter((h) => (h.kind === "boarding" || h.kind === "single" || h.kind === "hotel") && (h.district === w.district || r.chance(0.4)) && Math.abs(h.cls - o.cls) <= 1);
          const h = pool.length ? r.pick(pool) : households.find((x) => x.kind === "boarding")!;
          const sex: "f" | "m" = r.chance(o.f) ? "f" : "m";
          c = makeCitizen(sex, r.int(19, 55), freshSurname(), h.id);
          h.members.push(c.id);
          const head = citizens[h.members[0]];
          if (head.id !== c.id) {
            if (h.kind === "boarding") {
              link(head, c, K.TENANT, 0.3);
              tieOf(c, head.id)!.k = K.LANDLORD;
            } else link(head, c, K.NEIGHBOUR, 0.3);
          }
        }
      }
      hire(c, w, occ, ri === 0);
    });
  });

  const velda = citizens[workplaces[workByName.get("Velda's Millinery")!].owner];

  // Everyone else: homemakers, the retired, students, the out of work.
  for (const c of citizens) {
    if (c.work >= 0) continue;
    if (c.age >= 65) c.job = "retired";
    else if (c.age <= 20 && r.chance(0.5)) c.job = "student";
    else if (c.ties.some((t) => t.k & K.SPOUSE) && c.sex === "f") c.job = "homemaker";
    else c.job = r.chance(0.5) ? "unemployed" : "homemaker";
  }

  // --- Landlords and rent ---------------------------------------------------
  const rich = citizens.filter((c) => households[c.home].cls === 2 && c.ties.every((t) => !(t.k & K.EMPLOYER)));
  const landlordOf = [rich[0], rich[1] ?? rich[0], rich[2] ?? rich[0], rich[3] ?? rich[1] ?? rich[0], rich[0]];
  const hotelManager = citizens.find((c) => c.job === "hotelmanager");
  for (const h of households) {
    const rentBase = [5.5, 11, 24][h.cls];
    if (h.kind === "ship" || h.kind === "lighthouse") continue;
    if (h.cls === 2) continue;
    if (h.kind === "boarding") {
      // The landlady owns the house; lodgers pay her.
      h.landlord = -1;
      continue;
    }
    if (h.kind === "hotel" && hotelManager) h.landlord = hotelManager.id;
    else if (h.district === 4 && r.chance(0.5)) h.landlord = -1;
    else h.landlord = landlordOf[h.district]?.id ?? -1;
    h.rent = Math.round(rentBase * r.range(0.8, 1.3) * 2) / 2;
    if (h.landlord >= 0) {
      const L = citizens[h.landlord];
      const head = citizens[h.members[0]];
      if (head && L && head.id !== L.id) {
        link(head, L, K.BUSINESS, 0.25);
        tieOf(head, L.id)!.k |= K.LANDLORD;
        tieOf(L, head.id)!.k |= K.TENANT;
      }
    }
  }

  // --- Money ---------------------------------------------------------------
  for (const c of citizens) {
    const cls = households[c.home].cls;
    const base = [35, 260, 3400][cls];
    c.money = Math.round(base * r.range(0.3, 1.6) * (0.6 + c.traits.thrift * 0.8));
    if (c.job === "unemployed") c.money = Math.round(c.money * 0.3);
  }
  // Some households start behind on the rent.
  for (const h of households) {
    if (h.landlord < 0 || h.rent <= 0) continue;
    const head = citizens[h.members[0]];
    if (h.cls === 0 && r.chance(0.2)) {
      const weeks = r.int(1, 3);
      head.debts.push({ to: h.landlord, amount: h.rent * weeks, since: now - weeks * 7 * 86_400_000, rent: true });
      head.money = Math.min(head.money, r.int(2, 12));
    }
  }
  if (velda) {
    const h = households[velda.home];
    if (h.landlord < 0) h.landlord = landlordOf[4]?.id ?? -1;
    if (h.rent <= 0) h.rent = 9;
    if (h.landlord >= 0 && !velda.debts.some((d) => d.rent)) {
      velda.debts.push({ to: h.landlord, amount: h.rent * 2, since: now - 14 * 86_400_000, rent: true });
      velda.money = 7;
    }
  }

  // --- Venues and lines -----------------------------------------------------
  const venues: Venue[] = [];
  defs.forEach((d, i) => {
    if (d.venue) venues.push({ id: venues.length, name: d.venue.name, kind: d.venue.kind, district: d.district, workplace: i, line: -1 });
  });
  for (const v of OPEN_VENUES) venues.push({ id: venues.length, name: v.name, kind: v.kind, district: v.district, workplace: -1, line: -1 });

  const lines: Line[] = [];
  const addLine = (district: number, kind: Line["kind"], owner: number, label: string) => {
    const l: Line = { id: lines.length, number: "", district, kind, owner, label, slot: 0 };
    lines.push(l);
    return l;
  };
  defs.forEach((d, i) => {
    const w = workplaces[i];
    if (w.kind === "service") return;
    const l = addLine(d.district, d.special ? "special" : "work", w.id, w.name);
    w.line = l.id;
    if (d.venue?.pay) {
      const pay = addLine(d.district, "pay", venues.find((v) => v.workplace === i)!.id, `${d.venue.name}, pay telephone`);
      venues.find((v) => v.workplace === i)!.line = pay.id;
    }
  });
  // Call boxes where there is no pay telephone.
  const boxes = [
    { d: 0, label: "Quay Street call box" },
    { d: 2, label: "Hotel Meridian lobby telephone" },
    { d: 4, label: "Juniper Row call box" },
  ];
  for (const b of boxes) addLine(b.d, "pay", -1, b.label);
  for (const h of households) {
    const has =
      h.kind === "ship" ? false : h.kind === "boarding" || h.kind === "lighthouse" || h.cls >= 1 ? true : r.chance(0.62);
    if (!has) continue;
    const head = citizens[h.members[0]];
    const l = addLine(h.district, "home", h.id, head ? `${head.last}, ${h.number} ${h.street}` : `${h.number} ${h.street}`);
    h.line = l.id;
  }
  // Service workplaces share the grand house's line.
  for (const w of workplaces) {
    if (w.kind !== "service") continue;
    const head = citizens[w.staff[0]];
    const house = households[head.home];
    w.line = house.line;
  }
  // Number the lines by district: specials and business first.
  for (let d = 0; d < 5; d++) {
    const own = lines.filter((l) => l.district === d);
    const rank = (l: Line) => (l.kind === "special" ? 0 : l.kind === "work" ? 1 : l.kind === "pay" ? 2 : 3);
    own.sort((a, b) => rank(a) - rank(b) || a.id - b.id);
    own.forEach((l, i) => {
      l.slot = i;
      l.number = `${d + 1}-${String(i + 11).padStart(2, "0")}`;
    });
  }

  // --- Ties beyond the household --------------------------------------------
  // Colleagues and employers.
  for (const w of workplaces) {
    const owner = w.owner >= 0 ? citizens[w.owner] : null;
    for (const a of w.staff) {
      for (const b of w.staff) {
        if (a < b) link(citizens[a], citizens[b], K.COLLEAGUE, r.range(0.15, 0.55));
      }
      if (owner && owner.id !== a) {
        const c = citizens[a];
        link(c, owner, K.BUSINESS, r.range(0.25, 0.5));
        tieOf(c, owner.id)!.k |= K.EMPLOYER;
        tieOf(owner, c.id)!.k |= K.EMPLOYEE;
      }
    }
  }
  // Trade: owners (or the first clerk) know their suppliers' people.
  for (const w of workplaces) {
    for (const j of w.trade) {
      if (j < w.id) continue;
      const a = citizens[w.owner >= 0 ? w.owner : w.staff[0]];
      const b = citizens[workplaces[j].owner >= 0 ? workplaces[j].owner : workplaces[j].staff[0]];
      if (a && b) link(a, b, K.BUSINESS, r.range(0.3, 0.6));
      const a2 = w.staff[1] !== undefined ? citizens[w.staff[1]] : null;
      const b2 = workplaces[j].staff[1] !== undefined ? citizens[workplaces[j].staff[1]] : null;
      if (a2 && b2 && r.chance(0.5)) link(a2, b2, K.BUSINESS, r.range(0.2, 0.45));
    }
  }
  // Kin across households.
  const adults = citizens.filter((c) => c.age >= 18);
  for (let i = 0; i < Math.round(citizens.length * 0.3); i++) {
    const a = r.pick(adults);
    const b = r.pick(adults);
    if (a.home === b.home || tieOf(a, b.id)) continue;
    const diff = b.age - a.age;
    let kab: Kin;
    if (Math.abs(diff) <= 12) kab = r.chance(0.7) ? (b.sex === "f" ? "sister" : "brother") : "cousin";
    else if (diff >= 20 && diff <= 36) kab = b.sex === "f" ? "mother" : "father";
    else if (diff <= -20 && diff >= -36) kab = b.sex === "f" ? "daughter" : "son";
    else if (diff > 12) kab = b.sex === "f" ? "aunt" : "uncle";
    else kab = b.sex === "f" ? "niece" : "nephew";
    // Keep the family name where it would be kept.
    const married = (c: Citizen) => c.ties.some((t) => t.k & K.SPOUSE);
    const alone = (c: Citizen) => households[c.home].members.length === 1 || citizens[households[c.home].members[0]].id !== c.id;
    if ((kab === "sister" || kab === "brother" || kab === "father" || kab === "son" || kab === "daughter") && !married(b) && alone(b) && !(b === velda)) {
      if (!(a.sex === "f" && married(a))) b.last = a.last;
    }
    // A name that cannot be explained by a marriage makes them cousins.
    if (a.last !== b.last && kab !== "cousin") {
      const explained = (a.sex === "f" && married(a)) || (b.sex === "f" && married(b));
      if (!explained) kab = "cousin";
    }
    link(a, b, K.KIN, r.range(0.35, 0.85), kab, swapKin(kab, a.sex));
  }
  // Velda's sister, who calls every evening.
  if (velda) {
    let sis = velda.ties.map((t) => citizens[t.o]).find((o) => tieOf(velda, o.id)?.kin === "sister");
    if (!sis) {
      sis = adults.find((c) => c.sex === "f" && c.home !== velda.home && Math.abs(c.age - velda.age) < 12 && c.ties.some((t) => t.k & K.SPOUSE) && !tieOf(velda, c.id));
      if (sis) link(velda, sis, K.KIN, 0.85, "sister", "sister");
    }
    if (sis) {
      const t1 = tieOf(velda, sis.id)!;
      const t2 = tieOf(sis, velda.id)!;
      t1.s = t2.s = 0.88;
      t1.tr = t2.tr = 0.85;
      t1.hh = t2.hh = 19.5;
      t1.hc = t2.hc = 0.9;
    }
  }
  // Friends.
  for (const a of citizens) {
    if (a.age < 17) continue;
    const want = Math.round(1 + a.traits.soc * 5);
    let have = a.ties.filter((t) => t.k & K.FRIEND).length;
    for (let tries = 0; tries < 40 && have < want; tries++) {
      const b = r.pick(citizens);
      if (b.id === a.id) continue;
      const ha = households[a.home];
      const hb = households[b.home];
      let p = 0.08;
      if (ha.district === hb.district) p *= 3;
      if (Math.abs(ha.cls - hb.cls) === 0) p *= 1.8;
      else if (Math.abs(ha.cls - hb.cls) === 2) p *= 0.2;
      if (Math.abs(a.age - b.age) < 10) p *= 2;
      if (a.work >= 0 && a.work === b.work) p *= 3;
      p *= 0.5 + b.traits.soc;
      if (!r.chance(Math.min(0.9, p))) continue;
      link(a, b, K.FRIEND, r.range(0.35, 0.8));
      have++;
    }
  }
  // Romance: courting couples, engagements, and unspoken crushes.
  const singles = citizens.filter((c) => c.age >= 19 && c.age <= 45 && !c.ties.some((t) => t.k & K.SPOUSE));
  const romance = (a: Citizen, b: Citizen, s: number, engaged: boolean) => {
    link(a, b, K.ROMANCE | (engaged ? K.ENGAGED : 0), s);
    const ta = tieOf(a, b.id)!;
    const tb = tieOf(b, a.id)!;
    ta.s = tb.s = s;
    ta.tr = tb.tr = s * 0.9;
  };
  const florist = citizens.find((c) => c.job === "florist");
  const bandleader = citizens.find((c) => c.job === "bandleader");
  if (florist && bandleader && florist.sex !== bandleader.sex) romance(florist, bandleader, 0.74, false);
  else if (florist && bandleader) {
    bandleader.sex = florist.sex === "f" ? "m" : "f";
    bandleader.first = firstName(bandleader.sex, bandleader.last);
    bandleader.title = bandleader.sex === "m" ? "Mr." : "Miss";
    romance(florist, bandleader, 0.74, false);
  }
  for (let i = 0; i < 16; i++) {
    const a = r.pick(singles);
    const b = r.pick(singles);
    if (a.sex === b.sex || a.ties.some((t) => t.k & K.ROMANCE) || b.ties.some((t) => t.k & K.ROMANCE) || Math.abs(a.age - b.age) > 12) continue;
    const engaged = i % 4 === 0;
    romance(a, b, engaged ? r.range(0.75, 0.9) : r.range(0.4, 0.75), engaged);
  }
  // Rivals: competitors, neighbours, old friends fallen out.
  const pairsOfKind = (k1: string, k2: string) => {
    const a = workplaces.find((w) => w.kind === k1);
    const b = workplaces.find((w) => w.kind === k2);
    if (a && b && a.owner >= 0 && b.owner >= 0) {
      link(citizens[a.owner], citizens[b.owner], K.RIVAL, 0.2);
      tieOf(citizens[a.owner], citizens[b.owner].id)!.r = 0.6;
      tieOf(citizens[b.owner], citizens[a.owner].id)!.r = 0.6;
    }
  };
  pairsOfKind("club", "dancehall");
  pairsOfKind("florist", "milliner");
  pairsOfKind("cafe", "automat");
  for (let i = 0; i < 18; i++) {
    const a = r.pick(citizens);
    const cands = a.ties.filter((t) => t.k & (K.NEIGHBOUR | K.COLLEAGUE | K.FRIEND) && !(t.k & (K.KIN | K.ROMANCE)));
    if (!cands.length) continue;
    const t = r.pick(cands);
    const b = citizens[t.o];
    t.r = r.range(0.35, 0.8);
    t.k |= K.RIVAL;
    t.s *= 0.5;
    const tb = tieOf(b, a.id)!;
    tb.r = t.r * r.range(0.6, 1.1);
    tb.k |= K.RIVAL;
    tb.s *= 0.5;
  }

  // --- Secrets ---------------------------------------------------------------
  for (const c of citizens) {
    if (c.age < 17) continue;
    const n = r.chance(0.55) ? 2 : 1;
    const options: SecretTpl[] = [];
    if (c.debts.length) options.push("debt", "debt");
    if (singles.includes(c)) options.push("crush", "crush");
    options.push("surprise", "novel", "lessons", "letters", "dog", "recipe");
    if (c.employed && c.traits.nerve > 0.5) options.push("jobhunt");
    if (households[c.home].cls === 0) options.push("pawned");
    if (households[c.home].cls >= 1) options.push("inheritance");
    if (citizens.some((o) => (o.job === "chauffeur" || households[o.home].cls === 2) && tieOf(c, o.id))) options.push("car", "car");
    const picked = new Set<SecretTpl>();
    for (let i = 0; i < n; i++) {
      const tpl = r.pick(options);
      if (picked.has(tpl)) continue;
      picked.add(tpl);
      let other = -1;
      const tieCands = c.ties.filter((t) => !(t.k & K.SPOUSE));
      if (tpl === "crush") {
        const cands = c.ties.filter((t) => citizens[t.o].sex !== c.sex && citizens[t.o].last !== c.last && !(t.k & (K.KIN | K.ROMANCE | K.SPOUSE)) && Math.abs(citizens[t.o].age - c.age) < 15 && !citizens[t.o].ties.some((x) => x.k & K.SPOUSE));
        if (!cands.length) continue;
        other = r.pick(cands).o;
      } else if (tpl === "surprise") {
        const cands = c.ties.filter((t) => t.k & (K.KIN | K.FRIEND | K.SPOUSE));
        if (!cands.length) continue;
        other = r.pick(cands).o;
      } else if (tpl === "car") {
        const cands = c.ties.filter((t) => citizens[t.o].job === "chauffeur" || households[citizens[t.o].home].cls === 2);
        if (!cands.length) continue;
        other = r.pick(cands).o;
      } else if (tpl === "debt") {
        other = c.debts[0]?.to ?? -1;
      } else if (tieCands.length) {
        other = r.pick(tieCands).o;
      }
      c.secrets.push({ tpl, other, n: r.int(0, 5), rumour: -1 });
    }
  }

  // Some couples are expecting.
  for (const c of citizens) {
    if (c.sex === "f" && c.age < 38 && c.ties.some((t) => t.k & K.SPOUSE) && r.chance(0.12)) {
      c.expecting = now + r.range(2, 120) * 86_400_000;
    }
  }

  return { citizens, households, workplaces, venues, lines };
}

function hashSeed(seed: number): number {
  return (seed * 2654435761) >>> 0 || 7;
}

export function fullName(c: Citizen): string {
  return `${c.first} ${c.last}`;
}

export function formalName(c: Citizen): string {
  return `${c.title} ${c.last}`;
}

export function occTitle(c: Citizen): string {
  if (!c.job) return "";
  if (c.job === "retired") return "retired";
  if (c.job === "student") return "student";
  if (c.job === "homemaker") return c.sex === "f" ? "keeps house" : "keeps house";
  if (c.job === "unemployed") return "out of work";
  const t = OCC[c.job]?.title ?? c.job;
  return c.employed ? t : `${t}, out of work`;
}
