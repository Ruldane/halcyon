/**
 * Where a citizen wants to be at a given local time: asleep, at home, at work
 * or out (and where). Shaped by occupation and shift, day of the week,
 * chronotype, loneliness, money, plans, the weather and the calendar.
 * Evening outings are decided once per citizen per day by a hash, so the
 * absence model agrees with the live city.
 */
import { OCC } from "./data";
import { hashUnit } from "./rng";
import { minutesToNewYear, type LocalTime } from "./clock";
import { Act, type Citizen, type World } from "./types";

export interface Want {
  act: Act;
  venue: number;
}

const inWindow = (h: number, a: number, b: number) => {
  // [a, b) on a 24-hour circle, a and b may exceed 24.
  const A = ((a % 24) + 24) % 24;
  const B = ((b % 24) + 24) % 24;
  if (A === B) return false;
  return A < B ? h >= A && h < B : h >= A || h < B;
};

export function shiftToday(c: Citizen, lt: LocalTime): { on: boolean; start: number; end: number } {
  if (!c.job || !c.employed) return { on: false, start: 0, end: 0 };
  const o = OCC[c.job];
  if (!o) return { on: false, start: 0, end: 0 };
  // A shift that crosses midnight belongs to the day it started.
  const crosses = o.end > 24;
  let dow = lt.dow;
  if (crosses && lt.hour < o.end - 24) dow = (dow + 6) % 7;
  // Firemen work one day in three.
  if (o.kind === "fire") {
    const day = lt.dayIndex - (crosses && lt.hour < o.end - 24 ? 1 : 0);
    return { on: (day + c.id) % 3 === 0, start: o.start, end: o.end };
  }
  return { on: ((o.days >> dow) & 1) === 1, start: o.start, end: o.end };
}

export function sleepWindow(c: Citizen, lt: LocalTime): [number, number] {
  const o = c.job ? OCC[c.job] : undefined;
  const owl = c.traits.owl;
  if (o && c.employed && (o.end > 25 || o.start >= 17)) {
    // Night work: sleep through the morning.
    const s = (o.end % 24) + 0.7;
    return [s, s + 7.5];
  }
  let wake = 6.6 + owl * 1.3;
  if (o && c.employed && o.start < 8) wake = Math.min(wake, o.start - 0.8);
  if (lt.dow === 0) wake += 1.2;
  let bed = 22.6 + owl * 1.6;
  if (lt.dow === 5 || lt.dow === 6) bed += 0.8;
  if (c.age > 62) bed -= 0.8;
  // The lonely stay up.
  if (c.company < 0.3 && owl > 0) bed += 1.5 * (0.3 - c.company) / 0.3;
  if (bed - 24 > wake - 5) bed = wake + 24 - 6.5;
  return [bed, wake + 24];
}

export function isAsleepAt(c: Citizen, lt: LocalTime): boolean {
  const [a, b] = sleepWindow(c, lt);
  return inWindow(lt.hour, a, b);
}

/** Evening out: decided once per citizen per day. */
export function outing(w: World, c: Citizen, lt: LocalTime): { from: number; to: number; venue: number } | null {
  if (c.age < 17 || c.displacedUntil > w.t) return null;
  const friday = lt.dow === 5 || lt.dow === 6;
  let p = (0.08 + c.traits.soc * 0.25) * (friday ? 2 : 1) * (c.age < 35 ? 1.3 : c.age > 60 ? 0.4 : 0.8);
  if (c.money < 3) p *= 0.3;
  if (c.company < 0.35) p *= 1.5;
  if (w.storm && w.storm.start <= w.t && w.storm.end > w.t) p *= 0.15;
  const openingTonight = w.openingDay === lt.dayIndex;
  if (openingTonight) p *= 1.6;
  if (hashUnit(c.id, lt.dayIndex, 71) > p) return null;
  const from = 19.2 + hashUnit(c.id, lt.dayIndex, 72) * 1.8;
  const to = from + 1.8 + hashUnit(c.id, lt.dayIndex, 73) * (friday ? 3.2 : 1.8);
  const young = c.age < 35;
  const kinds = w.venues.map((v) => {
    let k = 0;
    if (v.kind === "club") k = young ? 3 : 0.6;
    else if (v.kind === "dance") k = young ? 2.2 : 0.5;
    else if (v.kind === "pictures") k = 2;
    else if (v.kind === "automat") k = 1;
    else if (v.kind === "cafe") k = 1.2;
    else if (v.kind === "pier") k = 0.3;
    if (v.workplace >= 0 && !w.workplaces[v.workplace].open) k = 0;
    if (openingTonight && v.workplace === w.openingVenue) k *= 6;
    if (v.kind === "church" || v.kind === "park") k = 0;
    return k;
  });
  let sum = 0;
  for (const k of kinds) sum += k;
  let x = hashUnit(c.id, lt.dayIndex, 74) * sum;
  let venue = -1;
  for (let i = 0; i < kinds.length; i++) {
    x -= kinds[i];
    if (x < 0) {
      venue = i;
      break;
    }
  }
  if (venue < 0) return null;
  return { from, to, venue };
}

