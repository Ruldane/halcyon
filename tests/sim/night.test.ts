import { expect, test } from "vitest";
import { Simulation } from "@/sim/sim";
import { HOUR, placeFrom } from "@/sim/clock";

test("the small hours have their regulars", () => {
  const sim = Simulation.found(7, Date.UTC(2026, 8, 23, 2, 30), placeFrom("Europe/London", 0));
  const before = sim.w.callsTotal;
  sim.run(HOUR);
  expect(sim.w.callsTotal - before).toBeGreaterThan(8);
});
