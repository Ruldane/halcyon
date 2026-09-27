"use client";

/**
 * Beneath the room, the desk drawer: the directory (every citizen, as a
 * table), the census of the exchange (a statistical return), the whole night
 * log, and the archive of your own shifts.
 */
import { useEffect, useMemo, useState } from "react";
import { clockText, dateText, local, spanText } from "../sim/clock";
import { DISTRICT_NAMES } from "../sim/census";
import { useExchange, usePlace, useUI } from "./context";
import { LogLine, Paper } from "./Desk";
import { Steps } from "./ornament";

export function Drawer() {
  return (
    <div className="drawer">
      <Directory />
      <CensusReturn />
      <FullLog />
      <Archive />
    </div>
  );
}


/** Re-render every few seconds, for "now" columns. */
function useEvery(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

const NOW = ["Asleep", "Home", "At work", "Out", "Away"];

// ---------------------------------------------------------------------------

function Directory() {
  const { client } = useExchange();
  const directory = useUI((s) => s.directory);
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState(-1);
  const [limit, setLimit] = useState(24);
  useEvery(3000);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return directory.filter((d) => (district < 0 || d.district === district) && (!needle || `${d.name} ${d.occupation} ${d.address} ${d.line}`.toLowerCase().includes(needle)));
  }, [directory, q, district]);
  const tick = client.tick;
  return (
    <section className="dir" id="directory" aria-labelledby="dir-h">
      <header className="drawer__head">
        <Steps className="drawer__steps" />
        <h2 id="dir-h" className="drawer__h">
          The Directory
        </h2>
        <p className="drawer__sub">
          {directory.length} subscribers and their households. Every one of them is somewhere in the city tonight.
        </p>
      </header>
      <div className="dir__controls">
        <div className="field-input">
          <label htmlFor="dir-q">Look someone up</label>
          <input id="dir-q" type="search" value={q} placeholder="A name, a trade, a street, a line" onChange={(e) => (setQ(e.target.value), setLimit(24))} />
        </div>
        <div className="field-input">
          <label htmlFor="dir-d">District</label>
          <select id="dir-d" value={district} onChange={(e) => (setDistrict(Number(e.target.value)), setLimit(24))}>
            <option value={-1}>All of Halcyon</option>
            {DISTRICT_NAMES.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <p className="dir__count" aria-live="polite">
          {rows.length === directory.length ? "Everyone" : `${rows.length} found`}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="dir__empty">No one in Halcyon answers to that. Try a surname, or a street.</p>
      ) : (
        <div className="dir__scroll">
          <table className="dir__table">
            <caption className="sr-only">The city directory</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Trade</th>
                <th scope="col">Address</th>
                <th scope="col">Line</th>
                <th scope="col">Now</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((d) => {
                const cs = tick?.citizens[d.id] ?? 0;
                const now = cs & 8 ? "On the telephone" : NOW[cs & 7];
                return (
                  <tr key={d.id} data-phone={cs & 8 ? "1" : "0"}>
                    <th scope="row">
                      <button type="button" className="linkish dir__name" onClick={() => client.inspect(d.id)}>
                        {d.sort}
                      </button>
                    </th>
                    <td>{d.occupation}</td>
                    <td>{d.address}</td>
                    <td className="dir__line">{d.line || "none"}</td>
                    <td className="dir__now">{now}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && (
        <button type="button" className="key key--small dir__more" onClick={() => setLimit((l) => l + 48)}>
          More names ({rows.length - limit} left)
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function CensusReturn() {
  const { client } = useExchange();
  const census = useUI((s) => s.census);
  const rumours = useUI((s) => s.rumours);
  const summary = useUI((s) => s.summary);
  const place = usePlace();
  if (!census) return <section className="census" id="census" />;
  const lt = local(census.t, place);
  return (
    <section className="census" id="census" aria-labelledby="census-h">
      <header className="drawer__head">
        <h2 id="census-h" className="drawer__h">
          Census of the Exchange
        </h2>
        <p className="drawer__sub">A statistical return, kept current by the board itself.</p>
      </header>
      <div className="census__grid">
        <div className="census__form">
          <table className="return">
            <caption>
              Return as at {clockText(lt.hour)}, {dateText(lt)}
            </caption>
            <thead>
              <tr>
                <th scope="col">District</th>
                <th scope="col">Lines</th>
                <th scope="col">On the line</th>
                <th scope="col">Calls this hour</th>
                <th scope="col">Awake</th>
                <th scope="col">Lines down</th>
              </tr>
            </thead>
            <tbody>
              {census.rows.map((r) => (
                <tr key={r.district} data-down={r.down ? "1" : "0"}>
                  <th scope="row">{r.district}</th>
                  <td>{r.lines}</td>
                  <td>{r.up}</td>
                  <td>{r.hour}</td>
                  <td>{r.awake}</td>
                  <td>{r.down ? r.lines : "none"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">All Halcyon</th>
                <td>{census.rows.reduce((a, r) => a + r.lines, 0)}</td>
                <td>{census.up}</td>
                <td>{census.rows.reduce((a, r) => a + r.hour, 0)}</td>
                <td>{census.awake}</td>
                <td>{census.linesDown || "none"}</td>
              </tr>
            </tfoot>
          </table>
          <table className="return return--figures">
            <caption>The city tonight</caption>
            <tbody>
              <Fig k="Calls today" v={census.callsToday.toLocaleString("en-US")} />
              <Fig k="Calls since the board opened" v={census.callsTotal.toLocaleString("en-US")} />
              <Fig k="Busiest district this hour" v={census.busiest} />
              <Fig k="Citizens" v={census.population} />
              <Fig k="Asleep" v={census.asleep} />
              <Fig k="At work" v={census.atWork} />
              <Fig k="Out for the evening" v={census.out} />
              <Fig k="On the telephone" v={census.onPhone} />
              <Fig k="Rumours abroad" v={census.rumoursAbroad} />
              <Fig k="Engaged couples" v={census.engaged} />
              <Fig k="Households behind with the rent" v={census.inArrears} />
              <Fig k="Subscribers who think the Exchange listens" v={census.wary} />
            </tbody>
          </table>
        </div>
        <div className="abroad">
          <h3 className="abroad__h">Rumours abroad</h3>
          {rumours.length === 0 ? (
            <p className="abroad__empty">Nothing is going round just now.</p>
          ) : (
            <ol className="abroad__list">
              {rumours.map((r) => (
                <li key={r.id} className="abroad__item" data-tpl={r.tpl}>
                  <p className="abroad__text">{r.text}</p>
                  <p className="abroad__meta">
                    {r.knowers} have heard it, in {r.hops} retellings. {r.heat > 0.55 ? "Hot." : r.heat > 0.25 ? "Warm." : "Cooling."}
                  </p>
                  <button type="button" className="key key--small" onClick={() => client.trace(r.id)}>
                    Trace it
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="whatnow">
            <button type="button" className="key" onClick={() => client.summary()}>
              What is Halcyon talking about now?
            </button>
            <p className="whatnow__text" aria-live="polite">
              {summary}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fig({ k, v }: { k: string; v: number | string }) {
  return (
    <tr>
      <th scope="row">{k}</th>
      <td>{v}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------

function FullLog() {
  const { client } = useExchange();
  const log = useUI((s) => s.log);
  const narrate = useUI((s) => s.narrate);
  const absence = useUI((s) => s.absence);
  const returned = useUI((s) => s.returned);
  const place = usePlace();
  const groups = useMemo(() => {
    const out: { day: string; entries: typeof log }[] = [];
    for (const e of [...log].reverse()) {
      const d = dateText(local(e.t, place));
      if (!out.length || out[out.length - 1].day !== d) out.push({ day: d, entries: [] });
      out[out.length - 1].entries.push(e);
    }
    return out;
  }, [log, place]);
  return (
    <section className="fulllog" id="log" aria-labelledby="log-h">
      <header className="drawer__head">
        <h2 id="log-h" className="drawer__h">
          The Night Log
        </h2>
        <p className="drawer__sub">Kept by the night supervisor. Newest first.</p>
      </header>
      {(returned || absence) && (
        <div className="absence" role="note">
          <p className="absence__h">While you were away</p>
          <p className="absence__text">{returned || absence}</p>
        </div>
      )}
      <label className="toggle">
        <input type="checkbox" checked={narrate} onChange={(e) => client.store.set({ narrate: e.target.checked })} />
        <span>Read new log entries aloud to my screen reader, as they are written (at most one every twenty seconds)</span>
      </label>
      {groups.map((g) => (
        <section key={g.day} className="fulllog__day">
          <h3 className="fulllog__date">{g.day}</h3>
          <ol className="logsheet__list">
            {g.entries.map((e) => (
              <LogLine key={e.id} e={e} />
            ))}
          </ol>
        </section>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Archive() {
  const { client } = useExchange();
  const visits = useUI((s) => s.visits);
  const city = useUI((s) => s.city);
  const still = useUI((s) => s.still);
  const seed = useUI((s) => s.seed);
  const created = useUI((s) => s.created);
  const savedAt = useUI((s) => s.savedAt);
  const resetReason = useUI((s) => s.resetReason);
  const [confirm, setConfirm] = useState(false);
  const place = usePlace();
  const traced = [...new Set(visits.flatMap((v) => v.traced))];
  return (
    <section className="archive" id="archive" aria-labelledby="archive-h">
      <header className="drawer__head">
        <h2 id="archive-h" className="drawer__h">
          Your Shifts
        </h2>
        <p className="drawer__sub">The exchange keeps a record of its operators, too.</p>
      </header>
      <div className="archive__grid">
        <div>
          <table className="return shifts">
            <caption>Shifts worked at position three</caption>
            <thead>
              <tr>
                <th scope="col">Began</th>
                <th scope="col">Length</th>
                <th scope="col">Calls listened to</th>
                <th scope="col">Rumours traced</th>
              </tr>
            </thead>
            <tbody>
              {[...visits].reverse().slice(0, 12).map((v, i) => {
                const lt = local(v.start, place);
                return (
                  <tr key={i}>
                    <th scope="row">
                      {dateText(lt)}, {clockText(lt.hour)}
                    </th>
                    <td>{i === 0 ? "Now" : spanText(Math.max(60_000, v.end - v.start))}</td>
                    <td>{v.listened}</td>
                    <td>{v.traced.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {traced.length > 0 && (
            <div className="archive__traced">
              <h3>Rumours you traced</h3>
              <ul>
                {traced.map((id) => (
                  <li key={id}>
                    <button type="button" className="linkish" onClick={() => client.trace(id)}>
                      Rumour no. {id}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="archive__paper">
            <h3>Tonight&rsquo;s edition, in full</h3>
            <Paper full />
          </div>
        </div>
        <div>
          {city && (
            <div className="memo">
              <p className="memo__h">Memorandum</p>
              {city.note.text.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              <p className="memo__sig">{city.note.signed}</p>
            </div>
          )}
          <div className="settings" role="group" aria-labelledby="settings-h">
            <h3 id="settings-h">At your position</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={still}
                onChange={(e) => {
                  client.store.set({ still: e.target.checked });
                  try {
                    window.localStorage.setItem("halcyon:still", e.target.checked ? "1" : "0");
                  } catch {
                    /* fine */
                  }
                }}
              />
              <span>A still board: lamps change without blinking, cords appear rather than swing, nothing sweeps or pans. The city lives on regardless.</span>
            </label>
            <div className="settings__reset">
              {confirm ? (
                <>
                  <p>This forgets the whole city: every citizen, every rumour, your shifts. A new Halcyon will be founded.</p>
                  <button type="button" className="key key--small key--danger" onClick={() => (client.reset(), setConfirm(false))}>
                    Yes, found a new city
                  </button>
                  <button type="button" className="key key--small" onClick={() => setConfirm(false)}>
                    Keep this one
                  </button>
                </>
              ) : (
                <button type="button" className="key key--small" onClick={() => setConfirm(true)}>
                  Found a new city
                </button>
              )}
            </div>
            {resetReason && <p className="settings__note">A new city was founded on this visit: the old one was saved by an earlier version of the exchange and could not be read.</p>}
          </div>
          <footer className="colophon">
            <p>
              Halcyon, its exchange and every person in it are invented. No real people, companies or events appear here. The city runs entirely in your browser, from seed {seed}, founded {created ? dateText(local(created, place)) : ""}; it keeps your clock and is saved only on this device{savedAt ? `, last at ${clockText(local(savedAt, place).hour)}` : ""}.
            </p>
            <p>Set in Poiret One, Big Shoulders, League Gothic and Newsreader. The conversations, the log and the paper are written by the city&rsquo;s own grammar, not by any remote service.</p>
          </footer>
        </div>
      </div>
    </section>
  );
}
