'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

/** What the page on screen has not saved yet, and how to save or drop it. One page at a time. */
type Entry = { dirty: boolean; save: () => Promise<boolean>; discard: () => void };

let entry: Entry | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const unsaved = {
  get: () => entry,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

/** Set by <UnsavedGuard>: asks the owner to save or discard, then runs `then` if they leave. */
let ask: ((then: () => void) => void) | null = null;
export function setLeaveAsker(fn: typeof ask) {
  ask = fn;
}

/** Runs `then` straight away, or after the owner has saved or discarded the page's changes.
 *  For leaving the page by anything other than a link (switching location, signing out). */
export function guardLeave(then: () => void) {
  if (!entry?.dirty || !ask) return then();
  ask(then);
}

/** Registers the page's unsaved state. `save` resolves to whether it worked. */
export function useUnsavedChanges(dirty: boolean, save: () => Promise<boolean>, discard: () => void) {
  const latest = useRef({ save, discard });
  useEffect(() => {
    latest.current = { save, discard };
  });
  useEffect(() => {
    entry = { dirty, save: () => latest.current.save(), discard: () => latest.current.discard() };
    emit();
  }, [dirty]);
  useEffect(
    () => () => {
      entry = null;
      emit();
    },
    [],
  );
}

export function useUnsavedEntry() {
  return useSyncExternalStore(unsaved.subscribe, unsaved.get, () => null);
}
