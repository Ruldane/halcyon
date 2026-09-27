"use client";

/**
 * The switchboard: a field of jacks and lamps for every line, one field per
 * district under that district's window; cords that rise with real calls;
 * and the keyshelf, where the call tickets are racked and the listening cord
 * waits in its hole.
 *
 * Keyboard: the board is one tab stop. Arrow keys move between jacks; Enter
 * listens to a live line, or opens the card of whoever the line belongs to.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DISTRICT_NAMES } from "../sim/census";
import type { CallView } from "../worker/protocol";
import { useExchange, useUI } from "./context";

export function Switchboard() {
  const { client, engine } = useExchange();
  const city = useUI((s) => s.city);
  const stage = useUI((s) => s.stage);
  const district = useUI((s) => s.district);
  const down = useUI((s) => s.down);
  const boardRef = useRef<HTMLDivElement>(null);
  const cordRef = useRef<HTMLCanvasElement>(null);
  const jackRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const opRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const byDistrict = useMemo(() => {
    const out: { id: number; number: string; label: string; kind: string; owner: number }[][] = [[], [], [], [], []];
    if (!city) return out;
    for (const l of city.lines) out[l.district].push({ id: l.id, number: l.number, label: l.label, kind: l.kind, owner: l.owner });
    for (const f of out) f.sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));
    return out;
  }, [city]);

  const panorama = stage?.panorama ?? true;
  const shownKey = panorama ? "0,1,2,3,4" : stage?.visible.length ? stage.visible.join(",") : String(district);
  const shown = useMemo(() => shownKey.split(",").map(Number), [shownKey]);
  const stageW = stage?.width;

  useEffect(() => {
    if (!boardRef.current || !cordRef.current) return;
    engine.attachBoard(boardRef.current, cordRef.current);
  }, [engine]);

  const relayout = useCallback(() => {
    engine.registerJacks(jackRefs.current, opRef.current);
    engine.layoutBoard();
  }, [engine]);

  useLayoutEffect(() => {
    relayout();
  }, [relayout, shownKey, stageW, panorama]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => relayout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [relayout]);

  const visibleIds = useMemo(() => shown.flatMap((d) => byDistrict[d].map((l) => l.id)), [shown, byDistrict]);

  const press = (lineId: number) => {
    const t = client.tick;
    const call = t?.calls.find((c) => (c.fromLine === lineId || c.toLine === lineId) && (c.phase === "talk" || c.phase === "ring" || c.phase === "signal"));
    if (call) {
      client.listen(call.id);
      return;
    }
    const line = city?.lines[lineId];
    if (!line || !city) return;
    if (line.kind === "home") {
      const owners = client.owners;
      let who = -1;
      if (owners) {
        for (let i = 0; i < city.windows.length; i++) {
          const win = city.windows[i];
          if (win.uk === 0 && win.unit === line.owner && owners[i] >= 0) {
            who = owners[i];
            if (win.parlour) break;
          }
        }
      }
      if (who < 0) who = city.households[line.owner]?.members[0] ?? -1;
      if (who >= 0) client.inspect(who);
    } else if (line.kind === "work" || line.kind === "special") {
      const wp = city.workplaces[line.owner];
      if (wp && wp.owner >= 0) client.inspect(wp.owner);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = visibleIds.indexOf(active);
    if (idx < 0) return;
    const d = city?.lines[active]?.district ?? 0;
    const fieldIds = byDistrict[d].map((l) => l.id);
    const within = fieldIds.indexOf(active);
    const cols = colsFor(d);
    let next = active;
    if (e.key === "ArrowRight") next = visibleIds[Math.min(visibleIds.length - 1, idx + 1)];
    else if (e.key === "ArrowLeft") next = visibleIds[Math.max(0, idx - 1)];
    else if (e.key === "ArrowDown") next = fieldIds[Math.min(fieldIds.length - 1, within + cols)];
    else if (e.key === "ArrowUp") next = fieldIds[Math.max(0, within - cols)];
    else if (e.key === "Home") next = visibleIds[0];
    else if (e.key === "End") next = visibleIds[visibleIds.length - 1];
    else return;
    e.preventDefault();
    setActive(next);
    jackRefs.current[next]?.focus();
  };

  const tabbable = visibleIds.includes(active) ? active : visibleIds[0];

  // Each field sets its jacks in as many columns as its bay comfortably holds.
  function colsFor(d: number): number {
    if (!panorama || !stage) return 7;
    return Math.max(5, Math.min(12, Math.round(stage.bays[d].width / 27)));
  }

  return (
    <section id="board" className="board" aria-label="The switchboard">
      <div ref={boardRef} className="board__frame">
        <div
          className="fields"
          data-panorama={panorama ? "1" : "0"}
          onKeyDown={onKeyDown}
          style={panorama && stage ? ({ "--bays": stage.bays.map((b) => `${Math.max(0, b.width)}px`).join(" "), "--lead": `${Math.max(0, stage.bays[0].left)}px` } as React.CSSProperties) : undefined}
        >
          {shown.map((d) => (
            <div key={d} className="field" style={{ "--cols": colsFor(d) } as React.CSSProperties} role="group" aria-label={`${DISTRICT_NAMES[d]}: ${byDistrict[d].length} lines`} data-down={down.includes(d) ? "1" : "0"}>
              <div className="field__jacks">
                {byDistrict[d].map((l) => (
                  <button
                    key={l.id}
                    ref={(el) => {
                      jackRefs.current[l.id] = el;
                    }}
                    type="button"
                    className="jack"
                    data-s="0"
                    data-kind={l.kind}
                    data-label={`${l.number}, ${l.label}`}
                    aria-label={`${l.number}, ${l.label}`}
                    tabIndex={l.id === tabbable ? 0 : -1}
                    onFocus={() => setActive(l.id)}
                    onClick={() => press(l.id)}
                  >
                    <span className="jack__lamp" aria-hidden="true" />
                    <span className="jack__socket" aria-hidden="true" />
                    <span className="jack__num" aria-hidden="true">
                      {l.number}
                    </span>
                  </button>
                ))}
              </div>
              {down.includes(d) && (
                <p className="field__down" role="status">
                  Lines down
                </p>
              )}
            </div>
          ))}
        </div>
        <Keyshelf opRef={opRef} />
        <canvas ref={cordRef} className="board__cords" aria-hidden="true" />
      </div>
    </section>
  );
}

function Keyshelf({ opRef }: { opRef: React.RefObject<HTMLDivElement | null> }) {
  const { client } = useExchange();
  const calls = useUI((s) => s.calls);
  const listening = useUI((s) => s.listening);
  const ringing = useUI((s) => s.operatorRinging);
  const directory = useUI((s) => s.directory);
  const city = useUI((s) => s.city);
  const t = useUI((s) => s.t);
  const names = useMemo(() => new Map(directory.map((d) => [d.id, d.name])), [directory]);
  const live = calls.filter((c) => c.phase === "talk" || c.phase === "ring").sort((a, b) => a.placed - b.placed);
  const listenLive = listening && !listening.ended;
  const lineNo = (id: number) => (id >= 0 && city ? city.lines[id]?.number ?? "" : "");
  const serviceName = (id: number) => (id === -2 ? "the Exchange" : id >= 0 && city ? (city.lines[id]?.label.split(",")[0].replace(/^the /i, "") ?? "a line") : "a line");

  return (
    <div className="shelf" data-shelf>
      <div className="shelf__rack" role="region" aria-label="Calls on the board now">
        <p className="shelf__label">
          On the lines <span className="shelf__count">{live.length}</span>
        </p>
        {live.length === 0 ? (
          <p className="shelf__empty">The board is quiet. Lamps will light as people ring.</p>
        ) : (
          <ul className="tickets">
            {live.map((c) => (
              <li key={c.id}>
                <Ticket call={c} names={names} lineNo={lineNo} now={t} onListen={() => client.listen(c.id)} serviceName={serviceName} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shelf__position">
        <div className="listenkey" data-live={listenLive ? "1" : "0"}>
          <span className="listenkey__hole" data-listen-hole aria-hidden="true" />
          <div className="listenkey__text">
            <p className="shelf__label">Listening cord</p>
            <p className="listenkey__state" aria-live="polite">
              {listenLive ? (listening!.operator ? "On your own line" : `In ${lineNo(listening!.fromLine)}`) : "Choose a lit line"}
            </p>
          </div>
          {listenLive && (
            <button type="button" className="key key--small" onClick={() => client.listen(null)}>
              Pull the cord
            </button>
          )}
        </div>
        <div className="opjack" ref={opRef} data-s={ringing ? "2" : "0"}>
          <span className="jack__lamp" aria-hidden="true" />
          <span className="jack__socket" aria-hidden="true" />
          <div>
            <p className="shelf__label">Position three</p>
            {ringing ? (
              <button type="button" className="key key--answer" onClick={() => client.answerOperator()}>
                Your line is ringing. Answer
              </button>
            ) : (
              <p className="opjack__state">Your own line. Quiet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Ticket({ call, names, lineNo, now, onListen, serviceName }: { call: CallView; names: Map<number, string>; lineNo: (id: number) => string; now: number; onListen: () => void; serviceName: (line: number) => string }) {
  const a = names.get(call.from) ?? "Someone";
  const b = call.answer >= 0 ? names.get(call.answer) ?? "someone" : call.to >= 0 ? names.get(call.to) ?? "someone" : serviceName(call.toLine);
  const mins = call.phase === "talk" && call.talkAt ? Math.max(0, Math.floor((now - call.talkAt) / 60_000)) : 0;
  const state = call.phase === "ring" ? "ringing" : mins < 1 ? "just connected" : `${mins} min`;
  return (
    <button
      type="button"
      className="ticket"
      data-listened={call.listened ? "1" : "0"}
      data-phase={call.phase}
      onClick={onListen}
      aria-label={`Listen: ${a} to ${b}, ${state}`}
    >
      <span className="ticket__nos">
        {lineNo(call.fromLine)} <span aria-hidden="true">&rarr;</span> {lineNo(call.toLine)}
      </span>
      <span className="ticket__names">
        {a.split(" ").slice(-1)[0]} to {b.split(" ").slice(-1)[0]}
      </span>
      <span className="ticket__state">{state}</span>
    </button>
  );
}
