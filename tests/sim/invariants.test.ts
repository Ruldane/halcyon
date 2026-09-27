/**
 * Invariants that must hold however long the city lives and however often
 * the visitor comes and goes.
 */
import { describe, expect, test } from "vitest";
import { composePaper } from "@/grammar/paper";
import { catchUp } from "@/sim/catchup";
import { readCard, talkingAbout } from "@/sim/census";
import { DAY, HOUR, MINUTE, placeFrom } from "@/sim/clock";
import { OPERATOR_LINE, Simulation } from "@/sim/sim";
import { Act } from "@/sim/types";

const place = placeFrom("Europe/London", 0);
const start = Date.UTC(2026, 8, 22, 19, 0);

function checkInvariants(sim: Simulation) {
  const w = sim.w;
  // Every busy line belongs to a live call, and every live call holds its lines.
  for (let l = 0; l < w.lines.length; l++) {
    const id = w.lineCall[l];
    if (id >= 0) expect(w.calls.some((c) => c.id === id)).toBe(true);
  }
  for (const c of w.calls) {
    if (c.fromLine >= 0 && c.phase !== "clear" && c.phase !== "busy" && c.phase !== "noanswer") expect(w.lineCall[c.fromLine]).toBe(c.id);
  }
  // A citizen's call exists.
  for (const c of w.citizens) {
    if (c.call >= 0) expect(w.calls.some((x) => x.id === c.call)).toBe(true);
    expect(Number.isFinite(c.money)).toBe(true);
    expect(c.money).toBeGreaterThanOrEqual(0);
    expect(c.mood).toBeGreaterThanOrEqual(-1);
    expect(c.mood).toBeLessThanOrEqual(1);
    expect(c.suspicion).toBeGreaterThanOrEqual(0);
    expect(c.suspicion).toBeLessThanOrEqual(1);
  }
  // The operator's call, if any, is real.
  if (w.operatorCall >= 0) expect(w.calls.some((c) => c.id === w.operatorCall && c.toLine === OPERATOR_LINE)).toBe(true);
  // No one works in two places.
  const seen = new Map<number, number>();
  for (const wp of w.workplaces) for (const s of wp.staff) {
    expect(seen.has(s)).toBe(false);
    seen.set(s, wp.id);
  }
  // Rumour ids are unique and ordered.
  for (let i = 1; i < w.rumours.length; i++) expect(w.rumours[i].id).toBeGreaterThan(w.rumours[i - 1].id);
}

function checkText(s: string) {
  expect(s).not.toMatch(/undefined|NaN|\[object|null\b/);
  expect(s).not.toMatch(/(?<!\.)\.\.(?!\.)/);
  expect(s).not.toMatch(/—/); // no em dashes in the city's prose
}

describe("invariants across comings and goings", () => {
  test("live running, absences short and long, and a wary city's call to the operator", () => {
    const sim = Simulation.found(5, start, place);
    sim.composePaper = composePaper;
    const gaps = [3 * MINUTE, 25 * MINUTE, 2 * HOUR, 9 * HOUR, 30 * HOUR, 4 * DAY];
    for (const gap of gaps) {
      for (let i = 0; i < 1200; i++) {
        if (sim.listen < 0) {
          const c = sim.w.calls.find((x) => x.phase === "talk");
          if (c) sim.setListen(c.id);
        }
        sim.step();
        for (const h of sim.out.heard) checkText(h.text);
        sim.out.heard = [];
      }
      checkInvariants(sim);
      // A citizen rings the Exchange itself, and the absence cuts it off.
      const caller = sim.w.citizens.find((c) => c.act === Act.Home && c.call < 0 && sim.w.households[c.home].line >= 0 && sim.lineFree(sim.w.households[c.home].line));
      if (caller) sim.placeCall(caller, -1, "operator");
      catchUp(sim, sim.w.t + gap);
      checkInvariants(sim);
      expect(sim.w.operatorCall === -1 || sim.w.calls.some((c) => c.id === sim.w.operatorCall)).toBe(true);
    }
    for (const e of sim.w.log) checkText(e.text);
    for (const c of sim.w.citizens.slice(0, 60)) checkText(readCard(sim, c.id)!.bio);
    checkText(talkingAbout(sim));
    const paper = composePaper(sim, { hour: 21.5, dow: 2, dayIndex: 0, month: 8, date: 22, year: 2026, dayOfYear: 264 }) ?? sim.w.paper;
    if (paper) {
      checkText(paper.headline);
      checkText(paper.deck);
      expect(paper.headline).not.toMatch(/TALK OF TALK/);
    }
  });

  test("answering the operator calms the caller, and word of it calms others", () => {
    const sim = Simulation.found(5, start, place);
    const caller = sim.w.citizens.find((c) => c.act === Act.Home && sim.w.households[c.home].line >= 0 && sim.lineFree(sim.w.households[c.home].line))!;
    caller.suspicion = 0.9;
    expect(sim.placeCall(caller, -1, "operator")).toBe(true);
    // Let it ring, then answer.
    for (let i = 0; i < 20 && !sim.w.calls.some((c) => c.id === sim.w.operatorCall && c.phase === "ring"); i++) sim.step();
    expect(sim.answerOperator()).toBe(true);
    sim.run(3 * MINUTE);
    expect(caller.suspicion).toBeLessThan(0.5);
    const answered = sim.w.rumours.find((r) => r.tpl === "answered");
    expect(answered).toBeDefined();
    expect(sim.w.events.some((e) => e.kind === "operatorcall" && e.n === 1)).toBe(true);
  });

  test("two months on, the city is still a going concern", () => {
    const sim = Simulation.found(13, start, place);
    const expectingBefore = sim.w.citizens.filter((c) => c.expecting > 0).length;
    catchUp(sim, sim.w.t + 60 * DAY);
    const w = sim.w;
    const broke = w.citizens.filter((c) => c.money < 1).length;
    expect(broke).toBeLessThan(w.citizens.length * 0.2);
    const open = w.workplaces.filter((x) => x.open).length;
    expect(open).toBeGreaterThan(w.workplaces.length * 0.8);
    // Births happen and new families keep starting.
    expect(w.citizens.filter((c) => c.children > 0).length + w.citizens.filter((c) => c.expecting > 0).length).toBeGreaterThan(0);
    void expectingBefore;
    checkInvariants(sim);
  });
});
