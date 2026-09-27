/**
 * Headless, seeded tests of the city's rules. Everything here runs the same
 * Simulation the worker runs, in Node, as fast as it will go.
 */
import { describe, expect, test } from "vitest";
import { biography } from "@/grammar/bio";
import { composePaper } from "@/grammar/paper";
import { catchUp } from "@/sim/catchup";
import { readCard, readTrace } from "@/sim/census";
import { tieOf } from "@/sim/city";
import { DAY, HOUR, MINUTE, local, placeFrom } from "@/sim/clock";
import { districtDown } from "@/sim/events";
import { restore, snapshot, toJSON, fromJSON } from "@/sim/persist";
import { Simulation } from "@/sim/sim";
import { Act, K } from "@/sim/types";

const place = placeFrom("Europe/London", 0);
/** A Tuesday in late September, at the given UTC hour. */
const tuesday = (h: number) => Date.UTC(2026, 8, 22, h, 0);
const sunday = (h: number) => Date.UTC(2026, 8, 27, h, 0);

function make(t: number, seed = 7) {
  const sim = Simulation.found(seed, t, place);
  sim.composePaper = composePaper;
  return sim;
}

/** Calls completed in the next span of city time. */
function callsIn(sim: Simulation, ms: number) {
  const before = sim.w.callsTotal;
  sim.run(ms);
  return sim.w.callsTotal - before;
}

describe("founding", () => {
  test("a few hundred citizens, each housed, named and on the directory; every window has an owner", () => {
    const sim = make(tuesday(20));
    const w = sim.w;
    expect(w.citizens.length).toBeGreaterThanOrEqual(200);
    expect(w.citizens.length).toBeLessThanOrEqual(600);
    for (const c of w.citizens) {
      expect(c.first.length).toBeGreaterThan(1);
      expect(w.households[c.home].members).toContain(c.id);
      expect(c.job).toBeTruthy();
      expect(c.ties.length).toBeGreaterThan(0);
    }
    const unowned = Array.from(sim.owners).filter((o) => o < 0).length;
    expect(unowned).toBe(0);
    expect(sim.layout.windows.length).toBeGreaterThan(800);
    expect(w.lines.length).toBeGreaterThan(100);
    // The milliner of Juniper Row is who the brief says she is.
    const velda = w.citizens.find((c) => c.first === "Velda" && c.last === "Orr")!;
    expect(w.households[velda.home].street).toBe("Juniper Row");
    expect(w.households[velda.home].number).toBe(14);
  });

  test("the same seed founds the same city, and lives the same evening", () => {
    const a = make(tuesday(19), 11);
    const b = make(tuesday(19), 11);
    a.run(20 * MINUTE);
    b.run(20 * MINUTE);
    expect(a.w.callsTotal).toBe(b.w.callsTotal);
    expect(a.w.rng).toEqual(b.w.rng);
    expect(JSON.stringify(a.w.rumours)).toBe(JSON.stringify(b.w.rumours));
  });
});

describe("the telephone follows the hour and the day", () => {
  test("the evening is far busier than the small hours", () => {
    const night = callsIn(make(tuesday(2)), HOUR);
    const evening = callsIn(make(tuesday(19)), HOUR);
    expect(evening).toBeGreaterThan(night * 3);
    expect(night).toBeGreaterThan(0);
  });

  test("a weekday morning is busier than a Sunday morning, and busy with business", () => {
    const weekday = make(tuesday(9));
    const n1 = callsIn(weekday, HOUR);
    const sun = make(sunday(9));
    const n2 = callsIn(sun, HOUR);
    expect(n1).toBeGreaterThan(n2 * 1.3);
    const business = weekday.w.citizens.flatMap((c) => c.hist).filter((h) => h.e === "call").length;
    expect(business).toBeGreaterThan(0);
    // On a weekday morning a good part of the city is at work.
    expect(weekday.w.citizens.filter((c) => c.act === Act.Work).length).toBeGreaterThan(60);
    expect(sun.w.citizens.filter((c) => c.act === Act.Work).length).toBeLessThan(weekday.w.citizens.filter((c) => c.act === Act.Work).length / 2);
  });
});

