/**
 * The city's step function. Headless and deterministic for a seed and a
 * sequence of commands; the worker drives it in real time, the tests drive it
 * as fast as they like.
 *
 * Each step (half a second of city time) advances the calls on the board.
 * Each citizen is looked at once a city minute (staggered across steps):
 * where they want to be, how lonely, tired and short of money they are, and
 * whether they pick up the telephone, whom they ring, and why.
 */
import { clickAnswer, clickReaction, guardedReplacement, planTalk, toBeats, type TalkCtx } from "../grammar/conversation";
import { claimText } from "../grammar/rumour";
import { LogWriter } from "../grammar/log";
import { tidy } from "../grammar/words";
import { blankTie, found, tieOf } from "./city";
import { DAY, HOUR, MINUTE, local, minutesToNewYear, type LocalTime, type Place } from "./clock";
import { OCC } from "./data";
import { cityDaily, stormStep, fireStep, weddingsStep } from "./events";
import { buildLayout, windowOwners, type Layout } from "./layout";
import { Rng } from "./rng";
import { choosePassable, createRumour, decayRumours, isNews, mutate, pruneRumours, rumourById } from "./rumours";
import { dayFactor, hourCurve, want } from "./schedule";
import {
  Act,
  K,
  type Beat,
  type Call,
  type Citizen,
  type Claim,
  type Effect,
  type EventKind,
  type LogEntry,
  type Paper,
  type Purpose,
  type Rumour,
  type SimEvent,
  type Tie,
  type Version,
  type Workplace,
  type World,
} from "./types";

export const DT = 500;
/** Steps per city minute: each citizen is considered once in this cycle. */
const CYCLE = 120;
/** The operator's own position, as a pseudo line. */
export const OPERATOR_LINE = -2;

export interface Heard {
  call: number;
  who: 0 | 1 | 2;
  text: string;
  t: number;
  rumour: number;
}

