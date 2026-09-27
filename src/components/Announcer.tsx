"use client";

/**
 * The screen-reader equivalent of watching: when narration is on, new log
 * entries are read politely, at most one every twenty seconds (the most
 * important waiting entry wins). Also announces the operator's own line.
 */
import { useEffect, useRef, useState } from "react";
import { useUI } from "./context";

export function Announcer() {
  const narrate = useUI((s) => s.narrate);
  const log = useUI((s) => s.log);
  const ringing = useUI((s) => s.operatorRinging);
  const [said, setSaid] = useState("");
  const lastId = useRef(0);
  const lastAt = useRef(0);

  useEffect(() => {
    if (!log.length) return;
    if (!lastId.current) {
      lastId.current = log[log.length - 1].id;
      return;
    }
    if (!narrate) {
      lastId.current = log[log.length - 1].id;
      return;
    }
    const now = Date.now();
    if (now - lastAt.current < 20_000) return;
    const fresh = log.filter((e) => e.id > lastId.current);
    if (!fresh.length) return;
    const best = fresh.reduce((a, b) => (b.w >= a.w ? b : a));
    lastId.current = log[log.length - 1].id;
    lastAt.current = now;
    setSaid(best.text);
  }, [log, narrate]);

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {ringing ? "Your own line is ringing at position three. The Answer button is on the keyshelf." : ""}
      </div>
    </>
  );
}
