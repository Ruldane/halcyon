/**
 * A citizen's short biography, written from their recorded history and their
 * ties as they stand: "Velda Orr, milliner, 14 Juniper Row. Calls her sister
 * every evening, except since Tuesday. Owes the landlord three weeks."
 */
import { occTitle, tieOf } from "../sim/city";
import { DAY, HOUR, clockText, dayName, local, type Place } from "../sim/clock";
import { K, type Citizen, type Tie, type World } from "../sim/types";
import { addressOf, dollars, formal, full, his, He, num, plural, tidy } from "./words";

function relWord(w: World, c: Citizen, t: Tie): string {
  const o = w.citizens[t.o];
  if (t.kin) return `${his(c)} ${t.kin}`;
  if (t.k & K.ENGAGED) return `${his(c)} fiancé${o.sex === "f" ? "e" : ""}`;
  if (t.k & K.ROMANCE) return full(o);
  return full(o);
}

function partOfDay(h: number): string {
  if (h < 5) return "night, late";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21.5) return "evening";
  return "night";
}

export function biography(w: World, c: Citizen, place: Place, head = true): string {
  const s: string[] = [];
  const job = occTitle(c);
  const maiden = c.maiden;
  if (head) s.push(`${full(c)}${maiden ? ` (née ${maiden})` : ""}${job ? `, ${job}` : ""}, ${addressOf(w, c)}.`);
  else if (maiden) s.push(`Born ${c.first} ${maiden}.`);
  const now = w.t;

  // The habit.
  const habitual = c.ties.filter((t) => t.hh >= 0 && t.hc >= 0.45).sort((a, b) => b.hc - a.hc)[0];
  if (habitual) {
    const rel = relWord(w, c, habitual);
    const when = `every ${partOfDay(habitual.hh)}`;
    if (habitual.tr < 0.3) {
      const betrayal = [...c.hist].reverse().find((h) => h.e === "betrayed" && h.o === habitual.o);
      s.push(`Used to call ${rel} ${when}; has not, since ${betrayal ? dayName(local(betrayal.t, place).dow) : "the trouble"}.`);
    } else if (habitual.miss > 0) {
      const since = local(now - habitual.miss * DAY, place);
      s.push(`Calls ${rel} ${when}, except since ${dayName(since.dow)}.`);
    } else s.push(`Calls ${rel} ${when}, at about ${clockText(habitual.hh)}.`);
  }

  // Money.
  const rent = c.debts.find((d) => d.rent);
  if (rent) {
    const h = w.households[c.home];
    const weeks = Math.max(1, Math.round(rent.amount / Math.max(1, h.rent || 6)));
    s.push(`Owes the landlord ${num(weeks)} ${weeks === 1 ? "week" : "weeks"}.`);
  }
  const loans = c.debts.filter((d) => !d.rent);
  if (loans.length) s.push(`Owes ${full(w.citizens[loans[0].to])} ${dollars(loans[0].amount)}${loans.length > 1 ? ", and others besides" : ""}.`);

  // Love.
  const spouse = c.ties.find((t) => t.k & K.SPOUSE);
  const engaged = c.ties.find((t) => t.k & K.ENGAGED);
  const courting = c.ties.find((t) => t.k & K.ROMANCE && !(t.k & (K.ENGAGED | K.SPOUSE)));
  const married = [...c.hist].reverse().find((h) => h.e === "married");
  if (married && now - married.t < 30 * DAY) s.push(`Married ${full(w.citizens[married.o!])} on ${dayName(local(married.t, place).dow)}.`);
  else if (spouse && !spouse.kin?.includes("in-law")) {
    /* long married: not news */
  }
  if (engaged) {
    const since = [...c.hist].reverse().find((h) => h.e === "engaged" && h.o === engaged.o);
    s.push(`Engaged to ${full(w.citizens[engaged.o])}${since ? ` since ${dayName(local(since.t, place).dow)}` : ""}.`);
  } else if (courting && courting.s > 0.45) s.push(`Walking out with ${full(w.citizens[courting.o])}.`);
  const broke = [...c.hist].reverse().find((h) => h.e === "broken");
  if (broke && now - broke.t < 20 * DAY) s.push(`Broke it off with ${full(w.citizens[broke.o!])}.`);

  // Work and fortune.
  const lost = [...c.hist].reverse().find((h) => h.e === "lostjob");
  const hired = [...c.hist].reverse().find((h) => h.e === "hired");
  if (lost && (!hired || hired.t < lost.t)) s.push(`Lost ${his(c)} place at ${w.workplaces[lost.n ?? 0]?.name ?? "work"} on ${dayName(local(lost.t, place).dow)}.`);
  else if (hired && now - hired.t < 20 * DAY) s.push(`Started at ${w.workplaces[hired.n ?? 0]?.name ?? "a new place"} on ${dayName(local(hired.t, place).dow)}.`);
  const fire = [...c.hist].reverse().find((h) => h.e === "fire");
  if (fire && now - fire.t < 10 * DAY) s.push(`Burned out of ${his(c)} home on ${dayName(local(fire.t, place).dow)}; stayed with family.`);
  if (c.expecting > 0) s.push(`Expecting, in about ${plural(Math.max(1, Math.round((c.expecting - now) / (7 * DAY))), "week")}.`);
  if (c.children > 0 && [...c.hist].some((h) => h.e === "birth" && now - h.t < 30 * DAY)) s.push("A new baby in the house.");

  // Quarrels and making up.
  const quarrel = [...c.hist].reverse().find((h) => h.e === "quarrel");
  if (quarrel && now - quarrel.t < 7 * DAY) {
    const made = c.hist.find((h) => h.e === "reconciled" && h.o === quarrel.o && h.t > quarrel.t);
    if (!made) s.push(`Had words with ${full(w.citizens[quarrel.o!])} on ${dayName(local(quarrel.t, place).dow)}.`);
  }
  const rivals = c.ties.filter((t) => t.k & K.RIVAL && t.r > 0.4);
  if (rivals.length && !quarrel) s.push(`Does not get on with ${formal(w.citizens[rivals[0].o])}.`);

  // Talk.
  const confided = [...c.hist].reverse().find((h) => h.e === "confided");
  const betrayed = [...c.hist].reverse().find((h) => h.e === "betrayed");
  if (betrayed) s.push(`Found out on ${dayName(local(betrayed.t, place).dow)} that ${full(w.citizens[betrayed.o!])} had not kept a confidence.`);
  else if (confided && now - confided.t < 7 * DAY) s.push(`Told ${full(w.citizens[confided.o!])} something in confidence.`);
  const about = w.rumours.filter((r) => r.subject === c.id && !r.dead && r.knowers > 2);
  if (about.length) s.push(`${He(c)} is talked about: ${plural(about.reduce((n, r) => n + r.knowers - 1, 0), "person")} ${about.reduce((n, r) => n + r.knowers - 1, 0) === 1 ? "has" : "have"} heard something.`);

  // The line.
  if (c.clicks > 0) s.push(`Has heard ${his(c)} line click ${c.clicks === 1 ? "once" : c.clicks === 2 ? "twice" : `${num(c.clicks)} times`}${c.suspicion > 0.4 ? `; now keeps ${his(c)} voice down on the telephone` : ""}.`);
  else if (c.suspicion > 0.35) s.push(`Believes the Exchange listens in.`);
  const rang = [...c.hist].reverse().find((h) => h.e === "rang-exchange");
  if (rang) s.push(`Rang the Exchange itself on ${dayName(local(rang.t, place).dow)}, asking for whoever listens.`);
  void HOUR;
  void tieOf;
  if (!head && s.length === 0) s.push(`Nothing out of the ordinary, yet. ${He(c)} keeps ${his(c)} own counsel.`);
  return tidy(s.join(" "));
}

export function temperament(c: Citizen): string {
  const t = c.traits;
  const words: string[] = [];
  if (t.soc > 0.68) words.push("sociable");
  else if (t.soc < 0.32) words.push("keeps to " + (c.sex === "f" ? "herself" : "himself"));
  if (t.gossip > 0.68) words.push("loves news");
  if (t.discretion > 0.7) words.push("discreet");
  else if (t.discretion < 0.3) words.push("indiscreet");
  if (t.warmth > 0.7) words.push("warm");
  if (t.nerve > 0.7) words.push("bold");
  else if (t.nerve < 0.28) words.push("timid");
  if (t.credulity > 0.72) words.push("believes what " + (c.sex === "f" ? "she" : "he") + " hears");
  else if (t.credulity < 0.28) words.push("sceptical");
  if (t.owl > 0.45) words.push("a night owl");
  else if (t.owl < -0.45) words.push("an early riser");
  if (t.thrift > 0.72) words.push("careful with money");
  if (t.pious > 0.65) words.push("churchgoing");
  return words.slice(0, 4).join(", ") || "even-tempered";
}
