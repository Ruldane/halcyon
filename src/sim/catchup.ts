/**
 * While you were away. A coarse, bounded model advances the city by the real
 * time since the last visit, using the live rules at a coarser grain: people
 * go where their schedules take them, place about as many calls as they
 * would have, pass on what they know, fall in and out with one another; the
 * almanac's storms and fires come on their proper days; weddings, births,
 * paydays and rent fall due. Then the supervisor writes up the absence.
 *
 * Bounded: fifteen-minute steps for the first two days, two-hour steps after,
 * and no more than thirty days in all.
 */
import { absenceEntry, type AbsenceReport } from "../grammar/log";
import { DAY, HOUR, MINUTE, local } from "./clock";
import { cityDaily, fireStep, stormStep, weddingsStep } from "./events";
import { decayRumours, pruneRumours } from "./rumours";
import { want } from "./schedule";
import type { Simulation } from "./sim";
import { Act } from "./types";

export const FINE_LIMIT = 20 * MINUTE;
export const MAX_ABSENCE = 30 * DAY;

export function catchUp(sim: Simulation, to: number): { report: AbsenceReport; text: string } | null {
  const w = sim.w;
  const from = w.t;
  if (to - from <= FINE_LIMIT) {
    // Short enough to live through properly.
    const wasLive = sim.live;
    sim.live = false;
    while (w.t + 500 <= to) sim.step();
    sim.live = wasLive;
    return null;
  }
  const capped = to - from > MAX_ABSENCE;
  const start = capped ? to - MAX_ABSENCE : from;
  const eventsBefore = w.nextEventId;
  const knowers = new Map(w.rumours.map((r) => [r.id, r.knowers]));
  const suspicionBefore = avgSuspicion(sim);
  const habitual = new Map<string, number>();
  for (const c of w.citizens) for (const t of c.ties) if (t.hh >= 0 && t.hc >= 0.45 && t.tr >= 0.3) habitual.set(`${c.id}:${t.o}`, t.miss);

  sim.live = false;
  // Calls in progress are simply finished.
  for (const call of w.calls) {
    if (call.fromLine >= 0) w.lineCall[call.fromLine] = -1;
    if (call.toLine >= 0) w.lineCall[call.toLine] = -1;
    w.citizens[call.from].call = -1;
    if (call.answer >= 0) w.citizens[call.answer].call = -1;
  }
  w.calls = [];
  w.operatorCall = -1;
  sim.listen = -1;
  let calls = 0;
  w.t = start;
  // The last few minutes are lived properly, so the board is busy on return.
  const coarseTo = to - 5 * MINUTE;
  while (w.t < coarseTo) {
    const step = w.t - start < 2 * DAY ? 15 * MINUTE : 2 * HOUR;
    const span = Math.min(step, coarseTo - w.t);
    w.t += span;
    const lt = local(w.t, sim.place);
    for (const c of w.citizens) {
      const wn = want(w, c, lt);
      c.act = wn.act;
      c.venue = wn.venue;
      c.call = -1;
    }
    cityDaily(sim, lt);
    stormStep(sim, lt);
    fireStep(sim, lt);
    weddingsStep(sim, lt);
    // Service calls placed by events are resolved at once.
    for (const call of w.calls) {
      if (call.fromLine >= 0) w.lineCall[call.fromLine] = -1;
      if (call.toLine >= 0) w.lineCall[call.toLine] = -1;
      w.citizens[call.from].call = -1;
      if (call.purpose === "fire" && w.fire) w.fire.reported = true;
    }
    w.calls = [];
    w.operatorCall = -1;
    // Calls: as many as the hour would bring, each resolved by the live rules.
    const minutes = span / MINUTE;
    const rng = sim.rng;
    for (const c of w.citizens) {
      if (c.act === Act.Asleep || c.act === Act.Away) continue;
      const n = Math.min(4, rng.poisson(sim.callRate(c, lt) * minutes * 0.45));
      for (let k = 0; k < n; k++) {
        const choice = sim.chooseTarget(c, lt);
        if (!choice) continue;
        if (sim.coarseCall(c, choice.to, choice.purpose, lt)) calls++;
      }
      if (c.retry && c.retry.at <= w.t) {
        if (sim.coarseCall(c, c.retry.to, c.retry.purpose, lt)) calls++;
        c.retry = null;
      }
      // Plans to meet come off.
      for (const p of [...c.plans]) {
        if (p.at > w.t) continue;
        const o = w.citizens[p.with];
        if (o) sim.meet(c, o, p.venue);
        c.plans = c.plans.filter((x) => x !== p);
      }
      sim.habits(c, lt);
      // Needs, coarsely.
      if (c.act === Act.Out) c.company = Math.min(1, c.company + 0.1 * (span / HOUR));
      else if (c.act === Act.Home) c.company = Math.max(0, c.company - 0.015 * (span / HOUR));
      c.suspicion *= Math.pow(0.5, span / (1.5 * DAY));
      c.mood = Math.max(-1, Math.min(1, c.mood));
      if (c.suspicion < 0.01) c.suspicion = 0;
    }
    decayRumours(w, w.t, span);
  }
  pruneRumours(w, sim.tracedIds, w.t);
  {
    const lt = local(w.t, sim.place);
    for (const c of w.citizens) {
      const wn = want(w, c, lt);
      c.act = wn.act;
      c.venue = wn.venue;
    }
  }
  sim.warm(to);
  sim.live = true;
  const events = w.events.filter((e) => e.id >= eventsBefore);
  const spread = w.rumours.filter((r) => knowers.has(r.id) || r.born >= start).map((r) => ({ rumour: r.id, before: knowers.get(r.id) ?? 0, after: r.knowers }));
  const habitsBroken: { a: number; b: number }[] = [];
  for (const c of w.citizens) {
    for (const t of c.ties) {
      const before = habitual.get(`${c.id}:${t.o}`);
      if (before !== undefined && (t.miss >= 2 && t.miss > before || t.tr < 0.3)) habitsBroken.push({ a: c.id, b: t.o });
    }
  }
  const report: AbsenceReport = { from, to, calls, events, spread, suspicionBefore, suspicionAfter: avgSuspicion(sim), habitsBroken, capped };
  const text = absenceEntry(w, sim.place, report);
  sim.addLog({ t: to, text, kind: "absence", w: 3, refs: [], rumour: -1 });
  return { report, text };
}

function avgSuspicion(sim: Simulation): number {
  const cs = sim.w.citizens;
  return cs.reduce((a, c) => a + c.suspicion, 0) / Math.max(1, cs.length);
}
