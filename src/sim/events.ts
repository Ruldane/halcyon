/**
 * The city's calendar. Some things come from the almanac, a pure function of
 * the city's seed and the local day (a storm, a fire, an opening night), so
 * the live city and the absence model agree about what happened. Others grow
 * from state (weddings from engagements, births from expecting mothers,
 * bankruptcies from empty tills, repair order from who is cut off).
 */
import { tieOf } from "./city";
import { DAY, HOUR, MINUTE, seasonOf, type LocalTime } from "./clock";
import { OCC } from "./data";
import { hashUnit } from "./rng";
import { createRumour } from "./rumours";
import type { Simulation } from "./sim";
import { Act, K, type Claim, type Storm } from "./types";

export interface Almanac {
  storm: { start: number; hours: number; severity: number } | null;
  fire: { hour: number; pick: number } | null;
  opening: boolean;
}

/** What the day holds, from the seed and the date alone. */
export function almanac(seed: number, dayIndex: number, month: number, south: boolean): Almanac {
  const season = seasonOf(month, south);
  const pStorm = season === "winter" ? 0.2 : season === "autumn" ? 0.1 : season === "spring" ? 0.07 : 0.05;
  const s = hashUnit(seed, dayIndex, 1);
  const storm = s < pStorm ? { start: 15 + hashUnit(seed, dayIndex, 2) * 8, hours: 5 + hashUnit(seed, dayIndex, 3) * 8, severity: 0.45 + hashUnit(seed, dayIndex, 4) * 0.55 } : null;
  const f = hashUnit(seed, dayIndex, 5);
  const fire = f < 0.045 ? { hour: (17 + hashUnit(seed, dayIndex, 6) * 14) % 24, pick: hashUnit(seed, dayIndex, 7) } : null;
  const opening = hashUnit(seed, dayIndex, 8) < 0.22;
  return { storm, fire, opening };
}

/** The order in which the weather takes the districts: the exposed first. */
const EXPOSURE = [0, 4, 1, 3, 2];

export function cityDaily(sim: Simulation, lt: LocalTime) {
  const w = sim.w;
  const dayStart = w.t - lt.hour * HOUR;

  // A new day: consult the almanac.
  if (w.almanacDay !== lt.dayIndex) {
    w.almanacDay = lt.dayIndex;
    const a = almanac(w.seed, lt.dayIndex, lt.month, sim.place.south);
    if (a.storm && !w.storm) {
      const start = dayStart + a.storm.start * HOUR;
      const end = start + a.storm.hours * HOUR;
      const fall = EXPOSURE.map(() => 0);
      EXPOSURE.forEach((d, i) => {
        if (hashUnit(w.seed, lt.dayIndex, 20 + d) < a.storm!.severity * (1 - i * 0.12)) fall[d] = start + (0.4 + i * 0.55 + hashUnit(w.seed, lt.dayIndex, 30 + d) * 0.4) * HOUR;
      });
      const storm: Storm = { day: lt.dayIndex, start, end, severity: a.storm.severity, fall, up: [0, 0, 0, 0, 0], crews: [-1, -1], crewDone: [0, 0] };
      w.storm = storm;
      // The harbour master reads the glass and says so.
      const hm = w.citizens.find((c) => c.job === "harbourmaster");
      if (hm) {
        const claim: Claim = { tpl: "storm", subj: hm.id, other: -1, n: Math.round(a.storm.hours), x: 0, place: 0, v: 0 };
        createRumour(w, "storm", claim, hm.id, -1, w.t, -1, { truth: true });
      }
    }
    if (a.fire && !w.fire) scheduleFire(sim, lt, dayStart + a.fire.hour * HOUR, a.fire.pick);
    if (a.opening && (lt.dow === 5 || lt.dow === 6 || lt.dow === 4)) {
      const halls = w.workplaces.filter((x) => (x.kind === "club" || x.kind === "dancehall" || x.kind === "pictures") && x.open && x.till > x.revenue * 2);
      if (halls.length) {
        const hall = halls[Math.floor(hashUnit(w.seed, lt.dayIndex, 9) * halls.length)];
        w.openingDay = lt.dayIndex;
        w.openingVenue = hall.id;
        const owner = hall.owner >= 0 ? w.citizens[hall.owner] : null;
        if (owner) {
          const claim: Claim = { tpl: "opening", subj: owner.id, other: -1, n: 0, x: 0, place: hall.id, v: 0 };
          const r = createRumour(w, "opening", claim, owner.id, -1, w.t, -1, { truth: true });
          sim.event("opening", owner.id, -1, hall.district, r.id, hall.id, 2);
        }
      }
    }
  }

  // Midnight: the day's living costs; tills are counted.
  if (w.lastDaily !== lt.dayIndex && lt.hour >= 0) {
    const first = w.lastDaily < 0;
    w.lastDaily = lt.dayIndex;
    if (!first) dailyAccounts(sim, lt);
  }
  // Saturday noon: wages.
  if (lt.dow === 6 && lt.hour >= 12 && w.lastPayday !== lt.dayIndex) {
    w.lastPayday = lt.dayIndex;
    payday(sim);
  }
  // Monday morning: rent.
  if (lt.dow === 1 && lt.hour >= 9 && w.lastRentDay !== lt.dayIndex) {
    w.lastRentDay = lt.dayIndex;
    rentDay(sim);
  }
  // Births.
  for (const c of w.citizens) {
    if (c.expecting > 0 && w.t >= c.expecting) {
      c.expecting = 0;
      c.children++;
      sim.hist(c, "birth");
      const spouse = c.ties.find((t) => t.k & K.SPOUSE);
      const claim: Claim = { tpl: "birth", subj: c.id, other: spouse?.o ?? -1, n: 0, x: 0, place: -1, v: 0 };
      const r = createRumour(w, "birth", claim, spouse ? spouse.o : c.id, -1, w.t, -1, { truth: true });
      sim.event("birth", c.id, spouse?.o ?? -1, w.households[c.home].district, r.id, 0, 3);
      const caller = spouse ? w.citizens[spouse.o] : c;
      if (caller.act === Act.Home || caller.act === Act.Asleep) {
        if (caller.act === Act.Asleep) caller.act = Act.Home;
        sim.placeCall(caller, -1, "doctor");
      }
    }
  }
}

