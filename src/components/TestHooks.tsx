"use client";

/**
 * Read-only views of the city for the browser tests, on window.__halcyon.
 * They read exactly what the page reads (the tick, the store, the renderer),
 * plus the same commands the controls use.
 */
import { useEffect } from "react";
import { useExchange } from "./context";

export function TestHooks() {
  const { client, engine } = useExchange();
  useEffect(() => {
    const api = {
      ready: () => client.store.get().ready && !!client.tick,
      t: () => client.tick?.t ?? 0,
      speed: () => client.tick?.speed ?? -1,
      citizens: () => Array.from(client.tick?.citizens ?? []),
      lines: () => Array.from(client.tick?.lines ?? []),
      calls: () => client.tick?.calls ?? [],
      owners: () => Array.from(client.owners ?? []),
      store: () => {
        const s = client.store.get();
        return {
          listening: s.listening,
          trace: s.trace,
          card: s.card,
          census: s.census,
          paper: s.paper,
          log: s.log,
          absence: s.absence,
          returned: s.returned,
          savedAt: s.savedAt,
          still: s.still,
          seed: s.seed,
          visits: s.visits,
          directory: s.directory.length,
          slip: s.slip,
        };
      },
      windowCentre: (i: number) => {
        const c = engine.city;
        if (!c) return null;
        const [x, y] = c.windowCentre(i);
        const r = c.canvas.getBoundingClientRect();
        return { x: r.left + x, y: r.top + y, inView: x >= 0 && x <= c.cssW && y >= 0 && y <= c.cssH };
      },
      nameOf: (id: number) => client.store.get().directory.find((d) => d.id === id)?.name ?? null,
      lineNumber: (id: number) => client.store.get().city?.lines[id]?.number ?? null,
      windowState: (i: number) => engine.city?.windowState(i) ?? -1,
      windowOf: (id: number) => (client.tick && client.owners ? engine.windowOf(id, client.tick, client.owners) : -1),
      listen: (id: number | null) => client.listen(id),
      trace: (id: number | null) => client.trace(id),
      inspect: (id: number | null) => client.inspect(id),
      perf: () => (window as unknown as { __halcyonPerf?: object }).__halcyonPerf ?? null,
      force: (what: "storm" | "fire" | "operator" | "engage") => client.send({ type: "force", what }),
    };
    (window as unknown as { __halcyon: typeof api }).__halcyon = api;
    return () => {
      delete (window as unknown as { __halcyon?: typeof api }).__halcyon;
    };
  }, [client, engine]);
  return null;
}
