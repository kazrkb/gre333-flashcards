import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readJSON, writeJSON } from "./storage";
import { WORDS } from "./words";

export type Status = "new" | "learning" | "known";

export type Entry = {
  status: Status;
  starred: boolean;
  reviews: number;
  level: number; // spaced-repetition box (0 = never reviewed)
  due: string | null; // next review day, YYYY-MM-DD
  misses: number; // times answered wrong
  firstSeen: string | null; // day first studied, YYYY-MM-DD
  note: string | null; // learner's own sentence or memory trick
  misspells: number; // wrong spellings since the last correct one ("Misspelled" list)
  updatedAt: string; // ISO
};

type ServerEntry = {
  status: Status;
  starred: boolean;
  reviews: number;
  level: number;
  due: string | null;
  misses: number;
  first_seen: string | null;
  note: string | null;
  misspells?: number;
  updated_at: string;
};

type Patch = Partial<Pick<Entry, "status" | "starred" | "level" | "due" | "misses" | "firstSeen" | "note" | "misspells">>;

/** Days until the next review for each box. Right answers move a word up a box, wrong answers back to box 1. */
export const INTERVALS = [0, 1, 3, 7, 16, 35, 90];

export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + n));
}

/**
 * Where a word goes after an answer.
 * - Right, and the word was due (or new): move up a level and wait longer (3 → 7 → 16 → 35 → 90 days).
 * - Right but before it was due (e.g. testing a word the same day you learned it): good practice, but no
 *   real time gap has passed, so the schedule stays as it is.
 * - Wrong: back to level 1, due tomorrow.
 */
export function nextSchedule(
  prev: Pick<Entry, "status" | "level" | "due">,
  correct: boolean,
  today: string,
): Pick<Entry, "status" | "level" | "due"> {
  const status = correct ? "known" : "learning";
  if (!correct) return { status, level: 1, due: addDays(today, INTERVALS[1]) };
  const early = prev.status !== "new" && prev.due !== null && today < prev.due;
  if (early) return { status, level: prev.level, due: prev.due };
  const level = prev.level === 0 ? 2 : Math.min(prev.level + 1, INTERVALS.length - 1);
  return { status, level, due: addDays(today, INTERVALS[level]) };
}

export function isDue(e: Entry, today = localDay()) {
  return e.status !== "new" && (!e.due || e.due <= today);
}
type Snapshot = { progress: Record<string, ServerEntry>; days: Record<string, number> };

export type SyncState = "connecting" | "synced" | "saving" | "offline";

const K_CODE = "gre333.code.v1";
const K_PROGRESS = "gre333.progress.v1";
const K_PENDING = "gre333.pending.v1"; // word ids changed but not yet saved on the server
const K_DAYS = "gre333.days.v1";
const K_PENDING_DAYS = "gre333.pendingDays.v1"; // reviews done while offline

const EMPTY: Entry = {
  status: "new",
  starred: false,
  reviews: 0,
  level: 0,
  due: null,
  misses: 0,
  firstSeen: null,
  note: null,
  misspells: 0,
  updatedAt: new Date(0).toISOString(),
};

export function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function normalizeCode(input: string) {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : "";
}

function fromServer(map: Record<string, ServerEntry>): Record<string, Entry> {
  const out: Record<string, Entry> = {};
  for (const [id, e] of Object.entries(map)) {
    out[id] = {
      status: e.status,
      starred: e.starred,
      reviews: e.reviews,
      level: e.level ?? 0,
      due: e.due ?? null,
      misses: e.misses ?? 0,
      firstSeen: e.first_seen ?? null,
      note: e.note ?? null,
      misspells: e.misspells ?? 0,
      updatedAt: e.updated_at,
    };
  }
  return out;
}

