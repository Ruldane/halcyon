/**
 * Small pieces of language shared by every grammar: names, pronouns, numbers,
 * and a picker that avoids repeating itself.
 */
import type { Citizen, World } from "../sim/types";
import type { Rng } from "../sim/rng";

export const he = (c: Citizen) => (c.sex === "f" ? "she" : "he");
export const him = (c: Citizen) => (c.sex === "f" ? "her" : "him");
export const his = (c: Citizen) => (c.sex === "f" ? "her" : "his");
export const He = (c: Citizen) => (c.sex === "f" ? "She" : "He");
export const His = (c: Citizen) => (c.sex === "f" ? "Her" : "His");

export const full = (c: Citizen) => `${c.first} ${c.last}`;
export const formal = (c: Citizen) => `${c.title} ${c.last}`;

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const SMALL = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export function num(n: number): string {
  const r = Math.round(n);
  if (r >= 0 && r < SMALL.length) return SMALL[r];
  if (r === 20) return "twenty";
  if (r === 50) return "fifty";
  if (r === 100) return "a hundred";
  return String(r);
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${num(n)} ${Math.round(n) === 1 ? one : many}`;
}

export function dollars(n: number): string {
  const r = Math.round(n);
  if (r === 1) return "a dollar";
  if (r < 13) return `${num(r)} dollars`;
  return `$${r}`;
}

/** Tidy generated prose: "p.m.." becomes "p.m.", spaces collapse. */
export function tidy(s: string): string {
  return s.replace(/(?<!\.)\.\.(?!\.)/g, ".").replace(/\s{2,}/g, " ").trim();
}

/** Pick from variants, preferring ones not used recently under this key. */
export class Picker {
  constructor(
    private memory = 4,
    private recent: Record<string, number[]> = {},
  ) {}
  pick<T>(r: Rng, key: string, options: readonly T[]): T {
    if (options.length <= 1) return options[0];
    const used = this.recent[key] ?? [];
    const fresh = options.map((_, i) => i).filter((i) => !used.includes(i));
    const pool = fresh.length ? fresh : options.map((_, i) => i);
    const i = pool[Math.floor(r.next() * pool.length)];
    used.push(i);
    while (used.length > Math.min(this.memory, options.length - 1)) used.shift();
    this.recent[key] = used;
    return options[i];
  }
}

export function streetOf(w: World, c: Citizen): string {
  const h = w.households[c.home];
  return h ? h.street : "";
}

export function addressOf(w: World, c: Citizen): string {
  const h = w.households[c.home];
  if (!h) return "";
  if (h.kind === "ship") return "aboard the S.S. Corliss Star";
  if (h.kind === "lighthouse") return "Halcyon Light";
  if (h.kind === "hotel") return `the Hotel Meridian`;
  return `${h.number} ${h.street}`;
}

/** A short identifying description: "the milliner on Juniper Row". */
export function whoIs(w: World, c: Citizen, jobTitle: string): string {
  const street = streetOf(w, c);
  if (jobTitle && !/out of work|keeps house|retired|student/.test(jobTitle)) return `the ${jobTitle}${street ? ` on ${street}` : ""}`;
  return street ? `${formal(c)} from ${street}` : formal(c);
}

/** Word-level diff: returns indices of words in b that are not in a, in order. */
export function changedWords(a: string, b: string): boolean[] {
  const A = a.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
  const B = b.split(/\s+/);
  const bag = new Map<string, number>();
  for (const w of A) bag.set(w, (bag.get(w) ?? 0) + 1);
  return B.map((raw) => {
    const w = raw.toLowerCase().replace(/[^a-z0-9']/g, "");
    if (!w) return false;
    const n = bag.get(w) ?? 0;
    if (n > 0) {
      bag.set(w, n - 1);
      return false;
    }
    return true;
  });
}