export interface Outbox {
  events: SimEvent[];
  log: LogEntry[];
  heard: Heard[];
  paper: Paper | null;
  ownersChanged: boolean;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export class Simulation {
  w: World;
  layout: Layout;
  place: Place;
  rng: Rng;
  owners: Int16Array;
  ownersVersion = 1;
  out: Outbox = { events: [], log: [], heard: [], paper: null, ownersChanged: false };
  /** Live mode writes the log line by line; the absence model does not. */
  live = true;
  listen = -1;
  private logWriter = new LogWriter();
  private traced = new Set<number>();
  private lastHour = -1;
  private lastBig = Number.MAX_SAFE_INTEGER;
  private firstCallDay = -1;

  constructor(w: World, place: Place) {
    this.w = w;
    this.place = place;
    this.rng = new Rng(w.rng);
    // The architecture is the founding's: rebuilt from the seed, it is the same
    // however people have since moved. Window owners follow the households.
    this.layout = buildLayout(found(w.seed, w.created), w.seed);
    this.owners = windowOwners(this.layout, w.households, w.workplaces);
    for (const v of w.visits) for (const id of v.traced) this.traced.add(id);
  }

  /** Rumours the visitor has traced are kept in the archive. */
  get tracedIds(): Set<number> {
    return this.traced;
  }

  static found(seed: number, now: number, place: Place): Simulation {
    const f = found(seed, now);
    // Layout is built before anyone moves, so its assignments are the founding's.
    const w: World = {
      seed,
      created: now,
      t: now,
      step: 0,
      rng: new Rng(seed ^ 0x9e3779b9).state(),
      ...f,
      lineCall: f.lines.map(() => -1),
      lineDown: f.lines.map(() => false),
      calls: [],
      nextCallId: 1,
      rumours: [],
      events: [],
      nextEventId: 1,
      storm: null,
      fire: null,
      log: [],
      nextLogId: 1,
      paper: null,
      papers: [],
      visits: [],
      hourly: new Array(48).fill(0),
      hourlyAt: new Array(48).fill(-1),
      callsTotal: 0,
      lastPayday: -1,
      lastRentDay: -1,
      lastDaily: -1,
      openingDay: -1,
      openingVenue: -1,
      newYearDone: -1,
      operatorCall: -1,
      weddings: [],
      listened: 0,
      listenedMs: 0,
      lastListenNote: 0,
      almanacDay: -1,
      editionDue: 0,
      reachedLogged: [],
      said: {},
      nextRumourId: 1,
      logMark: { event: 0, entry: 0, ambient: 0, listened: 0 },
    };
    const sim = new Simulation(w, place);
    const lt = sim.lt();
    for (const c of w.citizens) {
      const wnt = want(w, c, lt);
      c.act = wnt.act;
      c.venue = wnt.venue;
    }
    // A founding city already has a little history in its mouth.
    sim.seedRumours();
    // And it is already talking: live the last few minutes before the visitor arrives.
    sim.warm(now);
    return sim;
  }

  lt(t = this.w.t): LocalTime {
    return local(t, this.place);
  }

  // -------------------------------------------------------------------------
  // The step
  // -------------------------------------------------------------------------

  step(): void {
    const w = this.w;
    w.t += DT;
    w.step++;
    this.stepCalls();
    const lt = this.lt();
    const phase = w.step % CYCLE;
    for (let i = phase; i < w.citizens.length; i += CYCLE) this.minute(w.citizens[i], lt);
    if (w.step % 60 === 0) this.halfMinute(lt);
    w.rng = this.rng.state();
  }

  /** Advance by a span of city time. */
  run(ms: number): void {
    const n = Math.floor(ms / DT);
    for (let i = 0; i < n; i++) this.step();
  }

  private halfMinute(lt: LocalTime) {
    const w = this.w;
    cityDaily(this, lt);
    stormStep(this, lt);
    fireStep(this, lt);
    weddingsStep(this, lt);
    // Rumours cool; suspicion fades when no one is listening.
    const died = decayRumours(w, w.t, 30_000);
    for (const r of died) if (r.tpl === "listener") this.event("suspicion", -1, -1, -1, r.id, 0, 1);
    const fade = Math.pow(0.5, 30_000 / (1.5 * DAY));
    for (const c of w.citizens) if (c.suspicion > 0) c.suspicion = c.suspicion < 0.01 ? 0 : c.suspicion * fade;
    // The hourly tally.
    const hourIdx = Math.floor((w.t + this.place.offsetMinutes * MINUTE) / HOUR);
    if (hourIdx !== this.lastHour) {
      this.lastHour = hourIdx;
      const slot = hourIdx % 48;
      if (w.hourlyAt[slot] !== hourIdx) {
        w.hourlyAt[slot] = hourIdx;
        w.hourly[slot] = 0;
      }
      if (hourIdx % 6 === 0) pruneRumours(w, this.traced, w.t);
    }
    // New Year's Eve at midnight.
    const ny = minutesToNewYear(lt);
    if (ny !== null && ny >= 0 && ny < 2 && w.newYearDone !== lt.year) {
      w.newYearDone = lt.year;
      this.event("newyear", -1, -1, -1, -1, 0, 3);
    }
    if (this.live) {
      const entries = this.logWriter.write(this, lt);
      for (const e of entries) this.addLog(e);
      // Big news stops the presses; otherwise the editions keep their hours.
      const big = w.events.length && w.events[w.events.length - 1].id > this.lastBig && w.events.some((e) => e.id > this.lastBig && e.w >= 3);
      if (w.events.length) this.lastBig = w.events[w.events.length - 1].id;
      if (big || w.t >= w.editionDue) this.maybeEdition(lt);
    }
    if (w.events.length > 600) w.events.splice(0, w.events.length - 400);
    if (w.log.length > 400) w.log.splice(0, w.log.length - 300);
  }

  addLog(e: Omit<LogEntry, "id">): LogEntry {
    const entry: LogEntry = { ...e, text: tidy(e.text), id: this.w.nextLogId++ };
    this.w.log.push(entry);
    this.out.log.push(entry);
    return entry;
  }

  /** The evening paper sets new editions at four, half past nine, and on big news. */
  private maybeEdition(lt: LocalTime) {
    if (this.lastBig === Number.MAX_SAFE_INTEGER) this.lastBig = 0;
    // Imported lazily to keep the core light for tests that do not need it.
    const next = this.composePaper?.(this, lt);
    if (next) {
      this.w.paper = next;
      this.w.papers.push(next);
      if (this.w.papers.length > 20) this.w.papers.shift();
      this.out.paper = next;
    }
    this.w.editionDue = this.w.t + 20 * MINUTE;
  }

  /** Set by the host (worker or tests) to the paper grammar. */
  composePaper: ((sim: Simulation, lt: LocalTime) => Paper | null) | null = null;

  event(kind: EventKind, a: number, b: number, district: number, rumour: number, n: number, weight: number): SimEvent {
    const e: SimEvent = { id: this.w.nextEventId++, t: this.w.t, kind, a, b, district, rumour, n, w: weight };
    this.w.events.push(e);
    this.out.events.push(e);
    this.index(e);
    return e;
  }

  /** Recent events by the people in them, for "who has news worth ringing about". */
  private recentBy = new Map<number, { kind: EventKind; t: number }[]>();
  private indexed = false;
  private index(e: SimEvent) {
    for (const who of [e.a, e.b]) {
      if (who < 0) continue;
      let list = this.recentBy.get(who);
      if (!list) this.recentBy.set(who, (list = []));
      list.push({ kind: e.kind, t: e.t });
      if (list.length > 12) list.shift();
    }
  }

  hist(c: Citizen, e: string, o?: number, n?: number) {
    c.hist.push({ t: this.w.t, e, o, n });
    if (c.hist.length > 80) c.hist.splice(0, c.hist.length - 80);
  }

  // -------------------------------------------------------------------------
  // A citizen's minute
  // -------------------------------------------------------------------------

  private minute(c: Citizen, lt: LocalTime) {
    const w = this.w;
    // Where they want to be.
    if (c.call < 0) {
      const wnt = want(w, c, lt);
      if (wnt.act !== c.act || wnt.venue !== c.venue) {
        const was = c.act;
        c.act = wnt.act;
        c.venue = wnt.venue;
        c.actSince = w.t;
        if (wnt.act === Act.Out && wnt.venue >= 0) this.arrive(c, wnt.venue);
        if (was === Act.Out) c.plans = c.plans.filter((p) => w.t < p.at + 70 * MINUTE);
      }
    }
    // Needs, by the minute.
    const hr = 1 / 60;
    if (c.act === Act.Asleep) c.rest = clamp01(c.rest + hr / 7);
    else c.rest = clamp01(c.rest - hr / 16);
    if (c.act === Act.Home) {
      const h = w.households[c.home];
      const company = h.members.some((m) => m !== c.id && w.citizens[m].act === Act.Home);
      c.company = clamp01(c.company + (company ? 0.012 : -0.03) * hr);
    } else if (c.act === Act.Out) c.company = clamp01(c.company + 0.12 * hr);
    else if (c.act === Act.Work) c.company = clamp01(c.company - 0.004 * hr);
    c.mood = Math.max(-1, Math.min(1, c.mood * 0.9995 + (c.company - 0.5) * 0.0004));
    if (!Number.isFinite(c.money)) c.money = 0;

    // Habits kept and missed.
    this.habits(c, lt);

    // The telephone.
    if (c.call >= 0 || c.act === Act.Asleep || c.act === Act.Away) return;
    if (c.retry && w.t >= c.retry.at) {
      const r = c.retry;
      c.retry = null;
      this.placeCall(c, r.to, r.purpose);
      return;
    }
    if (w.t < c.nextTry) return;
    const habit = this.habitDue(c, lt);
    if (habit && this.rng.chance(0.3)) {
      this.placeCall(c, habit.o, "habit");
      c.nextTry = w.t + this.rng.range(8, 20) * MINUTE;
      return;
    }
    let rate = this.callRate(c, lt);
    if (lt.hour < 4.5 && c.act === Act.Home && (c.traits.owl > 0.25 || c.company < 0.3 || c.ties.some((t) => t.k & K.ROMANCE && !(t.k & K.SPOUSE)))) rate *= 3;
    const ny = minutesToNewYear(lt);
    if (ny !== null && ny >= -1 && ny < 12) rate = 0.35;
    if (!this.rng.chance(rate)) return;
    const choice = ny !== null && ny >= -1 && ny < 12 ? this.newYearTarget(c) : this.chooseTarget(c, lt);
    c.nextTry = w.t + this.rng.range(3, 12) * (1.6 - c.traits.soc) * MINUTE;
    if (choice) this.placeCall(c, choice.to, choice.purpose);
  }

  private arrive(c: Citizen, venue: number) {
    const w = this.w;
    // Meeting in person: what could not be said on the line is said here.
    for (const p of c.plans) {
      if (p.venue !== venue) continue;
      const o = w.citizens[p.with];
      if (!o || o.act !== Act.Out || o.venue !== venue) continue;
      this.meet(c, o, venue);
    }
    // And being seen: a chance someone who knows you both notices.
    if (this.rng.chance(0.06)) {
      const here = w.citizens.filter((x) => x.act === Act.Out && x.venue === venue && x.id !== c.id);
      const other = here.find((x) => x.sex !== c.sex && !tieOf(c, x.id)?.kin && Math.abs(x.age - c.age) < 18 && (tieOf(c, x.id)?.k ?? 0) & (K.FRIEND | K.ROMANCE | K.COLLEAGUE));
      const witness = here.find((x) => x !== other && x.traits.gossip > 0.55 && tieOf(x, c.id));
      if (other && witness && !(tieOf(c, other.id)!.k & K.SPOUSE)) {
        const claim: Claim = { tpl: "seen", subj: c.id, other: other.id, n: 0, x: 0, place: venue, v: 0 };
        const r = createRumour(w, "seen", claim, witness.id, -1, w.t, -1, { truth: true });
        this.hist(witness, "saw", c.id);
        void r;
      }
    }
  }

  meet(a: Citizen, b: Citizen, venue: number) {
    const w = this.w;
    const ta = tieOf(a, b.id);
    const tb = tieOf(b, a.id);
    if (ta) {
      ta.s = clamp01(ta.s + 0.05);
      ta.last = w.t;
    }
    if (tb) {
      tb.s = clamp01(tb.s + 0.05);
      tb.last = w.t;
    }
    a.plans = a.plans.filter((p) => !(p.with === b.id && p.venue === venue));
    b.plans = b.plans.filter((p) => !(p.with === a.id && p.venue === venue));
    // Unheard by anyone at the Exchange: rumours pass freely in person.
    const pass = (x: Citizen, y: Citizen) => {
      let best: Rumour | null = null;
      let score = 0;
      for (const k in x.knows) {
        const r = rumourById(w, Number(k));
        if (!r || r.dead || y.knows[r.id] !== undefined || r.subject === y.id) continue;
        const s = r.heat * (0.5 + x.traits.gossip) * this.rng.range(0.5, 1.5);
        if (s > score) {
          score = s;
          best = r;
        }
      }
      if (best && score > 0.2) this.recordTell(best, x, y, -1, null, -1);
    };
    pass(a, b);
    pass(b, a);
    this.hist(a, "met", b.id, venue);
    this.hist(b, "met", a.id, venue);
    this.event("meeting", a.id, b.id, w.venues[venue]?.district ?? -1, -1, venue, a.suspicion > 0.3 || b.suspicion > 0.3 ? 1 : 0);
  }

  habits(c: Citizen, lt: LocalTime) {
    const dayStart = this.w.t - lt.hour * HOUR;
    for (const t of c.ties) {
      if (t.hh < 0 || t.hc < 0.45) continue;
      if (lt.hour < t.hh + 1.5 || lt.hour > t.hh + 2) continue;
      if (t.md === lt.dayIndex) continue;
      t.md = lt.dayIndex;
      if (t.last >= dayStart) {
        t.miss = 0;
        continue;
      }
      t.miss++;
      if (t.miss === 1 || t.miss === 3) this.event("missedhabit", c.id, t.o, this.w.households[c.home].district, -1, t.miss, t.miss === 1 ? 1 : 2);
      if (t.miss > 6) t.hc *= 0.7;
    }
  }

  private habitDue(c: Citizen, lt: LocalTime): Tie | null {
    const dayStart = this.w.t - lt.hour * HOUR;
    for (const t of c.ties) {
      if (t.hh < 0 || t.hc < 0.4) continue;
      if (Math.abs(lt.hour - t.hh) > 0.3) continue;
      if (t.last >= dayStart) continue;
      // Betrayal breaks the habit.
      if (t.tr < 0.3) continue;
      return t;
    }
    return null;
  }

  newYearTarget(c: Citizen): { to: number; purpose: Purpose } | null {
    const ties = c.ties.filter((t) => t.k & (K.KIN | K.FRIEND | K.ROMANCE) && this.w.citizens[t.o].home !== c.home);
    if (!ties.length) return null;
    const t = ties[this.rng.weighted(ties.map((x) => x.s))];
    return t ? { to: t.o, purpose: "newyear" } : null;
  }

  chooseTarget(c: Citizen, lt: LocalTime): { to: number; purpose: Purpose } | null {
    const w = this.w;
    if (!this.indexed) {
      this.indexed = true;
      for (const e of w.events) this.index(e);
    }
    const cands: { to: number; purpose: Purpose; wt: number }[] = [];
    const days = (t: Tie) => (w.t - t.last) / DAY;
    const atWork = c.act === Act.Work;
    const evening = lt.hour >= 18 || lt.hour < 1;
    const recent = (kinds: EventKind[], who: number) => {
      const list = this.recentBy.get(who);
      return !!list && list.some((e) => kinds.includes(e.kind) && w.t - e.t < 1.5 * DAY);
    };
    for (const t of c.ties) {
      const o = w.citizens[t.o];
      if (!o || o.home === c.home) continue;
      const stale = Math.min(3, 0.3 + days(t) / 2);
      if (atWork) {
        if (t.k & K.BUSINESS && o.act === Act.Work) {
          const trade = c.work >= 0 && o.work >= 0 && w.workplaces[c.work].trade.includes(o.work);
          let wt = trade ? 3 : 1;
          if (trade && w.workplaces[c.work].kind === "bakery" && lt.hour < 7) wt = 12; // the baker rings the flour merchant at dawn
          cands.push({ to: t.o, purpose: trade ? "order" : "business", wt });
        }
        if (t.k & K.TENANT && o.debts.some((d) => d.to === c.id && d.rent) && lt.hour < 18) cands.push({ to: t.o, purpose: "demand", wt: 1.5 });
        if (t.k & (K.KIN | K.ROMANCE) && t.s > 0.6) cands.push({ to: t.o, purpose: "chat", wt: 0.25 * (o.act === Act.Asleep ? 0.1 : 1) });
        continue;
      }
      if (t.k & K.ROMANCE) cands.push({ to: t.o, purpose: "romance", wt: (evening ? 4 : 1.2) * t.s * stale });
      if (t.k & K.KIN) cands.push({ to: t.o, purpose: "chat", wt: 1.6 * t.s * stale });
      if (t.k & K.FRIEND) cands.push({ to: t.o, purpose: "chat", wt: 1.3 * t.s * stale * (1.5 - c.company) });
      if (t.k & K.RIVAL && t.r > 0.3) {
        cands.push({ to: t.o, purpose: "quarrel", wt: 0.12 * t.r });
        if (c.traits.warmth > 0.55) cands.push({ to: t.o, purpose: "makeup", wt: 0.1 * c.traits.warmth });
      }
      if (t.k & K.TENANT && o.debts.some((d) => d.to === c.id && d.rent) && lt.hour > 9 && lt.hour < 20) cands.push({ to: t.o, purpose: "demand", wt: 0.8 });
      if (t.k & (K.KIN | K.FRIEND) && recent(["fire", "lostjob", "broken", "bankrupt"], t.o)) cands.push({ to: t.o, purpose: "sympathy", wt: 5 * t.s });
      if (t.k & (K.KIN | K.FRIEND) && recent(["engaged", "wedding", "birth", "rehired"], t.o)) cands.push({ to: t.o, purpose: "congratulate", wt: 4 * t.s });
      if (c.debts.length && c.money < 6 && t.k & (K.KIN | K.FRIEND) && t.s > 0.45 && !c.debts.some((d) => d.to === t.o)) cands.push({ to: t.o, purpose: "askloan", wt: 1.2 * t.s });
      if (c.debts.some((d) => d.to === t.o && !d.rent) && c.money > (c.debts.find((d) => d.to === t.o)?.amount ?? 0) + 12) cands.push({ to: t.o, purpose: "repay", wt: 3 });
      if (c.secrets.some((s) => s.rumour < 0) && t.tr > 0.72 && t.s > 0.7) cands.push({ to: t.o, purpose: "confide", wt: 0.35 });
      if (!c.employed && c.job !== "homemaker" && c.job !== "retired" && c.job !== "student" && lt.hour > 8 && lt.hour < 17 && o.employed && o.act === Act.Work) cands.push({ to: t.o, purpose: "jobhunt", wt: 1.5 });
    }
    if (atWork && c.work >= 0) {
      const wk = w.workplaces[c.work].kind;
      const night = lt.hour >= 22 || lt.hour < 5;
      // Late at the club or the hotel: ring for a cab.
      if (night && (wk === "club" || wk === "hotel" || wk === "dancehall")) {
        const cab = w.citizens.find((x) => x.act === Act.Work && x.work >= 0 && w.workplaces[x.work].kind === "taxi" && x.call < 0);
        if (cab) cands.push({ to: cab.id, purpose: "order", wt: 4 });
      }
      // The night nurse rings the doctor at home.
      if (night && wk === "infirmary" && c.job !== "doctor") {
        const doc = w.citizens.find((x) => x.job === "doctor" && x.act !== Act.Work);
        if (doc) cands.push({ to: doc.id, purpose: "business", wt: 1.2 });
      }
      // By day, the offices and shops ring their customers.
      if (!night && ["insurance", "bank", "store", "law", "drugstore", "grocery", "pawn", "milliner", "florist"].includes(wk)) {
        const cust = w.citizens[(c.id * 31 + lt.dayIndex * 7 + Math.floor(lt.hour * 4)) % w.citizens.length];
        if (cust && cust.act === Act.Home && cust.home !== c.home) cands.push({ to: cust.id, purpose: "business", wt: 1.4 });
      }
      // Reporters ring round for news, day and night.
      if (wk === "paper" && (c.job === "reporter" || c.job === "editor")) {
        const src = w.citizens.filter((x) => x.traits.gossip > 0.6 && x.act !== Act.Asleep && x.act !== Act.Away && x.id !== c.id);
        if (src.length) cands.push({ to: src[(c.id + Math.floor(lt.hour * 6)) % src.length].id, purpose: "news", wt: 2.5 });
      }
    }
    // Nobody rings a sleeping house without good reason.
    for (const x of cands) {
      const o = w.citizens[x.to];
      if (o && o.act === Act.Asleep && !["newyear", "doctor", "fire"].includes(x.purpose)) x.wt *= tieOf(c, o.id)?.k ? (tieOf(c, o.id)!.k & (K.ROMANCE | K.SPOUSE) ? 0.4 : 0.08) : 0.05;
    }
    // Someone with hot news rings round.
    if (!atWork && c.traits.gossip > 0.45) {
      let hot = 0;
      for (const k in c.knows) {
        const r = rumourById(w, Number(k));
        if (r && !r.dead) hot = Math.max(hot, r.heat);
      }
      if (hot > 0.35) {
        for (const t of c.ties) if (t.k & (K.FRIEND | K.KIN | K.NEIGHBOUR) && w.citizens[t.o].home !== c.home) cands.push({ to: t.o, purpose: "news", wt: 0.5 * hot * c.traits.gossip });
      }
    }
    // A wary citizen would rather meet.
    if (c.suspicion > 0.5) for (const x of cands) if (["chat", "news", "confide", "romance"].includes(x.purpose)) x.purpose = this.rng.chance(c.suspicion) ? "guarded" : x.purpose;
    // The very wary ring the Exchange itself.
    if (c.suspicion > 0.72 && c.traits.nerve > 0.45 && w.operatorCall < 0 && !atWork && !c.hist.some((h) => h.e === "rang-exchange" && w.t - h.t < 3 * DAY)) {
      cands.push({ to: -1, purpose: "operator", wt: 2.5 });
    }
    // Now and then, a wrong number.
    if (this.rng.chance(0.012)) {
      const l = this.rng.pick(w.lines.filter((x) => x.kind !== "pay"));
      return { to: -100 - l.id, purpose: "wrong" };
    }
    if (!cands.length) return null;
    const i = this.rng.weighted(cands.map((x) => x.wt));
    return i < 0 ? null : { to: cands[i].to, purpose: cands[i].purpose };
  }

  // -------------------------------------------------------------------------
  // Lines
  // -------------------------------------------------------------------------

  lineFor(c: Citizen, lt: LocalTime = this.lt()): number {
    const w = this.w;
    if (c.act === Act.Home) {
      const h = w.households[c.home];
      if (h.line >= 0) return h.line;
      if (lt.hour < 7 || lt.hour > 22.5) return -1;
      // Down to the call box.
      return w.lines.find((l) => l.kind === "pay" && l.district === h.district)?.id ?? -1;
    }
    if (c.act === Act.Work && c.work >= 0) return w.workplaces[c.work].line;
    if (c.act === Act.Out && c.venue >= 0) return w.venues[c.venue].line;
    return -1;
  }

  reachLine(c: Citizen): number {
    const w = this.w;
    if (c.act === Act.Work && c.work >= 0) return w.workplaces[c.work].line;
    return w.households[c.home].line;
  }

  lineFree(l: number): boolean {
    return l >= 0 && this.w.lineCall[l] < 0 && !this.w.lineDown[l];
  }

  /** People who could answer a line right now. */
  private answerers(l: number): Citizen[] {
    const w = this.w;
    const line = w.lines[l];
    if (line.kind === "home") {
      const h = w.households[line.owner];
      return h.members.map((m) => w.citizens[m]).filter((m) => (m.act === Act.Home || m.act === Act.Asleep) && m.call < 0);
    }
    if (line.kind === "work" || line.kind === "special") {
      const wp = w.workplaces[line.owner];
      const staff = wp.staff.map((m) => w.citizens[m]).filter((m) => m.act === Act.Work && m.work === wp.id && m.call < 0);
      if (wp.kind === "service") {
        const house = w.households.find((h) => h.line === l);
        if (house) return house.members.map((m) => w.citizens[m]).filter((m) => m.act === Act.Home && m.call < 0);
      }
      return staff;
    }
    return [];
  }

  // -------------------------------------------------------------------------
  // Calls
  // -------------------------------------------------------------------------

  placeCall(a: Citizen, to: number, purpose: Purpose): boolean {
    const w = this.w;
    const lt = this.lt();
    const fromLine = this.lineFor(a, lt);
    if (fromLine < 0 || !this.lineFree(fromLine)) {
      if (to >= 0 && purpose !== "habit") a.retry = { to, at: w.t + this.rng.range(5, 25) * MINUTE, purpose };
      return false;
    }
    let toLine = -1;
    if (purpose === "fire") toLine = w.workplaces.find((x) => x.kind === "fire")!.line;
    else if (purpose === "doctor") toLine = w.workplaces.find((x) => x.kind === "infirmary")!.line;
    else if (purpose === "operator") toLine = OPERATOR_LINE;
    else if (purpose === "wrong") toLine = -100 - to;
    else if (to >= 0) toLine = this.reachLine(w.citizens[to]);
    if (toLine === -1 || toLine === fromLine) return false;
    const call: Call = {
      id: w.nextCallId++,
      from: a.id,
      to: purpose === "wrong" ? -1 : to,
      answer: -1,
      fromLine,
      toLine,
      purpose,
      phase: "signal",
      placed: w.t,
      phaseAt: w.t,
      talkAt: 0,
      endAt: 0,
      pair: this.freePair(),
      beats: [],
      beat: 0,
      listened: 0,
      heardBy: false,
      guarded: a.suspicion > 0.45,
    };
    w.calls.push(call);
    w.lineCall[fromLine] = call.id;
    a.call = call.id;
    if (purpose === "operator") {
      w.operatorCall = call.id;
      this.hist(a, "rang-exchange");
    }
    return true;
  }

  private freePair(): number {
    const used = new Set(this.w.calls.map((c) => c.pair));
    for (let i = 0; i < 64; i++) if (!used.has(i)) return i;
    return 0;
  }

  private stepCalls() {
    const w = this.w;
    const now = w.t;
    for (let i = w.calls.length - 1; i >= 0; i--) {
      const call = w.calls[i];
      const since = now - call.phaseAt;
      const A = w.citizens[call.from];
      switch (call.phase) {
        case "signal": {
          const wait = 1500 + (call.id % 7) * 400 + Math.min(4000, w.calls.length * 90);
          if (since < wait) break;
          if (call.toLine === OPERATOR_LINE) {
            this.setPhase(call, "ring");
            break;
          }
          const wrong = call.toLine <= -100;
          const tl = wrong ? -100 - call.toLine : call.toLine;
          if (wrong) call.toLine = tl;
          if (!this.lineFree(tl) || w.lineDown[call.fromLine]) {
            this.setPhase(call, "busy");
            const T = call.to >= 0 ? w.citizens[call.to] : null;
            if (T && call.purpose !== "habit") A.retry = { to: T.id, at: now + this.rng.range(4, 15) * MINUTE, purpose: call.purpose };
            break;
          }
          w.lineCall[tl] = call.id;
          this.setPhase(call, "ring");
          break;
        }
        case "ring": {
          if (call.toLine === OPERATOR_LINE) {
            // Only the visitor can answer the operator's position.
            if (since > 32_000) this.noAnswer(call);
            break;
          }
          const people = this.answerers(call.toLine);
          const T = call.to >= 0 ? w.citizens[call.to] : null;
          const awake = people.filter((p) => p.act !== Act.Asleep);
          const pick = T && awake.includes(T) ? T : awake.length ? awake[call.id % awake.length] : null;
          const sleeper = !pick && people.length ? people.find((p) => p === T) ?? people[0] : null;
          const needed = pick ? 2200 + (call.id % 5) * 900 : sleeper ? 9000 : Infinity;
          if (since >= needed) {
            const who = pick ?? sleeper!;
            if (sleeper && !pick && !this.rng.chance(0.55)) {
              this.noAnswer(call);
              break;
            }
            if (who.act === Act.Asleep) {
              who.act = Act.Home;
              who.actSince = now;
            }
            this.connect(call, who);
          } else if (since > 18_000) this.noAnswer(call);
          break;
        }
        case "talk": {
          const el = now - call.talkAt;
          while (call.beat < call.beats.length && call.beats[call.beat].at <= el) {
            const b = call.beats[call.beat];
            this.speak(call, b);
            call.beat++;
          }
          if (call.heardBy && this.listen === call.id) call.listened += DT;
          if (call.beat >= call.beats.length && el > (call.beats[call.beats.length - 1]?.at ?? 0) + 1500) this.endTalk(call);
          break;
        }
        case "busy":
        case "noanswer":
        case "clear": {
          const hold = call.phase === "clear" ? 2600 : 2400;
          if (since >= hold) this.release(call, i);
          break;
        }
      }
    }
  }

  private setPhase(call: Call, p: Call["phase"]) {
    call.phase = p;
    call.phaseAt = this.w.t;
  }

  private noAnswer(call: Call) {
    const w = this.w;
    this.setPhase(call, "noanswer");
    if (call.toLine === OPERATOR_LINE) {
      this.event("operatorcall", call.from, -1, -1, -1, 0, 3);
      w.operatorCall = -1;
      // Nobody answered, but somebody was there: the talk grows.
      const A = w.citizens[call.from];
      A.suspicion = clamp01(A.suspicion + 0.1);
      const r = this.listenerRumour();
      if (r) r.heat = Math.min(1, r.heat + 0.12);
    }
  }

  /** The visitor answered the caller at position three, and listened to the end. */
  private operatorAnswered(A: Citizen) {
    const w = this.w;
    A.suspicion *= 0.4;
    this.hist(A, "answered");
    const claim: Claim = { tpl: "answered", subj: A.id, other: -1, n: 0, x: 0, place: -1, v: 0 };
    createRumour(w, "answered", claim, A.id, -1, w.t, -1, { truth: true });
    const r = this.listenerRumour();
    if (r) r.heat *= 0.7;
  }

  /** The visitor takes the operator's own call. */
  answerOperator(): boolean {
    const w = this.w;
    const call = w.calls.find((c) => c.id === w.operatorCall && c.phase === "ring");
    if (!call) return false;
    const A = w.citizens[call.from];
    this.listen = call.id;
    call.heardBy = true;
    this.connect(call, null);
    this.event("operatorcall", A.id, -1, -1, -1, 1, 3);
    return true;
  }

  private connect(call: Call, who: Citizen | null) {
    const w = this.w;
    const A = w.citizens[call.from];
    const lt = this.lt();
    call.answer = who ? who.id : -1;
    if (who) who.call = call.id;
    const ctx: TalkCtx = {
      w,
      rng: this.rng,
      t: w.t,
      lt,
      call,
      A,
      B: who,
      T: call.to >= 0 ? w.citizens[call.to] : null,
      purpose: call.purpose,
      guarded: call.guarded,
      south: this.place.south,
    };
    const lines = call.toLine === OPERATOR_LINE ? planTalk({ ...ctx, B: A }) : planTalk(ctx);
    if (ctx.B && who && ctx.B.id !== who.id) {
      // The wanted one came to the telephone.
      who.call = -1;
      call.answer = ctx.B.id;
      ctx.B.call = call.id;
      if (ctx.B.act === Act.Asleep) ctx.B.act = Act.Home;
    }
    call.beats = toBeats(ctx, lines);
    if (call.toLine === OPERATOR_LINE) call.beats = call.beats.slice(1);
    call.talkAt = w.t;
    call.beat = 0;
    this.setPhase(call, "talk");
    // The morning's first call, and the small hours, are worth a note.
    if (lt.hour >= 4.5 && lt.hour < 9 && this.firstCallDay !== lt.dayIndex) {
      this.firstCallDay = lt.dayIndex;
      this.event("firstcall", A.id, call.answer, w.lines[call.fromLine].district, -1, call.id, 1);
    } else if (lt.hour >= 1.5 && lt.hour < 4.5 && this.rng.chance(0.5)) {
      this.event("nightcall", A.id, call.answer, w.lines[call.fromLine].district, -1, call.id, 1);
    }
  }

  /** A line is spoken: its effect happens now; if the visitor is listening, it is heard. */
  private speak(call: Call, b: Beat) {
    const w = this.w;
    if (b.fx && !b.done) this.apply(b.fx, call);
    b.done = true;
    if (this.listen === call.id) {
      this.out.heard.push({ call: call.id, who: b.who, text: b.text, t: w.t, rumour: b.fx?.kind === "tell" ? b.fx.rumour ?? -1 : b.fx?.kind === "confide" ? this.lastConfided : -1 });
      if (b.who !== 2 && call.toLine !== OPERATOR_LINE) this.maybeClick(call);
    }
  }

  private lastConfided = -1;

  /** Listening is not silent. The line clicks, and people notice. */
  private maybeClick(call: Call) {
    const w = this.w;
    const parties = [w.citizens[call.from], call.answer >= 0 ? w.citizens[call.answer] : null].filter(Boolean) as Citizen[];
    const since = call.beats.slice(Math.max(0, call.beat - 4), call.beat + 1).some((b) => b.who === 2 && b.text.includes("click"));
    if (since || call.beat < 3 || call.beat > call.beats.length - 3) return;
    for (const p of parties) {
      const chance = 0.014 + 0.05 * p.suspicion + 0.014 * (1 - p.traits.credulity);
      if (!this.rng.chance(chance)) continue;
      const el = w.t - call.talkAt;
      const other = parties.find((x) => x !== p) ?? p;
      const side: 0 | 1 = p.id === call.from ? 0 : 1;
      const inserted: Beat[] = [
        { at: el + 500, who: 2, text: "A faint click on the line." },
        { at: el + 2300, who: side, text: clickReaction({ rng: this.rng, w }, other) },
        { at: el + 4600, who: (1 - side) as 0 | 1, text: clickAnswer({ rng: this.rng, w }) },
      ];
      const shift = 6400;
      for (let i = call.beat + 1; i < call.beats.length; i++) call.beats[i].at += shift;
      call.beats.splice(call.beat + 1, 0, ...inserted);
      p.clicks++;
      p.suspicion = clamp01(p.suspicion + 0.18 + 0.12 * (1 - p.traits.credulity));
      if (other !== p) other.suspicion = clamp01(other.suspicion + 0.06 + 0.06 * p.traits.nerve);
      this.hist(p, "click", other.id);
      this.suspect(p, call);
      if (p.suspicion > 0.42) this.guard(call);
      return;
    }
  }

  /** Someone who hears the click begins to wonder, and says so. */
  private suspect(p: Citizen, call: Call) {
    const w = this.w;
    if (p.suspicion < 0.25 || p.knows[this.listenerRumour()?.id ?? -1] !== undefined) return;
    let r = this.listenerRumour();
    const claim: Claim = { tpl: "listener", subj: -1, other: -1, n: 0, x: 0, place: -1, v: 0 };
    if (!r) {
      r = createRumour(w, "listener", claim, p.id, -1, w.t, call.id, { truth: true });
      this.event("suspicion", p.id, -1, w.households[p.home].district, r.id, 1, 2);
    } else {
      // Worked out alone: a fresh root in the same rumour's tree.
      const v: Version = { id: r.versions.length, parent: -1, teller: p.id, hearer: p.id, t: w.t, claim, text: claimText(w, claim, 0), call: call.id, hedge: 0 };
      r.versions.push(v);
      if (p.knows[r.id] === undefined) r.knowers++;
      p.knows[r.id] = v.id;
      r.heat = Math.min(1, r.heat + 0.12);
      r.peak = Math.max(r.peak, r.knowers);
      r.lastTold = w.t;
    }
  }

  listenerRumour(): Rumour | null {
    for (let i = this.w.rumours.length - 1; i >= 0; i--) {
      const r = this.w.rumours[i];
      if (r.tpl === "listener" && !r.dead) return r;
    }
    return null;
  }

  /** Wary now: the rest of this call keeps its secrets. */
  private guard(call: Call) {
    if (call.guarded) return;
    call.guarded = true;
    let planned = false;
    for (let i = call.beat + 1; i < call.beats.length; i++) {
      const b = call.beats[i];
      if (!b.fx) continue;
      const risky = b.fx.kind === "confide" || b.fx.kind === "propose" || (b.fx.kind === "tell" && rumourById(this.w, b.fx.rumour ?? -1)?.tpl !== "listener");
      if (!risky) continue;
      b.text = guardedReplacement({ rng: this.rng, w: this.w });
      if (!planned) {
        const a = b.fx.a;
        const other = b.fx.b;
        const venue = this.w.venues.find((v) => v.kind === "automat")?.id ?? 0;
        b.fx = { kind: "plan", a, b: other, venue, at: this.w.t + this.rng.range(1, 20) * HOUR };
        planned = true;
      } else b.fx = undefined;
    }
  }

  private endTalk(call: Call) {
    const w = this.w;
    const A = w.citizens[call.from];
    const B = call.answer >= 0 ? w.citizens[call.answer] : null;
    const dur = w.t - call.talkAt;
    if (B) {
      this.warmTie(A, B, 0.03, call);
      this.warmTie(B, A, 0.025, call);
      A.company = clamp01(A.company + 0.08);
      B.company = clamp01(B.company + 0.06);
      this.hist(A, "call", B.id, Math.round(dur / 1000));
      this.hist(B, "called", A.id, Math.round(dur / 1000));
      if (dur > 4.5 * MINUTE) this.event("longcall", A.id, B.id, w.lines[call.fromLine].district, -1, Math.round(dur / MINUTE), 1);
    }
    if (call.id === w.operatorCall) {
      w.operatorCall = -1;
      this.operatorAnswered(A);
    }
    const slot = Math.floor((w.t + this.place.offsetMinutes * MINUTE) / HOUR) % 48;
    w.hourly[slot]++;
    w.callsTotal++;
    if (call.heardBy) {
      w.listened++;
      w.listenedMs += call.listened;
    }
    this.setPhase(call, "clear");
  }

  warmTie(a: Citizen, b: Citizen, amount: number, call: Call) {
    let t = tieOf(a, b.id);
    if (!t) {
      if (call.purpose === "wrong") return;
      t = blankTie(b.id, 0, 0.12);
      a.ties.push(t);
    }
    t.s = clamp01(t.s + amount * (1 - t.s) * 2);
    t.last = this.w.t;
    t.n++;
    const hour = this.lt().hour;
    if (call.purpose === "habit" || (t.n > 3 && t.k & (K.KIN | K.ROMANCE | K.FRIEND))) {
      if (t.hh < 0) {
        t.hh = hour;
        t.hc = 0.1;
      } else if (Math.abs(t.hh - hour) < 0.75) {
        t.hh = t.hh * 0.85 + hour * 0.15;
        t.hc = clamp01(t.hc + 0.08);
      } else t.hc = clamp01(t.hc - 0.03);
    }
  }

  private release(call: Call, index: number) {
    const w = this.w;
    if (call.fromLine >= 0 && w.lineCall[call.fromLine] === call.id) w.lineCall[call.fromLine] = -1;
    if (call.toLine >= 0 && w.lineCall[call.toLine] === call.id) w.lineCall[call.toLine] = -1;
    const A = w.citizens[call.from];
    if (A.call === call.id) A.call = -1;
    if (call.answer >= 0 && w.citizens[call.answer].call === call.id) w.citizens[call.answer].call = -1;
    if (this.listen === call.id) this.listen = -1;
    if (call.id === w.operatorCall) w.operatorCall = -1;
    w.calls.splice(index, 1);
  }

  /** A storm takes a line down in the middle of a call. */
  cutOff(lineId: number) {
    const w = this.w;
    for (const call of w.calls) {
      if (call.fromLine === lineId || call.toLine === lineId) {
        if (call.phase === "talk" || call.phase === "ring" || call.phase === "signal") {
          if (this.listen === call.id) this.out.heard.push({ call: call.id, who: 2, text: "The line goes dead.", t: w.t, rumour: -1 });
          call.beats.length = call.beat;
          this.setPhase(call, "clear");
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  apply(fx: Effect, call: Call) {
    const w = this.w;
    const a = fx.a >= 0 ? w.citizens[fx.a] : null;
    const b = fx.b >= 0 ? w.citizens[fx.b] : null;
    switch (fx.kind) {
      case "tell": {
        const r = rumourById(w, fx.rumour ?? -1);
        if (r && a && b && a.knows[r.id] !== undefined) this.recordTell(r, a, b, call.id, fx.claim ?? null, fx.n ?? 2);
        break;
      }
      case "confide": {
        if (!a || !b) break;
        const s = a.secrets[fx.n ?? 0];
        if (!s || s.rumour >= 0) break;
        const place = s.tpl === "jobhunt" ? a.work : s.tpl === "debt" ? w.households[a.home].district : -1;
        const claim: Claim = { tpl: s.tpl, subj: a.id, other: s.other, n: s.tpl === "debt" ? Math.max(1, Math.round(a.debts.reduce((x, d) => x + (d.rent ? d.amount / Math.max(1, w.households[a.home].rent) : 0), 0))) : s.n, x: 0, place, v: s.n };
        const r = createRumour(w, s.tpl, claim, a.id, b.id, w.t, call.id, { truth: true, hedge: 0 });
        s.rumour = r.id;
        this.lastConfided = r.id;
        this.hist(a, "confided", b.id);
        break;
      }
      case "loan": {
        if (!a || !b) break;
        const n = fx.n ?? 5;
        if (fx.ok) {
          a.money -= n;
          b.money += n;
          b.debts.push({ to: a.id, amount: n, since: w.t, rent: false });
          this.hist(b, "borrowed", a.id, n);
          this.hist(a, "lent", b.id, n);
          const t = tieOf(a, b.id);
          if (t) t.s = clamp01(t.s + 0.06);
          this.event("loan", a.id, b.id, w.households[b.home].district, -1, n, 0);
          // Pay the rent with it.
          this.payRent(b);
        } else b.mood = Math.max(-1, b.mood - 0.1);
        break;
      }
      case "repay": {
        if (!a || !b) break;
        const d = a.debts.find((x) => x.to === b.id);
        if (!d) break;
        const pay = Math.min(d.amount, Math.max(0, a.money));
        a.money -= pay;
        b.money += pay;
        d.amount -= pay;
        if (d.amount <= 0.5) a.debts.splice(a.debts.indexOf(d), 1);
        this.hist(a, "repaid", b.id, pay);
        break;
      }
      case "plan": {
        if (!a || !b || fx.venue === undefined || fx.at === undefined) break;
        a.plans.push({ with: b.id, at: fx.at, venue: fx.venue, why: "meet" });
        b.plans.push({ with: a.id, at: fx.at, venue: fx.venue, why: "meet" });
        break;
      }
      case "propose": {
        if (!a || !b) break;
        if (fx.ok) this.engage(a, b, call.id);
        else {
          a.mood = Math.max(-1, a.mood - 0.2);
          this.hist(a, "proposed-no", b.id);
        }
        break;
      }
      case "quarrel": {
        if (!a || !b) break;
        const n = fx.n ?? 0.5;
        for (const [x, y] of [
          [a, b],
          [b, a],
        ]) {
          const t = tieOf(x, y.id);
          if (!t) continue;
          t.s = clamp01(t.s - 0.12 * n);
          t.r = clamp01(t.r + 0.15 * n);
          if (t.r > 0.45) t.k |= K.RIVAL;
        }
        a.mood = Math.max(-1, a.mood - 0.1);
        b.mood = Math.max(-1, b.mood - 0.1);
        this.hist(a, "quarrel", b.id);
        this.hist(b, "quarrel", a.id);
        const t = tieOf(a, b.id);
        if (t && t.k & K.ENGAGED && t.s < 0.4) this.breakOff(a, b);
        else if (n > 0.4) this.event("quarrel", a.id, b.id, w.households[a.home].district, -1, 0, 1);
        break;
      }
      case "reconcile": {
        if (!a || !b) break;
        for (const [x, y] of [
          [a, b],
          [b, a],
        ]) {
          const t = tieOf(x, y.id);
          if (!t) continue;
          t.r = 0;
          t.k &= ~K.RIVAL;
          t.s = clamp01(t.s + 0.2);
          t.tr = clamp01(t.tr + 0.2);
        }
        this.event("reconciled", a.id, b.id, w.households[a.home].district, -1, 0, 1);
        this.hist(a, "reconciled", b.id);
        this.hist(b, "reconciled", a.id);
        break;
      }
      case "hire": {
        if (!a || !fx.ok || (fx.n ?? -1) < 0 || a.employed) break;
        this.hire(a, w.workplaces[fx.n!]);
        break;
      }
      case "warm": {
        if (!a || !b) break;
        const t = tieOf(a, b.id);
        if (t) t.s = clamp01(t.s + 0.02 * ((fx.n ?? 0) + 1));
        break;
      }
      case "fire":
        if (w.fire) w.fire.reported = true;
        break;
      case "suspect":
        break;
    }
  }

  recordTell(r: Rumour, teller: Citizen, hearer: Citizen, callId: number, claim: Claim | null, hedge: number) {
    const w = this.w;
    const vi = teller.knows[r.id];
    if (vi === undefined) return;
    r.lastTold = w.t;
    if (hearer.knows[r.id] !== undefined) return;
    // Talk of listening is kept hot only by fresh clicks, not by repetition.
    if (r.tpl !== "listener") r.heat = Math.min(1, r.heat + 0.025 * (1 - r.knowers / w.citizens.length));
    const from = r.versions[vi];
    const cl = claim ?? { ...from.claim };
    const v: Version = { id: r.versions.length, parent: vi, teller: teller.id, hearer: hearer.id, t: w.t, claim: cl, text: claimText(w, cl, hedge), call: callId, hedge };
    r.versions.push(v);
    hearer.knows[r.id] = v.id;
    r.knowers++;
    r.peak = Math.max(r.peak, r.knowers);
    this.react(hearer, r, v);
  }

  /** What a rumour does when it reaches someone for whom it matters. */
  private react(h: Citizen, r: Rumour, v: Version) {
    const w = this.w;
    const lt = this.lt();
    const subj = r.subject >= 0 ? w.citizens[r.subject] : null;
    if (r.tpl === "answered") {
      // Word that the Exchange was kind takes the edge off.
      h.suspicion = clamp01(h.suspicion - 0.12 - 0.04 * v.claim.x);
      return;
    }
    if (r.tpl === "listener") {
      h.suspicion = clamp01(Math.max(h.suspicion, (0.22 + 0.1 * v.claim.x) * (0.5 + h.traits.credulity) * Math.min(1, r.heat * 1.6)));
      return;
    }
    // People who matter.
    const job = h.job ?? "";
    if (["mayor", "editor", "harbourmaster", "reverend", "bankmanager"].includes(job)) {
      const key = `${r.id}:${h.id}`;
      if (!w.reachedLogged.includes(key)) {
        w.reachedLogged.push(key);
        if (w.reachedLogged.length > 200) w.reachedLogged.shift();
        this.event("reached", h.id, r.subject, w.households[h.home].district, r.id, r.versions.length, 2);
      }
    }
    if (!subj) return;
    // Hearing it about yourself: and who told.
    if (h.id === subj.id) {
      const chain: number[] = [];
      let cur: Version | undefined = v;
      while (cur && cur.parent >= 0) {
        chain.push(cur.teller);
        cur = r.versions[cur.parent];
      }
      const confidant = r.origin === subj.id && r.versions[1] ? r.versions[1].hearer : -1;
      if (confidant >= 0) {
        const t = tieOf(subj, confidant);
        if (t) {
          t.tr = clamp01(t.tr - 0.55);
          t.s = clamp01(t.s - 0.25);
        }
        this.hist(subj, "betrayed", confidant, r.id);
      }
      subj.mood = Math.max(-1, subj.mood - 0.3);
      this.event("reached", subj.id, confidant, w.households[subj.home].district, r.id, chain.length, 3);
      return;
    }
    const t = tieOf(h, subj.id);
    if ((r.tpl === "crush" || r.tpl === "seen" || r.tpl === "letters") && t && t.k & (K.ROMANCE | K.SPOUSE | K.ENGAGED) && v.claim.other !== h.id) {
      h.mood = Math.max(-1, h.mood - 0.25);
      t.s = clamp01(t.s - 0.12);
      h.retry = { to: subj.id, at: w.t + this.rng.range(3, 40) * MINUTE, purpose: "confront" };
      return;
    }
    if (r.tpl === "debt" && subj.debts.some((d) => d.to === h.id)) {
      h.retry = { to: subj.id, at: w.t + this.rng.range(20, 180) * MINUTE, purpose: "demand" };
      return;
    }
    if (r.tpl === "surprise" && v.claim.other === h.id) {
      this.event("spoiled", r.subject, h.id, w.households[h.home].district, r.id, 0, 2);
      return;
    }
    if (isNews(r.tpl) && t && t.k & (K.KIN | K.FRIEND) && lt.hour > 8 && lt.hour < 22 && !h.retry && this.rng.chance(0.4)) {
      const glad = ["engaged", "wedding", "birth", "rehired"].includes(r.tpl);
      const sad = ["fire", "lostjob", "bankrupt", "broken"].includes(r.tpl);
      if (glad || sad) h.retry = { to: subj.id, at: w.t + this.rng.range(10, 120) * MINUTE, purpose: glad ? "congratulate" : "sympathy" };
    }
  }

  engage(a: Citizen, b: Citizen, callId: number) {
    const w = this.w;
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      let t = tieOf(x, y.id);
      if (!t) x.ties.push((t = blankTie(y.id, 0, 0.8)));
      t.k |= K.ENGAGED | K.ROMANCE;
      t.s = clamp01(t.s + 0.1);
    }
    a.mood = Math.min(1, a.mood + 0.5);
    b.mood = Math.min(1, b.mood + 0.5);
    this.hist(a, "engaged", b.id);
    this.hist(b, "engaged", a.id);
    const claim: Claim = { tpl: "engaged", subj: a.id, other: b.id, n: 0, x: 0, place: -1, v: 0 };
    const r = createRumour(w, "engaged", claim, a.id, b.id, w.t, callId, { truth: true, hedge: 0 });
    this.event("engaged", a.id, b.id, w.households[a.home].district, r.id, 0, 3);
    // The wedding, on the Saturday after next.
    const lt = this.lt();
    const daysToSat = (6 - lt.dow + 7) % 7 || 7;
    const at = w.t + (daysToSat + 7) * DAY - lt.hour * HOUR + 14 * HOUR;
    w.weddings.push({ a: a.id, b: b.id, at });
  }

  breakOff(a: Citizen, b: Citizen) {
    const w = this.w;
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const t = tieOf(x, y.id);
      if (!t) continue;
      t.k &= ~(K.ENGAGED | K.ROMANCE);
      t.s = clamp01(t.s - 0.2);
    }
    w.weddings = w.weddings.filter((x) => !((x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id)));
    a.mood = Math.max(-1, a.mood - 0.4);
    b.mood = Math.max(-1, b.mood - 0.4);
    this.hist(a, "broken", b.id);
    this.hist(b, "broken", a.id);
    const claim: Claim = { tpl: "broken", subj: a.id, other: b.id, n: 0, x: 0, place: -1, v: 0 };
    const r = createRumour(w, "broken", claim, b.id, -1, w.t, -1, { truth: true });
    this.event("broken", a.id, b.id, w.households[a.home].district, r.id, 0, 3);
  }

  hire(c: Citizen, wp: Workplace) {
    if (!wp.open || c.employed || wp.staff.includes(c.id)) return;
    const w = this.w;
    if (c.work >= 0) {
      const old = w.workplaces[c.work];
      old.staff = old.staff.filter((s) => s !== c.id);
    }
    const role = wp.staff.map((s) => w.citizens[s].job).find((j) => j && OCC[j] && w.citizens[wp.staff[0]].job !== j) ?? w.citizens[wp.staff[wp.staff.length - 1]]?.job ?? "clerk";
    c.job = role;
    c.work = wp.id;
    c.employed = true;
    wp.staff.push(c.id);
    this.hist(c, "hired", -1, wp.id);
    const claim: Claim = { tpl: "rehired", subj: c.id, other: -1, n: 0, x: 0, place: wp.id, v: 0 };
    const r = createRumour(w, "rehired", claim, c.id, -1, w.t, -1, { truth: true });
    this.event("rehired", c.id, -1, wp.district, r.id, wp.id, 1);
    this.ownersDirty();
  }

  payRent(c: Citizen) {
    const rent = c.debts.find((d) => d.rent);
    if (!rent) return;
    const pay = Math.min(rent.amount, Math.max(0, c.money - 1));
    if (pay <= 0) return;
    c.money -= pay;
    this.w.citizens[rent.to].money += pay;
    rent.amount -= pay;
    if (rent.amount < 0.5) c.debts.splice(c.debts.indexOf(rent), 1);
  }

  ownersDirty() {
    windowOwners(this.layout, this.w.households, this.w.workplaces, this.owners);
    this.ownersVersion++;
    this.out.ownersChanged = true;
  }

  // -------------------------------------------------------------------------
  // The absence model's call: the same choices and consequences, no words
  // -------------------------------------------------------------------------

  /** Resolve a call in one go. Returns whether anyone answered. */
  coarseCall(a: Citizen, to: number, purpose: Purpose, lt: LocalTime): boolean {
    const w = this.w;
    const rng = this.rng;
    if (to < 0 || purpose === "wrong" || purpose === "operator" || purpose === "fire" || purpose === "doctor") return false;
    const b = w.citizens[to];
    if (!b || b.act === Act.Away || b.act === Act.Out) return false;
    if (b.act === Act.Asleep && !rng.chance(0.3)) return false;
    const line = this.reachLine(b);
    if (line < 0 || w.lineDown[line] || this.lineFor(a, lt) < 0) return false;
    const fake: Call = { id: -1, from: a.id, to: b.id, answer: b.id, fromLine: -1, toLine: line, purpose, phase: "talk", placed: w.t, phaseAt: w.t, talkAt: w.t, endAt: w.t, pair: 0, beats: [], beat: 0, listened: 0, heardBy: false, guarded: a.suspicion > 0.45 };
    const t = tieOf(a, b.id);
    const guarded = a.suspicion > 0.55 || b.suspicion > 0.62;
    switch (purpose) {
      case "romance": {
        const eng = t ? (t.k & K.ENGAGED) !== 0 : false;
        const free = (c: Citizen) => !c.ties.some((x) => x.k & (K.SPOUSE | K.ENGAGED));
        if (!eng && t && t.s > 0.82 && free(a) && free(b) && lt.hour >= 19 && rng.chance(0.22) && !guarded) {
          const back = tieOf(b, a.id);
          if (rng.chance(Math.min(0.9, (back?.s ?? 0.5) * 0.95 + b.traits.nerve * 0.1))) this.engage(a, b, -1);
        }
        break;
      }
      case "askloan": {
        const amount = Math.max(3, Math.round(a.debts.reduce((s2, d) => s2 + d.amount, 0) || 5));
        const ok = b.money > amount + 10 && rng.chance(0.25 + b.traits.warmth * 0.6 + (t?.s ?? 0) * 0.2);
        this.apply({ kind: "loan", a: b.id, b: a.id, n: amount, ok }, fake);
        break;
      }
      case "repay": {
        const d = a.debts.find((x) => x.to === b.id);
        if (d) this.apply({ kind: "repay", a: a.id, b: b.id, n: d.amount }, fake);
        break;
      }
      case "demand": {
        const d = b.debts.find((x) => x.to === a.id);
        if (d && b.money >= d.amount) this.apply({ kind: "repay", a: b.id, b: a.id, n: d.amount }, fake);
        else this.apply({ kind: "quarrel", a: a.id, b: b.id, n: 0.3 }, fake);
        break;
      }
      case "quarrel":
      case "confront":
        this.apply({ kind: "quarrel", a: a.id, b: b.id, n: purpose === "confront" ? 0.7 : 0.5 }, fake);
        break;
      case "makeup":
        this.apply({ kind: "reconcile", a: a.id, b: b.id }, fake);
        break;
      case "jobhunt": {
        const wp = b.work >= 0 ? w.workplaces[b.work] : null;
        if (wp && wp.open && !a.employed && wp.staff.length < wp.capacity && rng.chance(0.45)) this.hire(a, wp);
        break;
      }
      case "confide": {
        const i = a.secrets.findIndex((x) => x.rumour < 0);
        if (i >= 0 && !guarded) this.apply({ kind: "confide", a: a.id, b: b.id, n: i }, fake);
        break;
      }
      case "guarded": {
        const venue = w.venues.find((v) => v.kind === "automat")?.id ?? 0;
        this.meet(a, b, venue);
        break;
      }
    }
    // The talk turns to other people.
    const passOn = (x: Citizen, y: Citizen, p: number) => {
      if (!rng.chance(p)) return;
      const r = choosePassable(rng, w, x, y, guarded);
      if (!r) return;
      const vi = x.knows[r.id];
      const claim = mutate(rng, w, x, r.versions[vi].claim, r.tpl);
      this.recordTell(r, x, y, -2, claim, Math.max(0, r.versions[vi].hedge - (rng.chance(0.45) ? 1 : 0)));
    };
    if (!["order", "business", "demand"].includes(purpose)) {
      passOn(a, b, 0.2 + 0.45 * a.traits.gossip);
      passOn(b, a, 0.1 + 0.3 * b.traits.gossip);
    }
    this.warmTie(a, b, 0.03, fake);
    this.warmTie(b, a, 0.025, fake);
    a.company = clamp01(a.company + 0.08);
    b.company = clamp01(b.company + 0.06);
    this.hist(a, "call", b.id, 60);
    this.hist(b, "called", a.id, 60);
    const hourIdx = Math.floor((w.t + this.place.offsetMinutes * MINUTE) / HOUR);
    const slot = hourIdx % 48;
    if (w.hourlyAt[slot] !== hourIdx) {
      w.hourlyAt[slot] = hourIdx;
      w.hourly[slot] = 0;
    }
    w.hourly[slot]++;
    w.callsTotal++;
    return true;
  }

  /** The chance per minute that a citizen picks up the telephone. */
  callRate(c: Citizen, lt: LocalTime): number {
    const atWork = c.act === Act.Work;
    let rate = 0.05 * hourCurve(lt.hour, atWork) * dayFactor(lt.dow, atWork) * (0.35 + c.traits.soc * 1.3);
    rate *= 1 + 1.4 * (1 - c.company);
    if (c.debts.length) rate *= 1.2;
    if (c.suspicion > 0.3) rate *= 1 - 0.45 * c.suspicion;
    if (c.act === Act.Out) rate *= 0.18;
    if (this.w.storm && this.w.storm.start <= this.w.t && this.w.storm.end > this.w.t) rate *= 1.3;
    return rate;
  }

  // -------------------------------------------------------------------------
  // The visitor
  // -------------------------------------------------------------------------


  setListen(callId: number | null): boolean {
    const w = this.w;
    if (callId === null) {
      this.listen = -1;
      return true;
    }
    const call = w.calls.find((c) => c.id === callId);
    if (!call || (call.phase !== "talk" && call.phase !== "ring" && call.phase !== "signal")) return false;
    this.listen = call.id;
    call.heardBy = true;
    const partway = call.phase === "talk" && call.beat > 2;
    this.out.heard.push({ call: call.id, who: 2, text: partway ? "You come in partway through." : "You are on the line.", t: w.t, rumour: -1 });
    if (partway) {
      // The last thing said is still in the air.
      const said = call.beats.slice(0, call.beat).filter((b) => b.who !== 2).slice(-1);
      for (const b of said) this.out.heard.push({ call: call.id, who: b.who, text: b.text, t: w.t, rumour: -1 });
    }
    // The listening cord itself makes a sound.
    const listener = this.listenerRumour();
    if (listener) listener.heat = Math.min(1, listener.heat + 0.05);
    return true;
  }

  /** Arrive mid-conversation: run the few minutes before `now`, quietly. */
  warm(now: number, minutes = 5) {
    const w = this.w;
    const wasLive = this.live;
    this.live = false;
    w.t = now - minutes * MINUTE;
    for (const c of w.citizens) c.nextTry = Math.min(c.nextTry, w.t + this.rng.range(0, minutes * 0.8) * MINUTE);
    while (w.t + DT <= now) this.step();
    w.t = now;
    this.out = { events: [], log: [], heard: [], paper: null, ownersChanged: false };
    this.live = wasLive;
  }

  markTraced(id: number) {
    this.traced.add(id);
  }

  // -------------------------------------------------------------------------
  // A founding city's first rumours
  // -------------------------------------------------------------------------

  private seedRumours() {
    const w = this.w;
    const rng = this.rng;
    // A handful of secrets have already been confided and are on the move.
    const tellers = w.citizens.filter((c) => c.secrets.length && c.ties.some((t) => t.tr > 0.6));
    rng.shuffle(tellers);
    for (const c of tellers.slice(0, 9)) {
      const s = c.secrets[0];
      const confidant = c.ties.filter((t) => t.tr > 0.6).sort((a, b) => b.tr - a.tr)[0];
      if (!confidant) continue;
      const claim: Claim = { tpl: s.tpl, subj: c.id, other: s.other, n: s.tpl === "debt" ? 2 : s.n, x: 0, place: s.tpl === "jobhunt" ? c.work : w.households[c.home].district, v: s.n };
      const born = w.t - rng.range(8, 30) * HOUR;
      const r = createRumour(w, s.tpl, claim, c.id, confidant.o, born, -1, { truth: true, hedge: 0 });
      let when = born;
      s.rumour = r.id;
      // It has already gone a step or two further.
      let holder = w.citizens[confidant.o];
      for (let hop = 0; hop < rng.int(0, 3); hop++) {
        const next = holder.ties.filter((t) => t.k & (K.FRIEND | K.KIN | K.NEIGHBOUR | K.COLLEAGUE) && t.o !== c.id && w.citizens[t.o].knows[r.id] === undefined);
        if (!next.length) break;
        const h = w.citizens[rng.pick(next).o];
        this.recordTell(r, holder, h, -1, null, 2);
        const last = r.versions[r.versions.length - 1];
        when = Math.min(w.t - HOUR, when + rng.range(1, 6) * HOUR);
        last.t = when;
        holder = h;
      }
      r.heat = rng.range(0.35, 0.8);
    }
  }
}

export type { Beat, Call, Citizen, Rumour };
