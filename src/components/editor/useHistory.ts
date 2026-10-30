"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Undo/redo for an immutable value. Rapid successive edits (typing, dragging
 * a slider) are merged into one step so undo jumps back meaningfully.
 * State lives in a ref so updates stay side-effect free under StrictMode.
 */
export function useHistory<T>(initial: T, coalesceMs = 600) {
  const [present, setPresent] = useState(initial);
  const current = useRef(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const lastEdit = useRef(0);

  const commit = (next: T) => {
    current.current = next;
    setPresent(next);
  };

  const set = useCallback(
    (fn: (prev: T) => T) => {
      const prev = current.current;
      const next = fn(prev);
      if (next === prev) return;
      const now = Date.now();
      if (now - lastEdit.current > coalesceMs) {
        past.current.push(prev);
        if (past.current.length > 200) past.current.shift();
      }
      lastEdit.current = now;
      future.current = [];
      commit(next);
    },
    [coalesceMs],
  );

  const undo = useCallback(() => {
    const p = past.current.pop();
    if (p === undefined) return;
    future.current.push(current.current);
    lastEdit.current = 0;
    commit(p);
  }, []);

  const redo = useCallback(() => {
    const f = future.current.pop();
    if (f === undefined) return;
    past.current.push(current.current);
    lastEdit.current = 0;
    commit(f);
  }, []);

  return {
    present,
    set,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
