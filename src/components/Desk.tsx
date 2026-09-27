"use client";

/**
 * The supervisor's desk at the end of the room: tonight's Evening Star,
 * folded to the front page, and the night log, open at the latest entries.
 */
import { useEffect, useRef, useState } from "react";
import { clockText, dayName, local, monthName } from "../sim/clock";
import type { LogEntry, Paper as PaperT } from "../sim/types";
import { useExchange, usePlace, useUI } from "./context";
import { Fan } from "./ornament";

export function Desk() {
  return (
    <aside className="desk" aria-label="The supervisor's desk">
      <Paper />
      <LogExcerpt />
    </aside>
  );
}


export function Paper({ full = false }: { full?: boolean }) {
  const paper = useUI((s) => s.paper);
  const flash = useUI((s) => s.paperFlash);
  const { client } = useExchange();
  const place = usePlace();
  const [fresh, setFresh] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!flash) return;
    setFresh(true); // eslint-disable-line react-hooks/set-state-in-effect -- a brief "new edition" state after the worker sets a paper
    const id = window.setTimeout(() => setFresh(false), 2400);
    return () => window.clearTimeout(id);
  }, [flash]);
  if (!paper) return <div className="paper paper--empty" />;
  const lt = local(paper.t, place);
  return (
    <article className="paper" data-fresh={fresh ? "1" : "0"} aria-labelledby={full ? "paper-full-h" : "paper-h"}>
      <header className="paper__masthead">
        <Fan className="paper__fan paper__fan--l" />
        <p className="paper__title">
          <span className="paper__the">The Halcyon</span>
          <span className="paper__star">Evening Star</span>
        </p>
        <Fan className="paper__fan paper__fan--r" />
      </header>
      <p className="paper__edition">
        <span>{paper.name}</span>
        <span>
          {dayName(lt.dow).slice(0, 3)}. {lt.date} {monthName(lt.month).slice(0, 4).replace(/(\w{3})\w$/, "$1")}. 1929
        </span>
        <span>Two cents</span>
      </p>
      <h2 className="paper__headline" id={full ? "paper-full-h" : "paper-h"} key={paper.edition}>
        {paper.headline}
      </h2>
      <p className="paper__deck">{paper.deck}</p>
      <div className="paper__items">
        {paper.items.slice(0, full ? 4 : 2).map((it) => (
          <section key={it.key} className="paper__item" data-key={it.key}>
            <h3>{it.head}</h3>
            <p>{it.body}</p>
          </section>
        ))}
      </div>
      {paper.key.startsWith("r") && (
        <button type="button" className="paper__trace" onClick={() => client.trace(Number(paper.key.slice(1)))}>
          Trace this story through the city
        </button>
      )}
      <p className="paper__time">Set at {clockText(lt.hour)}</p>
    </article>
  );
}

function LogExcerpt() {
  const log = useUI((s) => s.log);
  const rumours = useUI((s) => s.rumours);
  const { client } = useExchange();
  const recent = [...log.slice(-24)].sort((a, b) => b.t - a.t || b.id - a.id);
  const widest = rumours.filter((r) => r.tpl !== "listener")[0];
  return (
    <section className="logsheet" aria-labelledby="logsheet-h">
      <h2 id="logsheet-h" className="logsheet__h">
        The log
      </h2>
      {widest && (
        <p className="logsheet__abroad">
          {rumours.length} {rumours.length === 1 ? "rumour" : "rumours"} abroad.{" "}
          <button type="button" className="linkish" onClick={() => client.trace(widest.id)}>
            Trace the widest
          </button>
        </p>
      )}
      <ol className="logsheet__list">
        {recent.map((e) => (
          <LogLine key={e.id} e={e} />
        ))}
      </ol>
      <nav className="pulls" aria-label="The drawer">
        <a href="#directory">Directory</a>
        <a href="#census">Census</a>
        <a href="#log">Whole log</a>
        <a href="#archive">Shifts</a>
      </nav>
    </section>
  );
}

export function LogLine({ e }: { e: LogEntry }) {
  const { client } = useExchange();
  const place = usePlace();
  const lt = local(e.t, place);
  return (
    <li className="logline" data-kind={e.kind} data-w={e.w}>
      <time className="logline__t">{clockText(lt.hour)}</time>
      <p className="logline__x">
        {e.text}
        {e.rumour > 0 && e.kind !== "absence" && (
          <>
            {" "}
            <button type="button" className="linkish" onClick={() => client.trace(e.rumour)}>
              Trace
            </button>
          </>
        )}
      </p>
    </li>
  );
}

export type { PaperT };