function dailyAccounts(sim: Simulation, lt: LocalTime) {
  const w = sim.w;
  const winter = seasonOf(lt.month, sim.place.south) === "winter";
  // Households keep their own: the day's costs fall on whoever in the house has most.
  for (const h of w.households) {
    if (!h.members.length) continue;
    const members = h.members.map((m) => w.citizens[m]);
    const cost = [1.1, 2.4, 7][h.cls] * (winter ? 1.15 : 1) * members.length;
    const keeper = members.reduce((a, b) => (b.money > a.money ? b : a));
    keeper.money -= cost;
    if (keeper.money < 0) {
      keeper.money = 0;
      for (const m of members) m.mood = Math.max(-1, m.mood - 0.05);
    }
  }
  for (const c of w.citizens) {
    // Pensions for the old; odd jobs for the out of work, some days.
    if (c.job === "retired") c.money += 1.2;
    else if (!c.employed && c.job === "unemployed" && hashUnit(w.seed, lt.dayIndex, 900 + c.id) < 0.45) c.money += 2;
    // Couples start families.
    if (c.sex === "f" && c.age < 40 && c.expecting === 0 && c.ties.some((t) => t.k & K.SPOUSE) && hashUnit(w.seed, lt.dayIndex, 1300 + c.id) < 0.0012) {
      c.expecting = w.t + (200 + hashUnit(w.seed, lt.dayIndex, 1400 + c.id) * 70) * DAY;
    }
  }
  // A closed business reopens, in time, under new management.
  for (const wp of w.workplaces) {
    if (wp.open || wp.kind === "service") continue;
    if (hashUnit(w.seed, lt.dayIndex, 1500 + wp.id) < 0.06) {
      const idle = w.citizens.filter((c) => !c.employed && c.job === "unemployed" && c.age < 60);
      wp.open = true;
      wp.till = wp.revenue * 10;
      wp.redDays = 0;
      for (const c of idle.slice(0, Math.max(1, Math.min(wp.capacity, 3)))) sim.hire(c, wp);
      if (wp.staff.length) {
        wp.owner = wp.staff[0];
        const claim: Claim = { tpl: "opening", subj: wp.owner, other: -1, n: 0, x: 0, place: wp.id, v: 0 };
        const r = createRumour(w, "opening", claim, wp.owner, -1, w.t, -1, { truth: true });
        sim.event("opening", wp.owner, -1, wp.district, r.id, wp.id, 2);
      }
    }
  }
  // Ties not kept up fade: friends faster than family, romance fastest.
  for (const c of w.citizens) {
    for (const t of c.ties) {
      const idle = (w.t - t.last) / DAY;
      if (idle < 2 || t.k & K.SPOUSE) continue;
      const rate = t.k & K.ROMANCE ? 0.02 : t.k & K.KIN ? 0.004 : t.k & K.FRIEND ? 0.01 : 0.006;
      const floor = t.k & K.KIN ? 0.3 : 0.05;
      t.s = Math.max(floor, t.s - rate);
      if (t.k & K.ENGAGED && t.s < 0.35) {
        const o = w.citizens[t.o];
        if (o) sim.breakOff(c, o);
      }
    }
  }
  for (const wp of w.workplaces) {
    if (wp.kind === "service") continue;
    const wages = wp.staff.reduce((s, id) => s + (OCC[w.citizens[id].job ?? ""]?.wage ?? 0), 0) / 6;
    const struggling = wp.revenue < 50 || ["dancehall", "cafe"].includes(wp.kind);
    let demand = (struggling ? 0.6 : 0.96) * (0.75 + hashUnit(w.seed, lt.dayIndex, 400 + wp.id) * 0.5);
    if (w.openingDay === lt.dayIndex - 1 && w.openingVenue === wp.id) demand *= 2.4;
    if (w.storm && w.storm.day === lt.dayIndex - 1) demand *= 0.8;
    if (!wp.open || wp.closedUntil > w.t) demand = 0;
    if (lt.dow === 1 && ["club", "dancehall", "pictures"].includes(wp.kind)) demand *= 0.8;
    wp.till += wp.revenue * demand - wp.revenue * 0.55 - wages;
    wp.redDays = wp.till < 0 ? wp.redDays + 1 : 0;
    if (wp.open && wp.redDays >= 4 && wp.kind !== "cityhall" && wp.kind !== "fire" && wp.kind !== "infirmary" && wp.kind !== "church" && wp.kind !== "school" && wp.kind !== "exchange") {
      bankrupt(sim, wp.id);
    }
  }
}

