/**
 * Readings of the city for the page: the census return, a citizen's card,
 * a rumour's trace, the directory, and "what is Halcyon talking about now".
 * All computed from live state on request; nothing here changes the city.
 */
import { biography, temperament } from "../grammar/bio";
import { changedWords, formal, full } from "../grammar/words";
import { occTitle } from "./city";
import { DAY, HOUR, MINUTE, local } from "./clock";
import { districtDown } from "./events";
import { versionTruth } from "./rumours";
import { want } from "./schedule";
import type { Simulation } from "./sim";
import { Act, K, type Citizen, type Rumour, type Tie } from "./types";

export const DISTRICT_NAMES = ["The Wharf", "Pell Street", "Midtown", "Lantern Row", "Juniper Hill"];

export interface CensusRow {
  district: string;
  lines: number;
  up: number;
  hour: number;
  awake: number;
  down: boolean;
}

export interface Census {
  t: number;
  rows: CensusRow[];
  callsHour: number;
  callsToday: number;
  callsTotal: number;
  up: number;
  ringing: number;
  linesDown: number;
  awake: number;
  asleep: number;
  atWork: number;
  out: number;
  onPhone: number;
  population: number;
  rumoursAbroad: number;
  widest: { id: number; text: string; knowers: number } | null;
  wary: number;
  listenerKnowers: number;
  engaged: number;
  inArrears: number;
  busiest: string;
}

export function takeCensus(sim: Simulation, perDistrictHour: number[]): Census {
  const w = sim.w;
  const lt = local(w.t, sim.place);
  const hourIdx = Math.floor((w.t + sim.place.offsetMinutes * MINUTE) / HOUR);
  const callsHour = w.hourlyAt[hourIdx % 48] === hourIdx ? w.hourly[hourIdx % 48] : 0;
  let callsToday = 0;
  for (let h = 0; h <= Math.floor(lt.hour); h++) {
    const idx = hourIdx - h;
    if (w.hourlyAt[idx % 48] === idx) callsToday += w.hourly[idx % 48];
  }
  const rows: CensusRow[] = DISTRICT_NAMES.map((name, d) => ({
    district: name,
    lines: w.lines.filter((l) => l.district === d).length,
    up: w.calls.filter((c) => c.phase === "talk" && c.fromLine >= 0 && w.lines[c.fromLine].district === d).length,
    hour: perDistrictHour[d] ?? 0,
    awake: w.citizens.filter((c) => w.households[c.home].district === d && c.act !== Act.Asleep && c.act !== Act.Away).length,
    down: districtDown(sim, d),
  }));
  const alive = w.rumours.filter((r) => !r.dead && r.knowers >= 2);
  const widestR = alive.filter((r) => r.tpl !== "listener").sort((a, b) => b.knowers - a.knowers)[0];
  const listener = alive.find((r) => r.tpl === "listener");
  const busiest = rows.reduce((a, b) => (b.hour > a.hour ? b : a), rows[0]);
  return {
    t: w.t,
    rows,
    callsHour,
    callsToday,
    callsTotal: w.callsTotal,
    up: w.calls.filter((c) => c.phase === "talk").length,
    ringing: w.calls.filter((c) => c.phase === "ring" || c.phase === "signal").length,
    linesDown: w.lineDown.filter(Boolean).length,
    awake: w.citizens.filter((c) => c.act !== Act.Asleep && c.act !== Act.Away).length,
    asleep: w.citizens.filter((c) => c.act === Act.Asleep).length,
    atWork: w.citizens.filter((c) => c.act === Act.Work).length,
    out: w.citizens.filter((c) => c.act === Act.Out).length,
    onPhone: w.citizens.filter((c) => c.call >= 0).length,
    population: w.citizens.length,
    rumoursAbroad: alive.length,
    widest: widestR ? { id: widestR.id, text: latestText(widestR), knowers: widestR.knowers } : null,
    wary: w.citizens.filter((c) => c.suspicion > 0.3).length,
    listenerKnowers: listener?.knowers ?? 0,
    engaged: w.citizens.filter((c) => c.ties.some((t) => t.k & K.ENGAGED)).length / 2,
    inArrears: w.households.filter((h) => h.members.length && w.citizens[h.members[0]].debts.some((d) => d.rent)).length,
    busiest: busiest.hour > 0 ? busiest.district : "none",
  };
}

function latestText(r: Rumour): string {
  return r.versions[r.versions.length - 1].text;
}

// ---------------------------------------------------------------------------
// The citizen's card
// ---------------------------------------------------------------------------

export interface TieView {
  id: number;
  name: string;
  rel: string;
  s: number;
  r: number;
  line: string;
}

