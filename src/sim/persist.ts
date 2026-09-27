/**
 * Saving the city. The world is plain data, so a snapshot is the world plus a
 * schema number. An unknown or older schema is refused, and the page founds a
 * new city and says so; nothing half-migrated is ever run.
 */
import type { Place } from "./clock";
import { Simulation } from "./sim";
import type { World } from "./types";

export const SCHEMA = 6;

export interface Snapshot {
  schema: number;
  savedAt: number;
  world: World;
}

export function snapshot(sim: Simulation, now: number): Snapshot {
  return { schema: SCHEMA, savedAt: now, world: sim.w };
}

/** A JSON round trip, for tests and for storage that cannot clone. */
export function toJSON(s: Snapshot): string {
  return JSON.stringify(s);
}

export function fromJSON(text: string): Snapshot | null {
  try {
    return JSON.parse(text) as Snapshot;
  } catch {
    return null;
  }
}

export type RestoreResult = { sim: Simulation; savedAt: number } | { reset: "schema" | "corrupt" };

export function restore(snap: unknown, place: Place): RestoreResult {
  if (!snap || typeof snap !== "object") return { reset: "corrupt" };
  const s = snap as Partial<Snapshot>;
  if (s.schema !== SCHEMA) return { reset: "schema" };
  const w = s.world as World | undefined;
  if (!w || !Array.isArray(w.citizens) || !Array.isArray(w.lines) || typeof w.t !== "number" || !Array.isArray(w.rumours) || w.citizens.length < 50) {
    return { reset: "corrupt" };
  }
  try {
    const sim = new Simulation(w, place);
    return { sim, savedAt: s.savedAt ?? w.t };
  } catch {
    return { reset: "corrupt" };
  }
}
