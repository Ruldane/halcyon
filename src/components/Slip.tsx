"use client";

/**
 * The slip on the desk: whatever the operator has in hand. Listening in (the
 * conversation as it happens), a traced rumour (its path, person by person,
 * with the words that changed), or a directory card (a citizen, their ties,
 * their day). A panel, not a modal: the city keeps running beside it.
 */
import { useEffect, useMemo, useRef } from "react";
import { clockText, dayName, local, type Place } from "../sim/clock";
import type { CardData, TraceHop } from "../sim/census";
import { DISTRICT_NAMES } from "../sim/census";
import { useExchange, usePlace, useUI } from "./context";

export function Slip() {
  const { client } = useExchange();
  const slip = useUI((s) => s.slip);
  const cardKey = useUI((s) => (s.slip === "card" ? `c${s.card?.id ?? s.cardId}:${s.card ? 1 : 0}` : s.slip === "trace" ? `t${s.trace?.id ?? ""}` : s.slip === "listen" ? `l${s.listening?.call ?? ""}` : ""));
  const ref = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (slip === "none") {
      returnTo.current?.focus?.();
      returnTo.current = null;
      return;
    }
    if (!returnTo.current) returnTo.current = document.activeElement as HTMLElement | null;
    // Only take focus if the visitor isn't busy elsewhere (inside the slip, or nowhere).
    const active = document.activeElement;
    const inside = !!active && (ref.current?.contains(active) || active === document.body);
    if (!inside && active !== returnTo.current) return;
    const h = ref.current?.querySelector<HTMLElement>("[data-slip-h]");
    h?.focus({ preventScroll: true });
  }, [slip, cardKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && client.store.get().slip !== "none") client.closeSlip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [client]);

  if (slip === "none") return null;
  const label = slip === "listen" ? "Listening in" : slip === "trace" ? "Tracing a rumour" : "Directory card";
  return (
    <aside ref={ref} className="slip" data-slip={slip} aria-label={label}>
      <button type="button" className="slip__close" onClick={() => client.closeSlip()} aria-label={`Close: ${label}`}>
        <span aria-hidden="true">&times;</span>
      </button>
      {slip === "listen" && <Listening />}
      {slip === "trace" && <Tracing />}
      {slip === "card" && <Card />}
    </aside>
  );
}


// ---------------------------------------------------------------------------
// Listening
// ---------------------------------------------------------------------------