export interface CardData {
  id: number;
  name: string;
  title: string;
  age: number;
  occupation: string;
  workplace: string;
  address: string;
  district: number;
  line: string;
  household: { id: number; name: string; rel: string }[];
  status: string;
  act: number;
  call: number;
  callWith: number;
  money: string;
  company: string;
  rest: string;
  temperament: string;
  ties: TieView[];
  knows: { id: number; text: string; truth: string }[];
  about: { id: number; text: string; knowers: number }[];
  suspicion: number;
  clicks: number;
  bio: string;
  day: { from: number; to: number; act: number }[];
  calls: { t: number; with: number; name: string; out: boolean; secs: number }[];
  windows: number[];
}

export function relLabel(t: Tie): string {
  const parts: string[] = [];
  if (t.kin) parts.push(t.kin);
  else if (t.k & K.KIN) parts.push("family");
  if (t.k & K.ENGAGED) parts.push("engaged");
  else if (t.k & K.ROMANCE && !(t.k & K.SPOUSE)) parts.push("sweetheart");
  if (t.k & K.FRIEND) parts.push("friend");
  if (t.k & K.RIVAL) parts.push("rival");
  if (t.k & K.EMPLOYER) parts.push("employer");
  if (t.k & K.EMPLOYEE) parts.push("employs");
  if (t.k & K.LANDLORD) parts.push("landlord");
  if (t.k & K.TENANT) parts.push("tenant");
  if (t.k & K.COLLEAGUE && !parts.length) parts.push("colleague");
  if (t.k & K.BUSINESS && !parts.length) parts.push("business");
  if (t.k & K.NEIGHBOUR && !parts.length) parts.push("neighbour");
  return parts.slice(0, 2).join(", ") || "acquaintance";
}

export function statusOf(sim: Simulation, c: Citizen): string {
  const w = sim.w;
  if (c.call >= 0) {
    const call = w.calls.find((x) => x.id === c.call);
    if (call) {
      const other = call.from === c.id ? call.answer : call.from;
      const o = other >= 0 ? w.citizens[other] : null;
      if (call.phase === "ring" || call.phase === "signal") return o ? `Ringing ${full(o)}` : "Ringing";
      return o ? `On the telephone with ${full(o)}` : "On the telephone";
    }
  }
  switch (c.act) {
    case Act.Asleep:
      return "Asleep";
    case Act.Home:
      return "At home, awake";
    case Act.Work:
      return c.work >= 0 ? `At work, ${w.workplaces[c.work].name}` : "At work";
    case Act.Out:
      return c.venue >= 0 ? `Out, at ${w.venues[c.venue].name}` : "Out";
    case Act.Away:
      return "Away from home";
  }
  return "";
}

