import { useCallback, useEffect, useRef, useState } from "react";
import { readJSON, writeJSON } from "./storage";
import { CORE_WORDS, loadWordSmart, setActiveWords } from "./words";
import type { useProgress } from "./progress";

type Progress = ReturnType<typeof useProgress>;
type Via = "completed" | "test";
/** `synced` is false until the server has confirmed the unlock. */
type UnlockState = { via: Via; synced: boolean };

const K_UNLOCK = "gre333.wsUnlock.v1";

/** Passing score for the Word Smart unlock test. */
export const UNLOCK_PASS = 0.8;
/** Questions in the unlock test (half word → meaning, half fill in the blank). */
export const UNLOCK_QUESTIONS = 40;
/** Word Smart 1 + 2 words that are not already in the 333. */
export const WORD_SMART_COUNT = 1402;

/**
 * Word Smart is locked until the learner has studied all 333 words or passed the unlock test.
 * While locked, everything in the app uses only the 333. Once unlocked, the Word Smart words are
 * downloaded and mixed in everywhere.
 */
export function useWordSmart(progress: Progress, onWordsChanged: () => void) {
  const [unlock, setUnlock] = useState<UnlockState | null>(() => readJSON<UnlockState | null>(K_UNLOCK, null));
  const [ready, setReady] = useState(false); // Word Smart words downloaded and active
  const [loading, setLoading] = useState(false);
  const changed = useRef(onWordsChanged);
  changed.current = onWordsChanged;
  const code = progress.code;

  const save = (u: UnlockState | null) => {
    setUnlock((prev) => (prev?.via === u?.via && prev?.synced === u?.synced ? prev : u));
    writeJSON(K_UNLOCK, u);
  };

  const post = (c: string, via: Via) =>
    fetch("/api/me/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sync-Code": c },
      body: JSON.stringify({ via }),
    })
      .then((r) => r.ok && save({ via, synced: true }))
      .catch(() => {});

  // The server is the source of truth (so the unlock follows the sync code to other devices).
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    fetch("/api/me", { headers: { "X-Sync-Code": code } })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { ws_unlocked_at: string | null; ws_unlocked_via: Via | null } | null) => {
        if (!me || cancelled) return;
        if (me.ws_unlocked_at) save({ via: me.ws_unlocked_via ?? "completed", synced: true });
        else {
          const local = readJSON<UnlockState | null>(K_UNLOCK, null);
          // Unlocked on this device while offline → tell the server now.
          // Otherwise the server says locked (e.g. progress was reset on another device) → lock here too.
          if (local && !local.synced) post(code, local.via);
          else save(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch the word list whenever the lock state changes.
  useEffect(() => {
    let cancelled = false;
    if (!unlock) {
      setActiveWords(false);
      setReady(false);
      changed.current();
      return;
    }
    setLoading(true);
    loadWordSmart()
      .then(() => {
        if (cancelled) return;
        setActiveWords(true);
        setReady(true);
        changed.current();
      })
      .catch(() => {
        /* offline and not cached yet: stay on the 333 and try again next time */
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [unlock?.via, !!unlock]); // eslint-disable-line react-hooks/exhaustive-deps

  const doUnlock = useCallback(
    (via: Via) => {
      if (unlock) return;
      save({ via, synced: false });
      if (code) post(code, via);
    },
    [unlock, code],
  );

  /** After a full reset: lock again. */
  const relock = useCallback(() => save(null), []);

  // Studying every one of the 333 words unlocks Word Smart automatically.
  const studied333 = CORE_WORDS.reduce((n, w) => n + (progress.get(w.id).status !== "new" ? 1 : 0), 0);
  useEffect(() => {
    if (!unlock && studied333 >= CORE_WORDS.length) doUnlock("completed");
  }, [unlock, studied333, doUnlock]);

  return {
    unlocked: !!unlock,
    via: unlock?.via ?? null,
    ready,
    loading,
    studied333,
    total333: CORE_WORDS.length,
    unlock: doUnlock,
    relock,
  };
}

export type WordSmart = ReturnType<typeof useWordSmart>;
