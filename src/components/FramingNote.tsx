"use client";

/**
 * The supervisor's memorandum to the new operator, pinned to the desk on a
 * first visit. A dialog: focus moves to it and returns when it is put away.
 */
import { useEffect, useRef } from "react";
import { useExchange, useUI } from "./context";

export function FramingNote() {
  const { client } = useExchange();
  const open = useUI((s) => s.noteOpen);
  const city = useUI((s) => s.city);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (!city) return null;
  return (
    <dialog ref={ref} className="memo memo--pinned" aria-labelledby="memo-h" onClose={() => client.store.set({ noteOpen: false })}>
      <p className="memo__h" id="memo-h">
        Memorandum
      </p>
      {city.note.text.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <p className="memo__sig">{city.note.signed}</p>
      <form method="dialog">
        <button type="submit" className="key" autoFocus>
          Take position three
        </button>
      </form>
    </dialog>
  );
}