export function readCard(sim: Simulation, id: number): CardData | null {
  const w = sim.w;
  const c = w.citizens[id];
  if (!c) return null;
  const h = w.households[c.home];
  const line = h.line >= 0 ? w.lines[h.line].number : "";
  const call = c.call >= 0 ? w.calls.find((x) => x.id === c.call) : undefined;
  const lt = local(w.t, sim.place);
  // Their day: the schedule for today, sampled every quarter hour.
  const dayStart = w.t - lt.hour * HOUR;
  const day: CardData["day"] = [];
  const saved = { act: c.act, venue: c.venue };
  for (let q = 0; q < 96; q++) {
    const t = dayStart + q * 15 * MINUTE;
    const ltq = local(t, sim.place);
    const prevT = w.t;
    w.t = t;
    const wn = want(w, c, ltq);
    w.t = prevT;
    const last = day[day.length - 1];
    if (last && last.act === wn.act) last.to = q + 1;
    else day.push({ from: q, to: q + 1, act: wn.act });
  }
  c.act = saved.act;
  c.venue = saved.venue;
  const calls = c.hist
    .filter((x) => (x.e === "call" || x.e === "called") && x.t >= dayStart - 6 * HOUR)
    .slice(-12)
    .map((x) => ({ t: x.t, with: x.o ?? -1, name: x.o !== undefined && x.o >= 0 ? full(w.citizens[x.o]) : "", out: x.e === "call", secs: x.n ?? 0 }));
  const ties = [...c.ties]
    .sort((a, b) => b.s + b.r * 0.8 + (b.k & (K.KIN | K.ROMANCE) ? 0.3 : 0) - (a.s + a.r * 0.8 + (a.k & (K.KIN | K.ROMANCE) ? 0.3 : 0)))
    .slice(0, 12)
    .map((t) => {
      const o = w.citizens[t.o];
      const oh = w.households[o.home];
      return { id: o.id, name: full(o), rel: relLabel(t), s: t.s, r: t.r, line: oh.line >= 0 ? w.lines[oh.line].number : "" };
    });
  const knows = Object.entries(c.knows)
    .map(([rid, vi]) => {
      const r = w.rumours.find((x) => x.id === Number(rid));
      if (!r || r.dead) return null;
      const v = r.versions[vi];
      return { id: r.id, text: v.text, truth: versionTruth(r, v), heat: r.heat };
    })
    .filter((x): x is { id: number; text: string; truth: "true" | "embroidered" | "untrue"; heat: number } => !!x)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 6)
    .map(({ id, text, truth }) => ({ id, text, truth }));
  const about = w.rumours
    .filter((r) => r.subject === c.id && !r.dead && r.knowers > 1)
    .map((r) => ({ id: r.id, text: r.versions[r.versions.length - 1].text, knowers: r.knowers }));
  const windows: number[] = [];
  for (let i = 0; i < sim.owners.length; i++) if (sim.owners[i] === c.id) windows.push(i);
  const money = c.money < 3 ? "almost nothing" : c.money < 20 ? "short" : c.money < 150 ? "getting by" : c.money < 1000 ? "comfortable" : "well off";
  return {
    id: c.id,
    name: full(c),
    title: formal(c),
    age: c.age,
    occupation: occTitle(c),
    workplace: c.work >= 0 ? w.workplaces[c.work].name : "",
    address: `${h.kind === "hotel" ? "Hotel Meridian" : h.kind === "ship" ? "S.S. Corliss Star" : h.kind === "lighthouse" ? "Halcyon Light" : `${h.number} ${h.street}`}`,
    district: h.district,
    line,
    household: h.members.filter((m) => m !== c.id).map((m) => {
      const o = w.citizens[m];
      const t = c.ties.find((x) => x.o === m);
      return { id: m, name: full(o), rel: t ? relLabel(t) : "lodger" };
    }),
    status: statusOf(sim, c),
    act: c.act,
    call: call?.id ?? -1,
    callWith: call ? (call.from === c.id ? call.answer : call.from) : -1,
    money,
    company: c.company < 0.3 ? "lonely" : c.company < 0.6 ? "could do with company" : "content",
    rest: c.rest < 0.3 ? "exhausted" : c.rest < 0.6 ? "tired" : "rested",
    temperament: temperament(c),
    ties,
    knows,
    about,
    suspicion: c.suspicion,
    clicks: c.clicks,
    bio: biography(w, c, sim.place, false),
    day,
    calls,
    windows,
  };
}

// ---------------------------------------------------------------------------
// A rumour's path
// ---------------------------------------------------------------------------

export interface TraceHop {
  v: number;
  parent: number;
  t: number;
  teller: number;
  tellerName: string;
  hearer: number;
  hearerName: string;
  text: string;
  changed: boolean[];
  truth: string;
  byPhone: boolean;
  alone: boolean;
  /** The first knower: the one it started with. */
  root: boolean;
  tellerWindow: number;
  hearerWindow: number;
}

export interface Trace {
  id: number;
  tpl: string;
  subject: string;
  born: number;
  knowers: number;
  heat: number;
  dead: boolean;
  hops: TraceHop[];
}

function homeWindow(sim: Simulation, id: number): number {
  const w = sim.w;
  const c = w.citizens[id];
  if (!c) return -1;
  // The parlour of their home, or any window they own.
  let any = -1;
  for (let i = 0; i < sim.owners.length; i++) {
    if (sim.owners[i] !== id) continue;
    const win = sim.layout.windows[i];
    if (win.uk === 0 && win.unit === c.home) return i;
    if (any < 0) any = i;
  }
  if (any >= 0) return any;
  // Someone with no window of their own: their household's.
  for (let i = 0; i < sim.layout.windows.length; i++) {
    const win = sim.layout.windows[i];
    if (win.uk === 0 && win.unit === c.home) return i;
  }
  return -1;
}

export function readTrace(sim: Simulation, id: number): Trace | null {
  const w = sim.w;
  const r = w.rumours.find((x) => x.id === id);
  if (!r) return null;
  const hops: TraceHop[] = r.versions.map((v) => {
    const parent = v.parent >= 0 ? r.versions[v.parent] : null;
    const teller = w.citizens[v.teller];
    const hearer = w.citizens[v.hearer];
    return {
      v: v.id,
      parent: v.parent,
      t: v.t,
      teller: v.teller,
      tellerName: teller ? full(teller) : "",
      hearer: v.hearer,
      hearerName: hearer ? full(hearer) : "",
      text: v.text,
      changed: parent ? changedWords(parent.text, v.text) : v.text.split(/\s+/).map(() => false),
      truth: versionTruth(r, v),
      byPhone: v.call >= 0,
      alone: v.teller === v.hearer && v.id > 0,
      root: v.id === 0,
      tellerWindow: homeWindow(sim, v.teller),
      hearerWindow: homeWindow(sim, v.hearer),
    };
  });
  const S = r.subject >= 0 ? w.citizens[r.subject] : null;
  return { id: r.id, tpl: r.tpl, subject: S ? full(S) : r.tpl === "listener" ? "the Exchange" : "", born: r.born, knowers: r.knowers, heat: r.heat, dead: r.dead, hops };
}