export function want(w: World, c: Citizen, lt: LocalTime): Want {
  if (c.displacedUntil > w.t) return { act: Act.Away, venue: -1 };
  // Plans made on the telephone come first.
  for (const p of c.plans) {
    if (w.t >= p.at - 10 * 60_000 && w.t < p.at + 70 * 60_000) return { act: Act.Out, venue: p.venue };
  }
  const shift = shiftToday(c, lt);
  const wp = c.work >= 0 ? w.workplaces[c.work] : null;
  if (shift.on && wp && wp.open && inWindow(lt.hour, shift.start, shift.end)) return { act: Act.Work, venue: -1 };

  // New Year's Eve: nearly everyone is up for midnight.
  const ny = minutesToNewYear(lt);
  if (ny !== null && ny > -45 && ny < 25 && c.age >= 17) {
    if (c.traits.soc > 0.55 && c.age < 50) {
      const club = w.venues.find((v) => v.kind === "club");
      if (club) return { act: Act.Out, venue: club.id };
    }
    return { act: Act.Home, venue: -1 };
  }

  // Sunday morning service.
  if (lt.dow === 0 && lt.hour >= 10 && lt.hour < 11.7 && c.traits.pious > 0.45) {
    const church = w.venues.find((v) => v.kind === "church");
    if (church) return { act: Act.Out, venue: church.id };
  }
  // Sunday afternoon in the gardens or on the pier.
  if (lt.dow === 0 && lt.hour >= 14 && lt.hour < 16.5 && hashUnit(c.id, lt.dayIndex, 81) < 0.18) {
    const park = w.venues.find((v) => v.kind === (c.id % 3 === 0 ? "pier" : "park"));
    if (park) return { act: Act.Out, venue: park.id };
  }
  if (isAsleepAt(c, lt)) return { act: Act.Asleep, venue: -1 };
  const out = outing(w, c, lt);
  if (out && inWindow(lt.hour, out.from, out.to)) return { act: Act.Out, venue: out.venue };
  return { act: Act.Home, venue: -1 };
}

/**
 * The city's appetite for the telephone by hour: [home, work].
 * Shaped like a real exchange's load: morning rush, the office peak, the
 * evening social hours, the clubs, the long small hours.
 */
const HOME = [0.4, 0.3, 0.24, 0.2, 0.16, 0.16, 0.3, 0.7, 0.9, 0.8, 0.75, 0.75, 0.9, 0.85, 0.75, 0.75, 0.85, 1.05, 1.3, 1.6, 1.7, 1.45, 1.0, 0.6];
const WORK = [0.45, 0.4, 0.4, 0.4, 0.5, 0.8, 1.1, 1.3, 1.6, 2.0, 2.2, 2.1, 1.4, 1.5, 1.9, 2.0, 1.8, 1.3, 0.8, 0.5, 0.4, 0.4, 0.3, 0.2];

export function hourCurve(hour: number, atWork: boolean): number {
  const a = Math.floor(hour) % 24;
  const b = (a + 1) % 24;
  const f = hour - Math.floor(hour);
  const t = atWork ? WORK : HOME;
  return t[a] * (1 - f) + t[b] * f;
}

export function dayFactor(dow: number, atWork: boolean): number {
  if (dow === 0) return atWork ? 0.35 : 0.55;
  if (dow === 6) return atWork ? 0.75 : 1.1;
  return 1;
}
