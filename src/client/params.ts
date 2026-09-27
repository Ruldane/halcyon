/**
 * The exchange's parameters, for tests and demonstrations. None are needed in
 * normal use.
 *
 *   ?fresh              found a new city
 *   ?seed=7             found from a fixed seed
 *   ?clock=2026-12-31T23:58  or ?clock=+5h   move the visitor's clock
 *   ?speed=8            start fast
 *   ?paused             start held
 *   ?still              reduced-motion presentation
 *   ?persist=0          do not save
 *   ?force=storm,fire,operator,engage  make something happen now
 *   ?debug              frame-rate readout
 */
import type { ForceWhat } from "../worker/protocol";

export interface PageParams {
  fresh: boolean;
  seed: number | null;
  clockOffset: number;
  speed: number;
  paused: boolean;
  still: boolean | null;
  persist: boolean;
  force: ForceWhat[];
  debug: boolean;
}

export function readParams(search: string): PageParams {
  const q = new URLSearchParams(search);
  let clockOffset = 0;
  const clock = q.get("clock");
  if (clock) {
    const rel = /^([+-]?\d+(?:\.\d+)?)(m|h|d)$/.exec(clock.trim());
    if (rel) {
      const n = Number(rel[1]);
      clockOffset = n * (rel[2] === "m" ? 60_000 : rel[2] === "h" ? 3_600_000 : 86_400_000);
    } else {
      // A local wall-clock time, read in the visitor's own zone.
      const t = new Date(clock).getTime();
      if (!Number.isNaN(t)) clockOffset = t - Date.now();
    }
  }
  const seedRaw = q.get("seed");
  const seed = seedRaw !== null && /^\d+$/.test(seedRaw) ? Number(seedRaw) : null;
  const force = (q.get("force") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ForceWhat => ["storm", "fire", "operator", "engage"].includes(s));
  return {
    fresh: q.has("fresh"),
    seed,
    clockOffset,
    speed: Math.max(0, Math.min(16, Number(q.get("speed") ?? 1) || 1)),
    paused: q.has("paused"),
    still: q.has("still") ? true : null,
    persist: q.get("persist") !== "0",
    force,
    debug: q.has("debug"),
  };
}