export interface RumourListing {
  id: number;
  text: string;
  subject: string;
  knowers: number;
  heat: number;
  hops: number;
  tpl: string;
  born: number;
}

export function listRumours(sim: Simulation): RumourListing[] {
  const w = sim.w;
  return w.rumours
    .filter((r) => !r.dead && r.versions.length > 1)
    .sort((a, b) => b.knowers * b.heat - a.knowers * a.heat)
    .slice(0, 14)
    .map((r) => ({
      id: r.id,
      text: r.versions[r.versions.length - 1].text,
      subject: r.subject >= 0 ? full(w.citizens[r.subject]) : r.tpl === "listener" ? "the Exchange" : "",
      knowers: r.knowers,
      heat: r.heat,
      hops: r.versions.length - 1,
      tpl: r.tpl,
      born: r.born,
    }));
}

// ---------------------------------------------------------------------------
// The directory
// ---------------------------------------------------------------------------

export interface DirEntry {
  id: number;
  name: string;
  sort: string;
  occupation: string;
  address: string;
  district: number;
  line: string;
  lineId: number;
}

export function directory(sim: Simulation): DirEntry[] {
  const w = sim.w;
  return w.citizens
    .map((c) => {
      const h = w.households[c.home];
      return {
        id: c.id,
        name: full(c),
        sort: `${c.last}, ${c.first}`,
        occupation: occTitle(c),
        address: h.kind === "hotel" ? "Hotel Meridian" : h.kind === "ship" ? "S.S. Corliss Star" : h.kind === "lighthouse" ? "Halcyon Light" : `${h.number} ${h.street}`,
        district: h.district,
        line: h.line >= 0 ? w.lines[h.line].number : "",
        lineId: h.line,
      };
    })
    .sort((a, b) => a.sort.localeCompare(b.sort));
}

// ---------------------------------------------------------------------------
// What is Halcyon talking about now?
// ---------------------------------------------------------------------------

export function talkingAbout(sim: Simulation): string {
  const w = sim.w;
  const lt = local(w.t, sim.place);
  const parts: string[] = [];
  const up = w.calls.filter((c) => c.phase === "talk");
  const awake = w.citizens.filter((c) => c.act !== Act.Asleep && c.act !== Act.Away).length;
  parts.push(`${up.length === 0 ? "No one is" : up.length === 1 ? "One call is" : `${up.length} calls are`} on the line right now; ${awake} of ${w.citizens.length} people are awake.`);
  const purposes = new Map<string, number>();
  for (const c of up) purposes.set(c.purpose, (purposes.get(c.purpose) ?? 0) + 1);
  const names: Record<string, string> = {
    romance: "sweethearts",
    order: "orders and deliveries",
    business: "business",
    chat: "family and friends catching up",
    habit: "regular calls",
    news: "passing on news",
    guarded: "people arranging to meet rather than talk",
    askloan: "someone asking for a loan",
    repay: "a debt being paid back",
    demand: "a landlord after the rent",
    quarrel: "a quarrel",
    makeup: "a making-up",
    newyear: "New Year greetings",
    sympathy: "condolences",
    congratulate: "congratulations",
    jobhunt: "someone looking for work",
    confront: "an awkward question",
    invite: "invitations",
    plan: "plans for the week",
    checkin: "people checking on each other",
    confide: "a confidence",
    fire: "the fire station",
    doctor: "a call for the doctor",
    wrong: "a wrong number",
    operator: "a call to the Exchange itself",
  };
  const topPurposes = [...purposes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => names[p] ?? p);
  if (topPurposes.length) parts.push(`Mostly ${topPurposes.join(", ")}.`);
  const hot = w.rumours.filter((r) => !r.dead && r.knowers > 2).sort((a, b) => b.heat * b.knowers - a.heat * a.knowers).slice(0, 3);
  for (const r of hot) {
    const v = r.versions[r.versions.length - 1];
    parts.push(`${r.knowers} people have heard: "${v.text.replace(/\.$/, "")}."`);
  }
  if (w.storm && w.storm.start <= w.t) parts.push("A storm is over the city.");
  if (w.fire) parts.push("There is a fire.");
  const wary = w.citizens.filter((c) => c.suspicion > 0.3).length;
  if (wary > 0) parts.push(`${wary} ${wary === 1 ? "person suspects" : "people suspect"} that the Exchange is listening.`);
  void lt;
  void DAY;
  return parts.join(" ");
}