describe("relationships", () => {
  test("calls strengthen a tie", () => {
    const sim = make(tuesday(19));
    const w = sim.w;
    const a = w.citizens.find((c) => c.ties.some((t) => t.k & K.FRIEND && t.s < 0.6 && w.citizens[t.o].home !== c.home))!;
    const t = a.ties.find((x) => x.k & K.FRIEND && x.s < 0.6 && w.citizens[x.o].home !== a.home)!;
    const b = w.citizens[t.o];
    b.act = Act.Home;
    a.act = Act.Home;
    const before = t.s;
    let answered = 0;
    for (let i = 0; i < 8; i++) if (sim.coarseCall(a, b.id, "chat", local(w.t, place))) answered++;
    expect(answered).toBeGreaterThan(0);
    expect(tieOf(a, b.id)!.s).toBeGreaterThan(before);
    expect(tieOf(a, b.id)!.n).toBeGreaterThan(0);
  });

  test("neglect weakens a tie", () => {
    const sim = make(tuesday(12));
    const w = sim.w;
    const a = w.citizens.find((c) => c.ties.some((t) => t.k & K.FRIEND && !(t.k & K.KIN) && t.s > 0.5))!;
    const t = a.ties.find((x) => x.k & K.FRIEND && !(x.k & K.KIN) && x.s > 0.5)!;
    const b = w.citizens[t.o];
    const before = t.s;
    // They stop ringing each other.
    a.traits.soc = 0;
    b.traits.soc = 0;
    t.last = w.t - 5 * DAY;
    t.hh = -1;
    const back = tieOf(b, a.id)!;
    back.last = w.t - 5 * DAY;
    back.hh = -1;
    const start = w.t;
    catchUp(sim, w.t + 8 * DAY);
    const after = tieOf(a, b.id)!;
    // Unless the city brought them together anyway, eight days apart cost them.
    if (after.last < start) expect(after.s).toBeLessThan(before - 0.05);
    else expect(after.n).toBeGreaterThan(0);
  });
});