function bankrupt(sim: Simulation, id: number) {
  const w = sim.w;
  const wp = w.workplaces[id];
  wp.open = false;
  const owner = wp.owner >= 0 ? w.citizens[wp.owner] : null;
  const claim: Claim = { tpl: "bankrupt", subj: owner?.id ?? -1, other: -1, n: 0, x: 0, place: wp.id, v: 0 };
  const r = createRumour(w, "bankrupt", claim, owner?.id ?? wp.staff[0], -1, w.t, -1, { truth: true });
  sim.event("bankrupt", owner?.id ?? -1, -1, wp.district, r.id, wp.id, 3);
  for (const s of [...wp.staff]) {
    const c = w.citizens[s];
    c.employed = false;
    c.work = -1;
    sim.hist(c, "lostjob", -1, wp.id);
    if (c.act === Act.Work) c.act = Act.Home;
    sim.event("lostjob", c.id, -1, wp.district, -1, wp.id, 0);
  }
  wp.staff = [];
  sim.ownersDirty();
}

function payday(sim: Simulation) {
  const w = sim.w;
  for (const c of w.citizens) {
    if (!c.employed || !c.job) continue;
    const wage = OCC[c.job]?.wage ?? 0;
    c.money += wage;
    // Debts first, if there's anything to spare.
    for (const d of [...c.debts]) {
      if (d.rent && c.money > d.amount + 4) sim.payRent(c);
      else if (!d.rent && c.money > d.amount + 15 && !c.retry) c.retry = { to: d.to, at: w.t + (10 + (c.id % 50) * 3) * MINUTE, purpose: "repay" };
    }
    c.mood = Math.min(1, c.mood + 0.1);
  }
}