function Listening() {
  const { client } = useExchange();
  const L = useUI((s) => s.listening);
  const city = useUI((s) => s.city);
  const directory = useUI((s) => s.directory);
  const calls = useUI((s) => s.calls);
  const past = useUI((s) => s.pastListens);
  const listRef = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const names = useMemo(() => new Map(directory.map((d) => [d.id, d])), [directory]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [L?.lines.length]);

  if (!L) return null;
  const a = names.get(L.from);
  const b = L.answer >= 0 ? names.get(L.answer) : undefined;
  const call = calls.find((c) => c.id === L.call);
  const bb = b ?? (call && call.answer >= 0 ? names.get(call.answer) : undefined);
  const lineNo = (id: number) => (id >= 0 && city ? city.lines[id]?.number ?? "" : "");
  const other = calls.filter((c) => c.phase === "talk" && c.id !== L.call);

  return (
    <div className="listen">
      <p className="slip__kicker">{L.operator ? "Your own line, position three" : `Listening on ${lineNo(L.fromLine)}`}</p>
      <h2 className="slip__h" tabIndex={-1} data-slip-h>
        {L.operator ? `${a?.name ?? "A subscriber"} is calling you` : `${a?.name ?? "Someone"} and ${bb?.name ?? "someone"}`}
      </h2>
      <p className="listen__who">
        {a && (
          <button type="button" className="linkish" onClick={() => client.inspect(a.id)}>
            {a.name}, {a.address}
          </button>
        )}
        {bb && !L.operator && (
          <>
            {" "}
            <span aria-hidden="true">to</span>{" "}
            <button type="button" className="linkish" onClick={() => client.inspect(bb.id)}>
              {bb.name}, {bb.address}
            </button>
          </>
        )}
      </p>
      <ol
        ref={listRef}
        className="transcript"
        role="log"
        aria-live="polite"
        aria-label="What is said on the line"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {L.lines.map((l, i) => (
          <li key={i} className="said" data-who={l.who}>
            {l.who !== 2 && <span className="said__name">{l.name.split(" ")[0] || "?"}</span>}
            <span className="said__text">
              {l.text}
              {l.rumour > 0 && (
                <>
                  {" "}
                  <button type="button" className="linkish said__trace" onClick={() => client.trace(l.rumour)}>
                    Trace this
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
        {L.lines.length === 0 && <li className="said" data-who="2">Waiting for someone to speak&hellip;</li>}
      </ol>
      <div className="listen__foot">
        {L.ended ? (
          <>
            <p className="listen__ended">The line has cleared.</p>
            {other.length > 0 && (
              <button type="button" className="key key--small" onClick={() => client.listen(other[Math.floor(Math.random() * other.length)].id)}>
                Plug into another line
              </button>
            )}
          </>
        ) : (
          <button type="button" className="key key--small" onClick={() => client.listen(null)}>
            Pull the cord
          </button>
        )}
      </div>
      <p className="listen__note">They may hear the line click.</p>
      {past.length > 0 && (
        <details className="earlier">
          <summary>Earlier on the line ({past.length})</summary>
          {past.map((p, k) => (
            <div key={k} className="earlier__call">
              <p className="earlier__who">
                {names.get(p.from)?.name ?? "Someone"} and {names.get(p.answer)?.name ?? "someone"}
              </p>
              <ol className="transcript transcript--past">
                {p.lines.map((l, i) => (
                  <li key={i} className="said" data-who={l.who}>
                    {l.who !== 2 && <span className="said__name">{l.name.split(" ")[0]}</span>}
                    <span className="said__text">{l.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracing
// ---------------------------------------------------------------------------

function Tracing() {
  const { client } = useExchange();
  const trace = useUI((s) => s.trace);
  const step = useUI((s) => s.traceStep);
  const city = useUI((s) => s.city);
  const now = useUI((s) => s.t);
  const place = usePlace();
  const traceId = trace?.id ?? -1;
  // On a narrow screen, bring the city (and the rumour's district) into view above the sheet.
  useEffect(() => {
    if (traceId < 0 || !city || window.innerWidth >= 900) return;
    const t = client.store.get().trace;
    const first = t?.hops.find((h) => h.hearerWindow >= 0);
    if (first) {
      const b = city.buildings[city.windows[first.hearerWindow].b];
      if (b) client.store.set({ district: b.district });
    }
    window.scrollTo({ top: 0, behavior: client.store.get().still ? "auto" : "smooth" });
  }, [traceId, city, client]);
  if (!trace) {
    return (
      <div className="trace">
        <h2 className="slip__h" tabIndex={-1} data-slip-h>
          Tracing&hellip;
        </h2>
      </div>
    );
  }
  const hops = trace.hops.filter((h) => h.parent >= 0 || h.alone || (h.root && trace.tpl === "listener")).sort((a, b) => a.t - b.t);
  const root = trace.hops[0];
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const n = Math.max(0, Math.min(hops.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
    client.store.set({ traceStep: hops[n].v });
    document.querySelector<HTMLElement>(`[data-hop="${hops[n].v}"]`)?.focus();
  };
  return (
    <div className="trace">
      <p className="slip__kicker">{trace.tpl === "listener" ? "Talk about the Exchange" : `A rumour about ${trace.subject || "someone"}`}</p>
      <h2 className="slip__h" tabIndex={-1} data-slip-h>
        {root.text}
      </h2>
      <p className="trace__meta">
        {trace.tpl === "listener" ? "First wondered aloud by" : "It started with"} {root.tellerName || "someone"}, at {clockText(local(trace.born, place).hour)}; {trace.knowers} {trace.knowers === 1 ? "person has" : "people have"} heard it.{" "}
        {trace.dead ? "It has been forgotten." : trace.heat > 0.5 ? "It is still hot." : "It is cooling."}
      </p>
      <p className="trace__legend">The words that changed in each retelling are marked.</p>
      <ol className="hops">
        {hops.map((h, i) => (
          <Hop key={h.v} h={h} i={i} active={step === h.v} onKey={onKey} onPick={() => client.store.set({ traceStep: step === h.v ? -1 : h.v })} place={place} now={now} />
        ))}
      </ol>
      <button type="button" className="key key--small" onClick={() => client.store.set({ traceStep: -1, trace: { ...trace } })}>
        Show the whole path
      </button>
    </div>
  );
}

function Hop({ h, i, active, onKey, onPick, place, now }: { h: TraceHop; i: number; active: boolean; onKey: (e: React.KeyboardEvent, i: number) => void; onPick: () => void; place: Place; now: number }) {
  const words = h.text.split(/\s+/);
  const lt = local(h.t, place);
  const today = local(now, place).dayIndex;
  const when = `${lt.dayIndex === today ? "" : lt.dayIndex === today - 1 ? "Yesterday, " : `${dayName(lt.dow)}, `}${clockText(lt.hour)}`;
  return (
    <li className="hop" data-active={active ? "1" : "0"} data-truth={h.truth}>
      <button type="button" className="hop__btn" data-hop={h.v} onClick={onPick} onKeyDown={(e) => onKey(e, i)} aria-pressed={active}>
        <span className="hop__n">{i + 1}</span>
        <span className="hop__who">
          {h.alone || h.root ? (
            <>
              {h.hearerName} <em>heard the click and wondered, alone</em>
            </>
          ) : (
            <>
              {h.tellerName} <em>{h.byPhone ? "told, on the telephone," : "told, in person,"}</em> {h.hearerName}
            </>
          )}
          <time className="hop__t">{when}</time>
        </span>
      </button>
      <p className="hop__text">
        &ldquo;
        {words.map((w, k) => (
          <span key={k}>
            {h.changed[k] ? <mark>{w}</mark> : w}
            {k < words.length - 1 ? " " : ""}
          </span>
        ))}
        &rdquo;
        <span className="hop__truth">{h.truth === "true" ? "True" : h.truth === "embroidered" ? "Embroidered" : "Untrue"}</span>
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

function Card() {
  const { client } = useExchange();
  const card = useUI((s) => s.card);
  const following = useUI((s) => s.following);
  const calls = useUI((s) => s.calls);
  if (!card) {
    return (
      <div className="card">
        <h2 className="slip__h" tabIndex={-1} data-slip-h>
          Finding the card&hellip;
        </h2>
      </div>
    );
  }
  const onCall = calls.find((c) => c.id === card.call && (c.phase === "talk" || c.phase === "ring"));
  return (
    <div className="card">
      <div className="card__head">
        <p className="card__line" aria-label={card.line ? `Line ${card.line}` : "No telephone"}>
          {card.line || "No line"}
        </p>
        <h2 className="card__name" tabIndex={-1} data-slip-h>
          {card.name}
        </h2>
        <p className="card__occ">
          {card.occupation ? `${card.occupation}` : ""}
          {card.workplace && card.occupation && !card.occupation.includes("out of work") ? `, ${card.workplace}` : ""}
        </p>
        <p className="card__addr">
          {card.address}, {DISTRICT_NAMES[card.district]}. Age {card.age}.
        </p>
      </div>
      <p className="card__status" aria-live="polite">
        {card.status}
      </p>
      <div className="card__keys">
        <button type="button" className="key key--small" aria-pressed={following === card.id} onClick={() => client.follow(following === card.id ? null : card.id)}>
          {following === card.id ? "Following" : "Follow their window"}
        </button>
        {onCall && (
          <button type="button" className="key key--small" onClick={() => client.listen(onCall.id)}>
            Listen in
          </button>
        )}
      </div>
      <p className="card__bio">{card.bio}</p>
      <dl className="card__needs">
        <div>
          <dt>Money</dt>
          <dd>{card.money}</dd>
        </div>
        <div>
          <dt>Company</dt>
          <dd>{card.company}</dd>
        </div>
        <div>
          <dt>Sleep</dt>
          <dd>{card.rest}</dd>
        </div>
        <div>
          <dt>Temper</dt>
          <dd>{card.temperament}</dd>
        </div>
      </dl>
      <DayStrip card={card} />
      {card.household.length > 0 && (
        <section className="card__sec">
          <h3>Under the same roof</h3>
          <ul className="card__people">
            {card.household.map((p) => (
              <li key={p.id}>
                <button type="button" className="linkish" onClick={() => client.inspect(p.id)}>
                  {p.name}
                </button>{" "}
                <span className="card__rel">{p.rel}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Network card={card} />
      {(card.knows.length > 0 || card.about.length > 0) && (
        <section className="card__sec">
          <h3>Talk</h3>
          <ul className="card__talk">
            {card.about.map((r) => (
              <li key={`a${r.id}`}>
                <span className="card__rel">About them, {r.knowers} have heard:</span> {r.text}{" "}
                <button type="button" className="linkish" onClick={() => client.trace(r.id)}>
                  Trace
                </button>
              </li>
            ))}
            {card.knows.map((r) => (
              <li key={`k${r.id}`}>
                <span className="card__rel">They have heard:</span> {r.text}{" "}
                <button type="button" className="linkish" onClick={() => client.trace(r.id)}>
                  Trace
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const ACT_NAMES = ["asleep", "home", "work", "out", "away"];

function DayStrip({ card }: { card: CardData }) {
  const place = usePlace();
  const t = useUI((s) => s.t);
  const lt = local(t, place);
  return (
    <section className="card__sec">
      <h3>Their day</h3>
      <div className="daystrip" role="img" aria-label={`Today: ${card.day.map((d) => `${ACT_NAMES[d.act]} from ${clockText(d.from / 4)}`).join(", ")}.`}>
        {card.day.map((d, i) => (
          <span key={i} className="daystrip__seg" data-act={d.act} style={{ left: `${(d.from / 96) * 100}%`, width: `${((d.to - d.from) / 96) * 100}%` }} />
        ))}
        {card.calls.map((c, i) => {
          const h = local(c.t, place).hour;
          if (local(c.t, place).dayIndex !== lt.dayIndex) return null;
          return <span key={`c${i}`} className="daystrip__call" style={{ left: `${(h / 24) * 100}%` }} />;
        })}
        <span className="daystrip__now" style={{ left: `${(lt.hour / 24) * 100}%` }} />
      </div>
      <p className="daystrip__key" aria-hidden="true">
        <span data-act="0">Asleep</span> <span data-act="1">Home</span> <span data-act="2">Work</span> <span data-act="3">Out</span> <span className="daystrip__callkey">Calls</span>
      </p>
      {card.calls.length > 0 && (
        <ul className="card__calls">
          {card.calls
            .slice(-4)
            .reverse()
            .map((c, i) => (
              <li key={i}>
                {clockText(local(c.t, place).hour)} {c.out ? "rang" : "was rung by"} {c.name}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

function Network({ card }: { card: CardData }) {
  const { client } = useExchange();
  const ties = card.ties.slice(0, 10);
  const n = ties.length;
  const R = 78;
  return (
    <section className="card__sec">
      <h3>Their people</h3>
      <div className="network">
        <svg viewBox="-130 -104 260 216" className="network__svg" aria-hidden="true">
          {ties.map((t, i) => {
            const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
            const r = R * (1.15 - t.s * 0.45);
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r * 0.8;
            const kind = t.rel.includes("rival") ? "rival" : /wife|husband|sweetheart|engaged/.test(t.rel) ? "love" : /mother|father|sister|brother|son|daughter|cousin|aunt|uncle|niece|nephew|grand|family|in-law/.test(t.rel) ? "kin" : "friend";
            return (
              <g key={t.id} data-kind={kind}>
                <line x1="0" y1="0" x2={x} y2={y} className="network__tie" strokeWidth={0.6 + t.s * 2.2} />
                <circle cx={x} cy={y} r="4.5" className="network__node" />
                <text x={x} y={y + (y > 0 ? 14 : -8)} className="network__label" textAnchor="middle">
                  {`${t.name.split(" ")[0]} ${t.name.split(" ").slice(-1)[0].charAt(0)}.`}
                </text>
              </g>
            );
          })}
          <circle cx="0" cy="0" r="7" className="network__me" />
        </svg>
        <ul className="network__list">
          {ties.map((t) => (
            <li key={t.id}>
              <button type="button" className="linkish" onClick={() => client.inspect(t.id)}>
                {t.name}
              </button>{" "}
              <span className="card__rel">{t.rel}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