describe("rumours", () => {
  test("travel along real calls, from one party to the other, and change in the telling", () => {
    const sim = make(tuesday(18));
    const seen = new Map<number, [number, number]>();
    for (let i = 0; i < 6 * 3600 * 2; i++) {
      sim.step();
      for (const c of sim.w.calls) if (c.answer >= 0) seen.set(c.id, [c.from, c.answer]);
    }
    let checked = 0;
    let mutated = 0;
    for (const r of sim.w.rumours) {
      for (const v of r.versions) {
        if (v.parent < 0 || v.call < 0) continue;
        const call = seen.get(v.call);
        if (!call) continue;
        checked++;
        expect([...call].sort()).toEqual([v.teller, v.hearer].sort());
        const parent = r.versions[v.parent];
        // The teller had heard it (or started it) before telling it.
        expect(parent.hearer === v.teller || parent.teller === v.teller || r.versions.some((x) => x.hearer === v.teller && x.t <= v.t)).toBe(true);
        if (v.text.replace(/^(They say|I heard|Don't repeat this, but|It's all over the street that) /i, "").toLowerCase() !== parent.text.replace(/^(They say|I heard|Don't repeat this, but|It's all over the street that) /i, "").toLowerCase()) mutated++;
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(mutated).toBeGreaterThan(0);
    // And the trace reads the same path.
    const r = sim.w.rumours.filter((x) => x.versions.length > 3).sort((a, b) => b.versions.length - a.versions.length)[0];
    const trace = readTrace(sim, r.id)!;
    expect(trace.hops.length).toBe(r.versions.length);
    expect(trace.hops.slice(1).every((h) => h.hearerName.length > 0)).toBe(true);
  });

  test("an old rumour cools and is forgotten", () => {
    const sim = make(tuesday(18));
    const r = sim.w.rumours[0];
    expect(r.dead).toBe(false);
    catchUp(sim, sim.w.t + 12 * DAY);
    const still = sim.w.rumours.find((x) => x.id === r.id);
    expect(!still || still.dead).toBe(true);
  });
});

describe("the city finds out", () => {
  test("suspicion rises with listening, spreads as a rumour, and dies away without it", () => {
    const sim = make(tuesday(19));
    const w = sim.w;
    for (let i = 0; i < 2 * 3600 * 2; i++) {
      if (sim.listen < 0) {
        const c = w.calls.find((x) => x.phase === "ring");
        if (c) sim.setListen(c.id);
      }
      sim.step();
      sim.out.heard = [];
    }
    const clicks = w.citizens.reduce((a, c) => a + c.clicks, 0);
    const wary = w.citizens.filter((c) => c.suspicion > 0.3).length;
    const listener = sim.listenerRumour();
    expect(clicks).toBeGreaterThan(3);
    expect(wary).toBeGreaterThan(0);
    expect(listener).not.toBeNull();
    expect(listener!.knowers).toBeGreaterThan(1);
    // Listened calls grow guarded; wary people arrange to meet instead.
    const mean = w.citizens.reduce((a, c) => a + c.suspicion, 0) / w.citizens.length;
    catchUp(sim, w.t + 6 * DAY);
    const after = w.citizens.reduce((a, c) => a + c.suspicion, 0) / w.citizens.length;
    expect(after).toBeLessThan(mean * 0.55);
    catchUp(sim, w.t + 6 * DAY);
    const later = w.citizens.reduce((a, c) => a + c.suspicion, 0) / w.citizens.length;
    expect(later).toBeLessThan(mean * 0.1);
    const again = w.rumours.find((r) => r.id === listener!.id);
    expect(!again || again.dead).toBe(true);
  });
});

describe("storms", () => {
  test("a storm takes lines down district by district, and the crews restore them", () => {
    const sim = make(tuesday(17));
    const w = sim.w;
    const lt = local(w.t, place);
    w.storm = { day: lt.dayIndex, start: w.t, end: w.t + 3 * HOUR, severity: 1, fall: [w.t + MINUTE, w.t + 20 * MINUTE, w.t + 40 * MINUTE, w.t + 50 * MINUTE, w.t + 2 * MINUTE], up: [0, 0, 0, 0, 0], crews: [-1, -1], crewDone: [0, 0] };
    sim.run(70 * MINUTE);
    const down = [0, 1, 2, 3, 4].filter((d) => districtDown(sim, d));
    expect(down.length).toBeGreaterThanOrEqual(3);
    expect(w.lineDown.filter(Boolean).length).toBeGreaterThan(40);
    // Calls cannot be made on a dead line.
    expect(w.calls.every((c) => c.phase !== "talk" || !w.lineDown[c.fromLine])).toBe(true);
    catchUp(sim, w.t + 14 * HOUR);
    expect(w.lineDown.every((d) => !d)).toBe(true);
    expect(w.events.some((e) => e.kind === "linesup")).toBe(true);
    expect(w.storm).toBeNull();
  });
});

describe("absence", () => {
  test("catch-up is bounded, plausible, and written up", () => {
    const sim = make(tuesday(20));
    const t0 = performance.now();
    const r = catchUp(sim, sim.w.t + 90 * DAY)!;
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(15_000);
    expect(r.report.capped).toBe(true);
    expect(r.report.calls).toBeGreaterThan(20_000);
    expect(r.report.calls).toBeLessThan(2_000_000);
    expect(r.text).toMatch(/While you were off shift/);
    expect(sim.w.log[sim.w.log.length - 1].kind).toBe("absence");
    // The city is still living afterwards: people are where the hour puts them.
    expect(sim.w.citizens.some((c) => c.act === Act.Asleep) || sim.w.citizens.some((c) => c.act === Act.Home)).toBe(true);
  });

  test("a day away moves the city on: news spreads, and the biography knows it", () => {
    const sim = make(tuesday(20));
    const before = sim.w.rumours.reduce((a, r) => a + r.knowers, 0);
    const r = catchUp(sim, sim.w.t + 26 * HOUR)!;
    expect(r.report.calls).toBeGreaterThan(500);
    const after = sim.w.rumours.reduce((a, r) => a + r.knowers, 0);
    expect(after).not.toBe(before);
    const velda = sim.w.citizens.find((c) => c.first === "Velda" && c.last === "Orr")!;
    expect(biography(sim.w, velda, place)).toMatch(/^Velda Orr, milliner, 14 Juniper Row\./);
    const card = readCard(sim, velda.id)!;
    expect(card.name).toBe("Velda Orr");
    expect(card.bio.length).toBeGreaterThan(10);
  });
});

describe("persistence", () => {
  test("a snapshot round-trips through the schema and lives on identically", () => {
    const sim = make(tuesday(19));
    sim.run(15 * MINUTE);
    const json = toJSON(snapshot(sim, sim.w.t));
    const back = restore(fromJSON(json), place);
    expect("sim" in back).toBe(true);
    if (!("sim" in back)) return;
    const copy = back.sim;
    expect(JSON.stringify(copy.w)).toBe(JSON.stringify(sim.w));
    expect(Array.from(copy.owners)).toEqual(Array.from(sim.owners));
    sim.run(10 * MINUTE);
    copy.run(10 * MINUTE);
    expect(copy.w.callsTotal).toBe(sim.w.callsTotal);
    expect(copy.w.rng).toEqual(sim.w.rng);
  });

  test("an unknown schema is refused rather than half-read", () => {
    const sim = make(tuesday(19));
    const snap = { ...snapshot(sim, sim.w.t), schema: 1 };
    expect(restore(snap, place)).toEqual({ reset: "schema" });
    expect(restore({ schema: 6, world: { citizens: [] } }, place)).toEqual({ reset: "corrupt" });
    expect(restore(null, place)).toEqual({ reset: "corrupt" });
  });
});

describe("the calendar", () => {
  test("New Year's Eve: a flood of calls at midnight", () => {
    const sim = make(Date.UTC(2026, 11, 31, 23, 50));
    const before = callsIn(sim, 9 * MINUTE);
    const after = callsIn(sim, 12 * MINUTE);
    expect(sim.w.events.some((e) => e.kind === "newyear")).toBe(true);
    expect(after).toBeGreaterThan(before * 2);
    // The Star stops the presses.
    expect(sim.w.paper?.headline).toMatch(/NINETEEN THIRTY/);
  });

  test("the almanac is the same for the lived city and the absent one", () => {
    const a = make(tuesday(8), 21);
    const b = make(tuesday(8), 21);
    a.run(3 * HOUR);
    catchUp(b, b.w.t + 3 * HOUR);
    expect(!!a.w.storm).toBe(!!b.w.storm);
    expect(a.w.almanacDay).toBe(b.w.almanacDay);
  });
});
