/**
 * Words for a window: whose it is, where, and what they are doing now.
 * Used by the hover card, by keyboard focus, and by screen readers.
 */
import type { DirEntry } from "../sim/census";
import type { StaticCity, TickMsg } from "../worker/protocol";

export interface WindowWords {
  owner: number;
  name: string;
  occupation: string;
  place: string;
  status: string;
  floor: string;
}

const ORD = ["ground", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

export function describeWindow(i: number, city: StaticCity, owners: Int16Array | null, dir: Map<number, DirEntry>, tick: TickMsg | null): WindowWords | null {
  const w = city.windows[i];
  if (!w) return null;
  const b = city.buildings[w.b];
  const owner = owners ? owners[i] : -1;
  const d = owner >= 0 ? dir.get(owner) : undefined;
  let place: string;
  if (w.uk === 0) {
    const h = city.households[w.unit];
    place = b.style === "hotel" ? "Hotel Meridian" : b.style === "ship" ? "S.S. Corliss Star" : b.style === "lighthouse" ? "Halcyon Light" : h ? `${h.number} ${h.street}` : b.address;
  } else {
    const wp = city.workplaces[w.unit];
    place = wp ? wp.name : b.name || b.address;
  }
  const floor = b.style === "ship" ? "aboard" : w.floor < ORD.length ? `${ORD[w.floor]} floor` : `floor ${w.floor}`;
  let status = "";
  if (owner < 0) status = "To let";
  else if (tick) {
    const cs = tick.citizens[owner] ?? 0;
    const act = cs & 7;
    const phone = (cs & 8) !== 0;
    if (phone) {
      const call = tick.calls.find((c) => c.from === owner || c.answer === owner);
      const other = call ? (call.from === owner ? call.answer : call.from) : -1;
      const o = other >= 0 ? dir.get(other) : undefined;
      status = o ? `On the telephone with ${o.name}` : "On the telephone";
    } else if (cs & 32) status = "Home, by candlelight (the power is out)";
    else status = act === 0 ? "Asleep" : act === 1 ? (w.uk === 0 ? "Home, awake" : "Not here: at home") : act === 2 ? (w.uk === 1 ? "At work" : "Out: at work") : act === 3 ? "Out" : "Away from home";
  }
  return { owner, name: d ? d.name : "Nobody", occupation: d?.occupation ?? "", place, status, floor };
}

export function windowSentence(x: WindowWords): string {
  return `${x.name}${x.occupation ? `, ${x.occupation}` : ""}. ${x.place}, ${x.floor}. ${x.status}.`;
}