function computeStreak(days: Record<string, number>) {
  const cursor = new Date();
  if (!days[localDay(cursor)]) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days[localDay(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function api<T>(path: string, code: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(code ? { "X-Sync-Code": code } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new HttpError(res.status);
  return res.json() as Promise<T>;
}

/** `wordsVersion` changes when the active word list changes (Word Smart locked/unlocked). */
export function useProgress(wordsVersion = 0) {
  const [code, setCodeState] = useState<string | null>(() => readJSON<string | null>(K_CODE, null));
  const [progress, setProgress] = useState<Record<string, Entry>>(() => {
    const stored = readJSON<Record<string, Partial<Entry>>>(K_PROGRESS, {});
    const out: Record<string, Entry> = {};
    for (const [id, e] of Object.entries(stored)) out[id] = { ...EMPTY, ...e };
    return out;
  });
  const [days, setDays] = useState<Record<string, number>>(() => readJSON(K_DAYS, {}));
  const [sync, setSync] = useState<SyncState>("connecting");

  const codeRef = useRef(code);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const pending = useRef<Set<string>>(new Set(readJSON<string[]>(K_PENDING, [])));
  const pendingDays = useRef<Record<string, number>>(readJSON(K_PENDING_DAYS, {}));
  const busy = useRef(false);

  useEffect(() => writeJSON(K_PROGRESS, progress), [progress]);
  useEffect(() => writeJSON(K_DAYS, days), [days]);

  const savePending = () => {
    writeJSON(K_PENDING, [...pending.current]);
    writeJSON(K_PENDING_DAYS, pendingDays.current);
  };

  const setCode = (c: string | null) => {
    codeRef.current = c;
    setCodeState(c);
    writeJSON(K_CODE, c);
  };

  /** Push everything saved only in this browser to `target`, then load the server's copy. */
  const pushAndPull = useCallback(async (target: string) => {
    const items: Record<string, Record<string, unknown>> = {};
    for (const id of pending.current) {
      const e = progressRef.current[id];
      if (e)
        items[id] = {
          status: e.status,
          starred: e.starred,
          level: e.level,
          due: e.due,
          misses: e.misses,
          first_seen: e.firstSeen,
          note: e.note ?? "",
          misspells: e.misspells,
          updated_at: e.updatedAt,
        };
    }
    const snap = await api<Snapshot>("/api/progress/sync", target, {
      method: "POST",
      body: JSON.stringify({ items, days: pendingDays.current }),
    });
    pending.current.clear();
    pendingDays.current = {};
    savePending();
    setProgress(fromServer(snap.progress));
    setDays(snap.days);
  }, []);

  const connect = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      let c = codeRef.current;
      if (!c) {
        // First visit: get a sync code. Anything already in this browser counts as unsaved.
        c = (await api<{ code: string }>("/api/learners", null, { method: "POST" })).code;
        for (const id of Object.keys(progressRef.current)) pending.current.add(id);
        for (const [d, n] of Object.entries(readJSON<Record<string, number>>(K_DAYS, {})))
          pendingDays.current[d] = Math.max(pendingDays.current[d] ?? 0, n);
        setCode(c);
      }
      try {
        await pushAndPull(c);
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) {
          // Code no longer exists on the server (e.g. database was replaced): start a fresh one.
          setCode(null);
          busy.current = false;
          return connect();
        }
        throw e;
      }
      setSync("synced");
    } catch {
      setSync("offline");
    } finally {
      busy.current = false;
    }
  }, [pushAndPull]);

  useEffect(() => {
    connect();
    const retry = () => {
      if (document.visibilityState === "visible") connect();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    const timer = window.setInterval(() => {
      if (pending.current.size > 0 || !codeRef.current) connect();
    }, 30000);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
      window.clearInterval(timer);
    };
  }, [connect]);

  const update = useCallback(
    (id: string, patch: Patch, reviewed = false) => {
      const prev = progressRef.current[id] ?? EMPTY;
      const next: Entry = {
        ...prev,
        ...patch,
        reviews: prev.reviews + (reviewed ? 1 : 0),
        updatedAt: new Date().toISOString(),
      };
      const day = localDay();
      setProgress((p) => ({ ...p, [id]: next }));
      if (reviewed) setDays((d) => ({ ...d, [day]: (d[day] ?? 0) + 1 }));

      pending.current.add(id);
      savePending();
      const c = codeRef.current;
      if (!c) {
        if (reviewed) pendingDays.current[day] = (pendingDays.current[day] ?? 0) + 1;
        savePending();
        setSync("offline");
        return;
      }
      setSync((s) => (s === "offline" ? s : "saving"));
      api(`/api/progress/${encodeURIComponent(id)}`, c, {
        method: "PUT",
        body: JSON.stringify({
          status: patch.status,
          starred: patch.starred,
          level: patch.level,
          due: patch.due,
          misses: patch.misses,
          first_seen: patch.firstSeen,
          note: patch.note === undefined ? undefined : (patch.note ?? ""),
          misspells: patch.misspells,
          reviewed,
          updated_at: next.updatedAt,
          day,
        }),
      })
        .then(() => {
          if (progressRef.current[id]?.updatedAt === next.updatedAt || !progressRef.current[id]) {
            pending.current.delete(id);
          }
          savePending();
          setSync(pending.current.size ? "saving" : "synced");
        })
        .catch(() => {
          if (reviewed) pendingDays.current[day] = (pendingDays.current[day] ?? 0) + 1;
          savePending();
          setSync("offline");
        });
    },
    [],
  );

  /** Record an answer: right moves the word up a box (reviewed later), wrong sends it back to box 1 (tomorrow). */
  const grade = useCallback(
    (id: string, correct: boolean) => {
      const prev = progressRef.current[id] ?? EMPTY;
      const today = localDay();
      const patch: Patch = { ...nextSchedule(prev, correct, today), misses: prev.misses + (correct ? 0 : 1) };
      if (!prev.firstSeen && prev.status === "new") patch.firstSeen = today;
      update(id, patch, true);
    },
    [update],
  );
  /**
   * Record a spelling answer. Right: counts as a review (same rules as grade) and clears the word from
   * the Misspelled list. Wrong: adds it to the Misspelled list without touching the review schedule.
   */
  const spelled = useCallback(
    (id: string, correct: boolean) => {
      const prev = progressRef.current[id] ?? EMPTY;
      if (correct) {
        grade(id, true);
        if (prev.misspells > 0) update(id, { misspells: 0 });
      } else update(id, { misspells: prev.misspells + 1 });
    },
    [grade, update],
  );

  const setNote = useCallback((id: string, note: string) => {
    const clean = note.trim().slice(0, 500);
    if ((progressRef.current[id]?.note ?? "") === clean) return;
    update(id, { note: clean || null });
  }, [update]);

  const toggleStar = useCallback(
    (id: string) => update(id, { starred: !(progressRef.current[id]?.starred ?? false) }),
    [update],
  );

  const reset = useCallback(async () => {
    setProgress({});
    setDays({});
    pending.current.clear();
    pendingDays.current = {};
    savePending();
    if (!codeRef.current) return;
    try {
      await api("/api/progress", codeRef.current, { method: "DELETE" });
      setSync("synced");
    } catch {
      setSync("offline");
    }
  }, []);

  /**
   * Use a sync code from another device. This device's progress is merged in
   * (for each word the most recent change wins), so nothing is lost.
   * Returns an error message, or null on success.
   */
  const switchCode = useCallback(
    async (input: string): Promise<string | null> => {
      const target = normalizeCode(input);
      if (!target) return "A sync code has 8 letters or numbers, like K7QM-4ZXP.";
      if (target === codeRef.current) return null;
      try {
        await api(`/api/learners/${target}`, null);
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return "We couldn't find that code. Check it and try again.";
        if (e instanceof HttpError && e.status === 429) return "Too many tries. Please wait a minute.";
        return "Can't reach the server right now. Try again when you're online.";
      }
      for (const id of Object.keys(progressRef.current)) pending.current.add(id);
      savePending();
      try {
        await pushAndPull(target);
        setCode(target);
        setSync("synced");
        return null;
      } catch {
        return "Something went wrong while syncing. Please try again.";
      }
    },
    [pushAndPull],
  );

  const get = useCallback((id: string): Entry => progress[id] ?? EMPTY, [progress]);

  const counts = useMemo(() => {
    let known = 0;
    let learning = 0;
    let starred = 0;
    let due = 0;
    let weak = 0;
    let newToday = 0;
    const today = localDay();
    for (const w of WORDS) {
      const e = progress[w.id];
      if (!e) continue;
      if (e.status === "known") known++;
      else if (e.status === "learning") learning++;
      if (e.starred) starred++;
      if (isDue(e, today)) due++;
      if (e.misses > 0) weak++;
      if (e.firstSeen === today) newToday++;
    }
    return { known, learning, new: WORDS.length - known - learning, starred, due, weak, newToday, total: WORDS.length };
  }, [progress, wordsVersion]);

  const today = days[localDay()] ?? 0;
  const streak = useMemo(() => computeStreak(days), [days]);

  return { code, get, grade, spelled, setNote, toggleStar, reset, switchCode, counts, sync, today, streak, retry: connect };
}
