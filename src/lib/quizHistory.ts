import { useCallback, useEffect, useRef, useState } from "react";
import { readJSON, writeJSON } from "./storage";

/** One finished quiz. Saved on the server with the learner's sync code, and kept in the browser for offline use. */
export type QuizRecord = {
  clientId: string;
  takenAt: string; // ISO
  title: string; // e.g. "Words you learned · Today"
  mode: string; // question type key
  score: number;
  total: number;
  words: string[];
  missed: string[];
};

type ServerQuiz = {
  client_id: string;
  taken_at: string;
  title: string;
  mode: string;
  score: number;
  total: number;
  words: string[];
  missed: string[];
};

const K_ITEMS = "gre333.quizHistory.v1";
const K_PENDING = "gre333.quizPending.v1"; // results not yet saved on the server

const toServer = (r: QuizRecord): ServerQuiz => ({
  client_id: r.clientId,
  taken_at: r.takenAt,
  title: r.title.slice(0, 80),
  mode: r.mode.slice(0, 24),
  score: r.score,
  total: r.total,
  words: r.words.slice(0, 500),
  missed: r.missed.slice(0, 500),
});

const fromServer = (q: ServerQuiz): QuizRecord => ({
  clientId: q.client_id,
  takenAt: q.taken_at,
  title: q.title,
  mode: q.mode,
  score: q.score,
  total: q.total,
  words: q.words,
  missed: q.missed,
});

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const byNewest = (a: QuizRecord, b: QuizRecord) => Date.parse(b.takenAt) - Date.parse(a.takenAt);

export function useQuizHistory(code: string | null) {
  const [items, setItems] = useState<QuizRecord[]>(() => readJSON<QuizRecord[]>(K_ITEMS, []));
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const pending = useRef<Set<string>>(new Set(readJSON<string[]>(K_PENDING, [])));
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => writeJSON(K_ITEMS, items.slice(0, 500)), [items]);
  const savePending = () => writeJSON(K_PENDING, [...pending.current]);

  const post = useCallback(async (r: QuizRecord, c: string) => {
    const res = await fetch("/api/quizzes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sync-Code": c },
      body: JSON.stringify(toServer(r)),
    });
    if (!res.ok) throw new Error(String(res.status));
    pending.current.delete(r.clientId);
    savePending();
  }, []);

  /** Send results saved offline, then load the full history from the server. */
  const sync = useCallback(async () => {
    const c = codeRef.current;
    if (!c) return;
    try {
      for (const r of itemsRef.current.filter((x) => pending.current.has(x.clientId))) await post(r, c);
      const res = await fetch("/api/quizzes", { headers: { "X-Sync-Code": c } });
      if (!res.ok) return;
      const server = ((await res.json()) as ServerQuiz[]).map(fromServer);
      const ids = new Set(server.map((r) => r.clientId));
      const unsent = itemsRef.current.filter((r) => pending.current.has(r.clientId) && !ids.has(r.clientId));
      setItems([...unsent, ...server].sort(byNewest));
    } catch {
      /* offline: keep the local copy and try again later */
    }
  }, [post]);

  useEffect(() => {
    sync();
    const again = () => document.visibilityState === "visible" && sync();
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [code, sync]);

  const add = useCallback(
    (r: Omit<QuizRecord, "clientId" | "takenAt">) => {
      const record: QuizRecord = { ...r, clientId: newId(), takenAt: new Date().toISOString() };
      setItems((prev) => [record, ...prev]);
      pending.current.add(record.clientId);
      savePending();
      if (codeRef.current) post(record, codeRef.current).catch(() => {});
    },
    [post],
  );

  const clear = useCallback(() => {
    setItems([]);
    pending.current.clear();
    savePending();
  }, []);

  return { items, add, clear };
}

export type QuizHistory = ReturnType<typeof useQuizHistory>;