function rentDay(sim: Simulation) {
  const w = sim.w;
  for (const h of w.households) {
    if (h.landlord < 0 || h.rent <= 0 || !h.members.length) continue;
    const head = w.citizens[h.members[0]];
    const L = w.citizens[h.landlord];
    if (head.money >= h.rent + 2) {
      head.money -= h.rent;
      L.money += h.rent;
    } else {
      const d = head.debts.find((x) => x.rent && x.to === h.landlord);
      if (d) d.amount += h.rent;
      else head.debts.push({ to: h.landlord, amount: h.rent, since: w.t, rent: true });
      head.mood = Math.max(-1, head.mood - 0.15);
      sim.hist(head, "rent-owed", L.id, h.rent);
      // A new secret, whether they like it or not.
      if (!head.secrets.some((s) => s.tpl === "debt")) head.secrets.push({ tpl: "debt", other: L.id, n: 1, rumour: -1 });
    }
  }
}

function scheduleFire(sim: Simulation, lt: LocalTime, at: number, pick: number) {
  const w = sim.w;
  const candidates = sim.layout.buildings.filter((b) => ["tenement", "shop", "warehouse", "shed", "club", "townhouse"].includes(b.style));
  if (!candidates.length) return;
  const b = candidates[Math.floor(pick * candidates.length)];
  const households = w.households.filter((h) => h.building === b.id).map((h) => h.id);
  const workplace = w.workplaces.find((x) => x.building === b.id)?.id ?? -1;
  w.fire = { building: b.id, district: b.district, start: at < w.t ? w.t + 20 * MINUTE : at, end: 0, reopen: 0, households, workplace, reported: false };
  void lt;
}

export function fireStep(sim: Simulation, lt: LocalTime) {
  const w = sim.w;
  const f = w.fire;
  if (!f) return;
  if (!f.end && w.t >= f.start) {
    // It starts: the residents are out on the street, and someone runs to a telephone.
    f.end = f.start + (1.2 + hashUnit(w.seed, lt.dayIndex, 50)) * HOUR;
    f.reopen = f.start + (2 + Math.floor(hashUnit(w.seed, lt.dayIndex, 51) * 5)) * DAY;
    const until = f.start - lt.hour * HOUR + (lt.hour < 12 ? 0 : 1) * DAY + 10 * HOUR;
    const residents: number[] = [];
    for (const hid of f.households) {
      for (const m of w.households[hid].members) {
        const c = w.citizens[m];
        c.displacedUntil = until;
        residents.push(m);
        sim.hist(c, "fire", -1, f.building);
      }
    }
    if (f.workplace >= 0) w.workplaces[f.workplace].closedUntil = f.reopen;
    // The nearest telephone that isn't on fire.
    const neighbours = w.households.filter((h) => h.district === f.district && h.line >= 0 && !f.households.includes(h.id));
    const caller = neighbours.flatMap((h) => h.members.map((m) => w.citizens[m])).find((c) => c.act === Act.Home || c.act === Act.Asleep);
    const origin = caller ?? w.citizens[residents[0] ?? 0];
    const claim: Claim = { tpl: "fire", subj: origin.id, other: f.workplace, n: 0, x: 0, place: f.district, v: 0 };
    const r = createRumour(w, "fire", claim, origin.id, -1, w.t, -1, { truth: true });
    sim.event("fire", origin.id, f.workplace, f.district, r.id, f.building, 3);
    if (caller) {
      if (caller.act === Act.Asleep) caller.act = Act.Home;
      sim.placeCall(caller, -1, "fire");
    }
  }
  if (f.end && f.reported && f.end - w.t > 40 * MINUTE) f.end = w.t + 40 * MINUTE;
  if (f.end && w.t >= f.end) {
    sim.event("fireout", -1, f.workplace, f.district, -1, f.building, 2);
    w.fire = null;
  }
}

export function stormStep(sim: Simulation, lt: LocalTime) {
  const w = sim.w;
  const s = w.storm;
  if (!s) return;
  for (let d = 0; d < 5; d++) {
    // Down.
    if (s.fall[d] && w.t >= s.fall[d] && !s.up[d] && !districtDown(sim, d) && s.crewDone[0] !== -d - 10) {
      setDistrict(sim, d, true);
      s.up[d] = 0;
      sim.event("linesdown", -1, -1, d, -1, w.lines.filter((l) => l.district === d).length, 3);
    }
  }
  // The crews go out once the worst has passed, to whichever district most needs them.
  const peak = s.start + (s.end - s.start) * 0.45;
  if (w.t > peak) {
    for (let k = 0; k < s.crews.length; k++) {
      const at = s.crews[k];
      if (at >= 0) {
        if (w.t >= s.crewDone[k]) {
          setDistrict(sim, at, false);
          s.up[at] = w.t;
          s.crews[k] = -1;
          sim.event("linesup", -1, -1, at, -1, k, 2);
        }
        continue;
      }
      let best = -1;
      let bestScore = 0;
      for (let d = 0; d < 5; d++) {
        if (!districtDown(sim, d) || s.crews.includes(d)) continue;
        const lines = w.lines.filter((l) => l.district === d);
        const essential = lines.filter((l) => l.kind === "special").length;
        const homes = lines.filter((l) => l.kind === "home").reduce((n, l) => n + w.households[l.owner].members.length, 0);
        const waiting = w.citizens.filter((c) => w.households[c.home].district === d && c.retry).length;
        const score = essential * 40 + homes + waiting * 3 + (d === 2 ? 10 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = d;
        }
      }
      if (best >= 0) {
        s.crews[k] = best;
        s.crewDone[k] = w.t + (0.8 + hashUnit(w.seed, lt.dayIndex, 60 + best) * 1.2) * HOUR;
      }
    }
  }
  if (w.t > s.end + 10 * HOUR || (w.t > s.end && [0, 1, 2, 3, 4].every((d) => !districtDown(sim, d)) && s.crews.every((c) => c < 0))) {
    for (let d = 0; d < 5; d++) if (districtDown(sim, d)) setDistrict(sim, d, false);
    sim.event("stormend", -1, -1, -1, -1, 0, 2);
    w.storm = null;
  }
}

export function districtDown(sim: Simulation, d: number): boolean {
  const l = sim.w.lines.find((x) => x.district === d);
  return l ? sim.w.lineDown[l.id] : false;
}

function setDistrict(sim: Simulation, d: number, down: boolean) {
  const w = sim.w;
  for (const l of w.lines) {
    if (l.district !== d) continue;
    w.lineDown[l.id] = down;
    if (down) sim.cutOff(l.id);
  }
}

export function weddingsStep(sim: Simulation, lt: LocalTime) {
  const w = sim.w;
  for (let i = w.weddings.length - 1; i >= 0; i--) {
    const wd = w.weddings[i];
    if (w.t < wd.at) continue;
    w.weddings.splice(i, 1);
    const a = w.citizens[wd.a];
    const b = w.citizens[wd.b];
    const t = tieOf(a, b.id);
    if (!t || !(t.k & K.ENGAGED)) continue;
    marry(sim, a, b);
  }
  void lt;
}

export function marry(sim: Simulation, a: Citizen, b: Citizen) {
  const w = sim.w;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    const t = tieOf(x, y.id)!;
    t.k = (t.k & ~K.ENGAGED) | K.SPOUSE | K.KIN;
    t.kin = y.sex === "f" ? "wife" : "husband";
    t.s = Math.min(1, t.s + 0.1);
  }
  // She takes his name, as they did; one of them moves.
  const bride = a.sex === "f" ? a : b;
  const groom = bride === a ? b : a;
  const maiden = bride.last;
  if (groom.sex === "m") {
    bride.last = groom.last;
    bride.title = "Mrs.";
  }
  const hb = w.households[bride.home];
  const hg = w.households[groom.home];
  const mover = hg.members.length <= 1 && hb.members.length > 1 ? groom : hb.cls <= hg.cls ? bride : groom;
  const from = w.households[mover.home];
  const to = mover === bride ? hg : hb;
  from.members = from.members.filter((m) => m !== mover.id);
  to.members.push(mover.id);
  mover.home = to.id;
  sim.hist(bride, "married", groom.id, 0);
  sim.hist(groom, "married", bride.id, 0);
  if (maiden !== bride.last) bride.hist.push({ t: w.t, e: "nee", n: 0, o: -1 });
  bride.maiden = maiden;
  const claim: Claim = { tpl: "wedding", subj: bride.id, other: groom.id, n: 0, x: 0, place: -1, v: 0 };
  const r = createRumour(w, "wedding", claim, groom.id, -1, w.t, -1, { truth: true });
  sim.event("wedding", bride.id, groom.id, to.district, r.id, 0, 3);
  sim.ownersDirty();
}

import type { Citizen } from "./types";
