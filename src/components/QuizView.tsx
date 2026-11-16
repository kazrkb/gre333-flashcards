import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, ClipboardCheck, Minus, Plus, RotateCcw, Trophy, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { readJSON, writeJSON } from "@/lib/storage";
import { speak, WORD_BY_ID, WORDS, type Word } from "@/lib/words";
import { GROUPS } from "@/data/groups";
import { addDays, isDue, localDay, type useProgress } from "@/lib/progress";

type Progress = ReturnType<typeof useProgress>;

type Pool = "due" | "learning" | "weak" | "known" | "starred" | "all";
type Kind = "meaning" | "word" | "bangla" | "blank" | "type" | "se";
type Mode = Kind | "mixed";

type Question = {
  id: string; // main word
  kind: Kind;
  options: string[]; // word ids (multiple choice / GRE)
  answers?: string[]; // GRE "pick 2": the two right words
  sentence?: string; // GRE "pick 2" sentence
};
type Answer = { correct: boolean; chosen: string[]; typed?: string; close?: boolean };

export type QuizState = { questions: Question[]; answers: Answer[]; index: number };
type LastResult = { score: number; total: number; at: string };

const K_SETTINGS = "gre333.quiz.settings.v3";
const K_LAST = "gre333.quiz.last.v1";

const MIN_WORDS = 5;

const PERIODS = [
  { days: 1, label: "Today", phrase: "today" },
  { days: 3, label: "Last 3 days", phrase: "in the last 3 days" },
  { days: 7, label: "Last week", phrase: "in the last week" },
  { days: 14, label: "Last 2 weeks", phrase: "in the last 2 weeks" },
  { days: 28, label: "Last 4 weeks", phrase: "in the last 4 weeks" },
];

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "mixed", label: "Mixed", hint: "A bit of everything" },
  { key: "meaning", label: "Word → meaning", hint: "Pick the right meaning" },
  { key: "word", label: "Meaning → word", hint: "Pick the right word" },
  { key: "bangla", label: "বাংলা → English", hint: "See the Bangla, pick the word" },
  { key: "blank", label: "Fill in the blank", hint: "Complete the sentence" },
  { key: "type", label: "Type the word", hint: "Hardest: spell it yourself" },
  { key: "se", label: "GRE: pick 2", hint: "Two words that both fit" },
];

const MIXED: Kind[] = ["meaning", "word", "bangla", "blank", "type"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stemRegex(word: string) {
  const stem = word.slice(0, Math.max(4, word.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${stem}\\w*`, "i");
}

const blankSentence = (w: Word) => w.example.replace(stemRegex(w.word), "_____");

function pickDistractors(target: Word, n: number): string[] {
  const valid = (w: Word) =>
    w.word.toLowerCase() !== target.word.toLowerCase() && w.en !== target.en && w.bn !== target.bn;
  const samePos = shuffle(WORDS.filter((w) => valid(w) && w.pos === target.pos));
  const others = shuffle(WORDS.filter((w) => valid(w) && w.pos !== target.pos));
  return [...samePos, ...others].slice(0, n).map((w) => w.id);
}

function editDistance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function makeQuestions(ids: string[], mode: Mode): Question[] {
  return ids.map((id, i) => {
    const w = WORD_BY_ID.get(id)!;
    let kind: Kind = mode === "mixed" ? MIXED[i % MIXED.length] : mode;
    if (kind === "blank" && !stemRegex(w.word).test(w.example)) kind = "meaning";
    return { id, kind, options: kind === "type" ? [] : shuffle([id, ...pickDistractors(w, 3)]) };
  });
}

/** GRE Sentence Equivalence: a sentence, six choices, exactly two right answers. */
function makeGreQuestions(count: number, prefer: Set<string>): Question[] {
  const items = GROUPS.flatMap((g) => g.sentences.map((s) => ({ g, s })));
  // Sentences that use words from the chosen group of words come first.
  const scored = shuffle(items).sort(
    (a, b) =>
      b.s.answers.filter((x) => prefer.has(x)).length - a.s.answers.filter((x) => prefer.has(x)).length,
  );
  return scored.slice(0, count).map(({ g, s }) => {
    const preferred = shuffle(s.answers.filter((x) => prefer.has(x)));
    const rest = shuffle(s.answers.filter((x) => !prefer.has(x)));
    const answers = [...preferred, ...rest].slice(0, 2);
    const pos = WORD_BY_ID.get(answers[0])!.pos;
    const inOtherGroups = new Set(GROUPS.filter((o) => o.id !== g.id).flatMap((o) => o.words));
    const blocked = new Set([...g.words, ...s.answers]);
    const candidates = WORDS.filter((w) => w.pos === pos && !blocked.has(w.id));
    const distractors = [
      ...shuffle(candidates.filter((w) => inOtherGroups.has(w.id))),
      ...shuffle(candidates.filter((w) => !inOtherGroups.has(w.id))),
    ]
      .slice(0, 4)
      .map((w) => w.id);
    return { id: answers[0], kind: "se", answers, sentence: s.text, options: shuffle([...answers, ...distractors]) };
  });
}

const GRE_TOTAL = GROUPS.reduce((n, g) => n + g.sentences.length, 0);

export function QuizView({
  progress,
  active,
  request,
}: {
  progress: Progress;
  active: boolean;
  /** Start a quiz on these words right away (e.g. from the Groups tab). */
  request?: { ids: string[]; key: number } | null;
}) {
  const saved = readJSON<{ pool: Pool; count: number; lastN: number; period: number; mode: Mode }>(K_SETTINGS, {
    pool: "due",
    count: 10,
    lastN: 5,
    period: 0,
    mode: "mixed",
  });
  const [period, setPeriod] = useState<number>(Math.min(Math.max(saved.period ?? 0, 0), PERIODS.length - 1));
  const [pool, setPool] = useState<Pool>(saved.pool);
  const [count, setCount] = useState<number>(saved.count);
  const [lastN, setLastN] = useState<number>(saved.lastN);
  const [mode, setMode] = useState<Mode>(saved.mode);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [last, setLast] = useState<LastResult | null>(() => readJSON<LastResult | null>(K_LAST, null));

  useEffect(() => writeJSON(K_SETTINGS, { pool, count, lastN, period, mode }), [pool, count, lastN, period, mode]);

  const pools = useMemo(() => {
    const today = localDay();
    const studied = WORDS.filter((w) => progress.get(w.id).status !== "new").sort(
      (a, b) => Date.parse(progress.get(b.id).updatedAt) - Date.parse(progress.get(a.id).updatedAt),
    );
    return {
      recent: studied.map((w) => w.id),
      // Day each word was learned. Words studied before learn dates were recorded use their last study day.
      learned: WORDS.flatMap((w) => {
        const e = progress.get(w.id);
        if (e.status === "new") return [];
        const day = e.firstSeen ?? localDay(new Date(e.updatedAt));
        return [{ id: w.id, day }];
      }),
      due: WORDS.filter((w) => isDue(progress.get(w.id), today)).map((w) => w.id),
      learning: WORDS.filter((w) => progress.get(w.id).status === "learning").map((w) => w.id),
      weak: WORDS.filter((w) => progress.get(w.id).misses > 0)
        .sort((a, b) => progress.get(b.id).misses - progress.get(a.id).misses)
        .map((w) => w.id),
      known: WORDS.filter((w) => progress.get(w.id).status === "known").map((w) => w.id),
      starred: WORDS.filter((w) => progress.get(w.id).starred).map((w) => w.id),
      all: WORDS.map((w) => w.id),
    };
  }, [progress]);

  const POOLS: { key: Pool; label: string; hint: string }[] = [
    { key: "due", label: "Due for review", hint: "Words scheduled for today" },
    { key: "weak", label: "Weak words", hint: "The words you miss most" },
    { key: "learning", label: "Learning", hint: "Words you're still learning" },
    { key: "known", label: "Known", hint: "Check you really remember them" },
    { key: "starred", label: "Starred", hint: "Your saved words" },
    { key: "all", label: "All words", hint: "Random words from all 333" },
  ];

  const studiedCount = pools.recent.length;
  const lastCount = Math.min(Math.max(lastN, MIN_WORDS), studiedCount);
  const available = pools[pool];
  const poolMax = mode === "se" ? GRE_TOTAL : available.length;
  const poolCount = Math.min(Math.max(count, MIN_WORDS), poolMax);

  const begin = (questions: Question[]) => {
    if (!questions.length) return;
    setQuiz({ questions, answers: [], index: 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Quiz these exact words (in the chosen question type). */
  const startWith = (ids: string[]) => {
    if (!ids.length) return;
    if (mode === "se") return begin(makeGreQuestions(Math.max(ids.length, MIN_WORDS), new Set(ids)));
    begin(makeQuestions(shuffle(ids), mode));
  };

  const startPool = () => {
    if (mode === "se") return begin(makeGreQuestions(poolCount, new Set(available)));
    const chosen = pool === "weak" ? available.slice(0, poolCount) : shuffle(available).slice(0, poolCount);
    begin(makeQuestions(shuffle(chosen), mode));
  };

  const retry = (q: QuizState) => {
    const missed = q.questions.filter((_, i) => !q.answers[i]?.correct);
    begin(shuffle(missed).map((m) => (m.kind === "type" ? m : { ...m, options: shuffle(m.options) })));
  };

  // Quiz requested from another tab (e.g. "Quiz this group").
  const lastRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!request || request.key === lastRequest.current) return;
    lastRequest.current = request.key;
    begin(makeQuestions(shuffle(request.ids), "mixed"));
  }, [request]);

  if (!quiz) {
    const p = PERIODS[period];
    const since = addDays(localDay(), -(p.days - 1));
    const periodIds = pools.learned.filter((x) => x.day >= since).map((x) => x.id);
    const periodCount = periodIds.length;
    return (
      <div className="flex flex-col gap-4">
        {/* Quick tests */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-primary">
              <ClipboardCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">Test yourself</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Right answers schedule a word for a later review; wrong ones bring it back tomorrow.
              </p>
            </div>
          </div>

          {/* Words learned in a period: today, last 3 days, last week… */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-accent-soft/50 p-4">
            <div className="min-w-0">
              <p className="text-[15px] font-medium">Words you learned</p>
              <p className="text-[13px] text-muted-foreground">
                {periodCount > 0
                  ? `${periodCount} ${periodCount === 1 ? "word" : "words"} learned ${p.phrase}`
                  : `No words learned ${p.phrase} yet`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <OptionStepper
                labels={PERIODS.map((x) => x.label)}
                index={period}
                onChange={setPeriod}
                label="Time period"
              />
              <Button disabled={periodCount === 0} onClick={() => startWith(periodIds)}>
                Start
              </Button>
            </div>
          </div>

          {/* Last N words */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
            <div className="min-w-0">
              <p className="text-[15px] font-medium">Your last words</p>
              <p className="text-[13px] text-muted-foreground">
                {studiedCount >= MIN_WORDS
                  ? `The last ${lastCount} words you studied`
                  : `Study at least ${MIN_WORDS} words to unlock (${studiedCount} so far)`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Stepper
                value={lastCount}
                min={MIN_WORDS}
                max={studiedCount}
                onChange={setLastN}
                label="Number of words"
                disabled={studiedCount < MIN_WORDS}
              />
              <Button
                variant="dark"
                disabled={studiedCount < MIN_WORDS}
                onClick={() => startWith(pools.recent.slice(0, lastCount))}
              >
                Start
              </Button>
            </div>
          </div>

          {last && (
            <p className="mt-3 text-[13px] text-muted-foreground">
              Last quiz: <span className="font-medium text-foreground">{last.score} / {last.total}</span> correct ·{" "}
              {new Date(last.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </p>
          )}
        </section>

        <Section title="Question type">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                aria-pressed={mode === m.key}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  mode === m.key ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-border-strong",
                  m.key === "mixed" && "col-span-2 sm:col-span-1",
                )}
              >
                <span className={cn("block text-sm font-medium", m.key === "bangla" && "font-bangla")}>{m.label}</span>
                <span className={cn("block text-[12px]", mode === m.key ? "text-background/70" : "text-muted-foreground")}>
                  {m.hint}
                </span>
              </button>
            ))}
          </div>
        </Section>

        {/* Other word groups, folded away */}
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-[15px] font-medium">More tests</span>
              <span className="block text-[13px] text-muted-foreground">Review, weak words, known, starred, all words</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-3 border-t border-border p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {POOLS.map((p) => {
                const n = pools[p.key].length;
                const selected = pool === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPool(p.key)}
                    aria-pressed={selected}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "border-primary bg-accent-soft/60" : "border-border bg-card hover:border-border-strong",
                      n === 0 && !selected && "opacity-60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium">{p.label}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">{p.hint}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 font-mono text-xs tabular-nums",
                        selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
            {poolMax === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong/60 p-4 text-center text-sm text-muted-foreground">
                {pool === "starred"
                  ? "You haven't starred any words yet."
                  : pool === "due"
                    ? "Nothing is due for review today."
                    : pool === "weak"
                      ? "No weak words yet. Words you get wrong will show up here."
                      : "No words here yet. Study some flashcards first."}
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <Stepper
                  value={poolCount}
                  min={Math.min(MIN_WORDS, poolMax)}
                  max={poolMax}
                  onChange={setCount}
                  label="Number of questions"
                />
                <Button className="flex-1" onClick={startPool}>
                  Start · {poolCount} {poolCount === 1 ? "question" : "questions"}
                </Button>
              </div>
            )}
          </div>
        </details>
      </div>
    );
  }

  return (
    <QuizRunner
      quiz={quiz}
      setQuiz={setQuiz}
      progress={progress}
      active={active}
      onFinish={(score, n) => {
        const r = { score, total: n, at: new Date().toISOString() };
        setLast(r);
        writeJSON(K_LAST, r);
      }}
      onRetry={() => retry(quiz)}
      onExit={() => setQuiz(null)}
    />
  );
}

function QuizRunner({
  quiz,
  setQuiz,
  progress,
  active,
  onFinish,
  onRetry,
  onExit,
}: {
  quiz: QuizState;
  setQuiz: (q: QuizState) => void;
  progress: Progress;
  active: boolean;
  onFinish: (score: number, total: number) => void;
  onRetry: () => void;
  onExit: () => void;
}) {
  const { questions, answers, index } = quiz;
  const finished = index >= questions.length;
  const q = questions[index];
  const answer = answers[index];
  const word = q ? WORD_BY_ID.get(q.id)! : undefined;
  const score = answers.filter((a) => a.correct).length;
  const [picked, setPicked] = useState<string[]>([]); // GRE "pick 2" selection
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPicked([]);
    setTyped("");
    if (q?.kind === "type") window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [index, q?.kind]);

  const record = useCallback(
    (a: Answer) => {
      if (!q || answer) return;
      if (q.kind === "se") q.answers!.forEach((id) => progress.grade(id, a.correct));
      else progress.grade(q.id, a.correct);
      setQuiz({ ...quiz, answers: [...answers, a] });
    },
    [q, answer, progress, quiz, answers, setQuiz],
  );

  const choose = useCallback((optionId: string) => record({ correct: optionId === q?.id, chosen: [optionId] }), [record, q]);

  const checkPair = useCallback(() => {
    if (!q?.answers || picked.length !== 2) return;
    record({ correct: picked.every((p) => q.answers!.includes(p)), chosen: picked });
  }, [q, picked, record]);

  const checkTyped = useCallback(
    (giveUp = false) => {
      if (!word) return;
      const guess = typed.trim().toLowerCase();
      if (!guess && !giveUp) return;
      const target = word.word.toLowerCase();
      const exact = guess === target;
      const close = !exact && target.length >= 5 && editDistance(guess, target) === 1;
      record({ correct: !giveUp && (exact || close), chosen: [], typed: typed.trim(), close });
    },
    [word, typed, record],
  );

  const togglePick = useCallback(
    (id: string) => {
      if (answer) return;
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : [p[1], id]));
    },
    [answer],
  );

  const next = useCallback(() => {
    if (!answer) return;
    const nextIndex = index + 1;
    if (nextIndex >= questions.length) onFinish(score, questions.length);
    setQuiz({ ...quiz, index: nextIndex });
  }, [answer, index, questions.length, onFinish, score, quiz, setQuiz]);

  useEffect(() => {
    if (!active || finished || !q) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || (e.target as HTMLElement).closest("[role=dialog]")) return;
      const inInput = (e.target as HTMLElement).closest("input, textarea");
      // Inside the typing box, the form handles Enter itself.
      if (answer && !inInput && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight")) {
        e.preventDefault();
        next();
        return;
      }
      if (inInput || answer) return;
      const n = Number(e.key);
      if (q.kind === "se") {
        if (n >= 1 && n <= q.options.length) togglePick(q.options[n - 1]);
        else if (e.key === "Enter") {
          // Stop the same Enter press from also "clicking" the Next button that appears.
          e.preventDefault();
          checkPair();
        }
      } else if (q.kind !== "type" && n >= 1 && n <= q.options.length) choose(q.options[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finished, answer, q, choose, next, togglePick, checkPair]);

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    const missedCount = questions.length - score;
    const message =
      pct === 100 ? "Perfect score!" : pct >= 80 ? "Great job!" : pct >= 50 ? "Good effort. Keep practicing!" : "Keep going. Practice makes perfect!";
    const rows = questions
      .map((qq, i) => ({ qq, a: answers[i] }))
      .sort((x, y) => Number(x.a?.correct) - Number(y.a?.correct));
    return (
      <div className="flex flex-col gap-4">
        <section className="animate-card-in rounded-xl border border-border bg-card-back p-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
            <Trophy className="size-6" />
          </div>
          <p className="mt-4 text-4xl font-semibold tracking-tight tabular-nums">
            {score} <span className="text-2xl font-medium text-muted-foreground">/ {questions.length}</span>
          </p>
          <p className="mt-1 text-[15px] font-medium">{message}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pct}% correct.{" "}
            {missedCount > 0
              ? "Missed words are back in Learning and will come up again tomorrow."
              : "These words are scheduled for a later review."}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {missedCount > 0 && (
              <Button onClick={onRetry}>
                <RotateCcw /> Retry missed ({missedCount})
              </Button>
            )}
            <Button variant="outline" onClick={onExit}>
              New quiz
            </Button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <h3 className="border-b border-border bg-muted/70 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Your answers
          </h3>
          <ul>
            {rows.map(({ qq, a }, i) => {
              const ids = qq.kind === "se" ? qq.answers! : [qq.id];
              return (
                <li key={i} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <span
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                      a?.correct ? "bg-primary text-primary-foreground" : "bg-stone text-white",
                    )}
                  >
                    {a?.correct ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 space-y-1">
                    {ids.map((id) => {
                      const w = WORD_BY_ID.get(id)!;
                      return (
                        <span key={id} className="block">
                          <span className="font-medium">{w.word}</span>
                          <span className="block text-sm text-muted-foreground">
                            {w.en} · <span lang="bn" className="font-bangla">{w.bn}</span>
                          </span>
                        </span>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    );
  }

  if (!q || !word) return null;

  const prompt = (() => {
    switch (q.kind) {
      case "meaning":
        return (
          <>
            <Label>What does this word mean?</Label>
            <div className="mt-3 flex items-center gap-2">
              <h2 className="break-words text-4xl font-semibold tracking-tight sm:text-5xl">{word.word}</h2>
              <button
                type="button"
                aria-label="Pronounce"
                onClick={() => speak(word.word)}
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Volume2 className="size-[18px]" />
              </button>
            </div>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{word.pos}</p>
          </>
        );
      case "word":
        return (
          <>
            <Label>Which word means this?</Label>
            <p className="mt-3 text-xl font-medium leading-snug sm:text-2xl">{word.en}</p>
            <p lang="bn" className="mt-1.5 font-bangla text-xl font-medium text-primary">
              {word.bn}
            </p>
          </>
        );
      case "bangla":
        return (
          <>
            <Label>Which English word means this?</Label>
            <p lang="bn" className="mt-3 font-bangla text-2xl font-medium leading-snug text-primary sm:text-3xl">
              {word.bn}
            </p>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{word.pos}</p>
          </>
        );
      case "blank":
        return (
          <>
            <Label>Fill in the blank</Label>
            <p className="mt-3 text-xl font-medium leading-relaxed sm:text-2xl">{blankSentence(word)}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">The word may change form here (for example, -ed or -s).</p>
          </>
        );
      case "type":
        return (
          <>
            <Label>Type the word</Label>
            <p className="mt-3 text-xl font-medium leading-snug sm:text-2xl">{word.en}</p>
            <p lang="bn" className="mt-1.5 font-bangla text-xl font-medium text-primary">
              {word.bn}
            </p>
            <p className="mt-2 font-mono text-[13px] text-muted-foreground">
              Starts with “{word.word[0].toUpperCase()}” · {word.word.length} letters
            </p>
          </>
        );
      case "se":
        return (
          <>
            <Label>GRE: pick the 2 words that both fit</Label>
            <p className="mt-3 text-xl font-medium leading-relaxed sm:text-2xl">{q.sentence}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">Choose two answers that give the sentence the same meaning.</p>
          </>
        );
    }
  })();

  const optionState = (id: string) => {
    const right = q.kind === "se" ? q.answers!.includes(id) : id === q.id;
    const chosen = answer ? answer.chosen.includes(id) : picked.includes(id);
    return { right, chosen };
  };

  return (
    <div className="flex flex-col gap-4 pb-24 sm:pb-0">
      <div className="flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-mist/70 dark:bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${((index + (answer ? 1 : 0)) / questions.length) * 100}%` }}
          />
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {index + 1} / {questions.length}
        </span>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Quit
        </Button>
      </div>

      <section key={index} className="animate-card-in rounded-xl border border-border bg-card p-5 sm:p-7">
        {prompt}
      </section>

      {q.kind === "type" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (answer) next();
            else checkTyped();
          }}
          className="flex flex-col gap-2"
        >
          <Input
            ref={inputRef}
            value={answer ? (answer.typed ?? "") : typed}
            onChange={(e) => setTyped(e.target.value)}
            readOnly={!!answer}
            placeholder="Type your answer…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-label="Your answer"
            className={cn(
              "h-12 text-lg",
              answer && (answer.correct ? "border-primary bg-accent-soft" : "border-stone bg-muted"),
            )}
          />
          {!answer && (
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={!typed.trim()}>
                Check
              </Button>
              <Button type="button" variant="outline" onClick={() => checkTyped(true)}>
                I don't know
              </Button>
            </div>
          )}
        </form>
      ) : (
        <div className={cn("grid gap-2", q.kind === "se" && "grid-cols-2")} role="group" aria-label="Answer choices">
          {q.options.map((optId, i) => {
            const opt = WORD_BY_ID.get(optId)!;
            const { right, chosen } = optionState(optId);
            return (
              <button
                key={optId}
                type="button"
                disabled={!!answer}
                aria-pressed={q.kind === "se" ? chosen : undefined}
                onClick={() => (q.kind === "se" ? togglePick(optId) : choose(optId))}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-lg border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  !answer && !chosen && "border-border bg-card hover:border-border-strong hover:bg-muted/40 active:scale-[0.99]",
                  !answer && chosen && "border-foreground bg-foreground/5",
                  answer && right && "border-primary bg-accent-soft",
                  answer && chosen && !right && "border-stone bg-muted",
                  answer && !right && !chosen && "border-border bg-card opacity-55",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs",
                    answer && right
                      ? "border-primary bg-primary text-primary-foreground"
                      : answer && chosen
                        ? "border-stone bg-stone text-white"
                        : chosen
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground",
                  )}
                >
                  {answer && right ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : answer && chosen ? (
                    <X className="size-3.5" strokeWidth={3} />
                  ) : (
                    i + 1
                  )}
                </span>
                {q.kind === "meaning" ? (
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium">{opt.en}</span>
                    <span lang="bn" className="block font-bangla text-[15px] text-muted-foreground">
                      {opt.bn}
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0 break-words text-[17px] font-medium">{opt.word}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {q.kind === "se" && !answer && (
        <Button size="lg" onClick={checkPair} disabled={picked.length !== 2}>
          {picked.length === 2 ? "Check answer" : `Pick ${2 - picked.length} more`}
        </Button>
      )}

      {answer && (
        <section className="animate-card-in rounded-xl border border-border bg-card-back p-4" aria-live="polite">
          <p className={cn("flex items-center gap-1.5 font-medium", answer.correct ? "text-primary" : "text-foreground")}>
            {answer.correct ? <Check className="size-4" /> : <X className="size-4" />}
            {answer.correct
              ? answer.close
                ? `Almost! Check the spelling: “${word.word}”.`
                : "Correct!"
              : q.kind === "se"
                ? "Not quite. Both answers must fit."
                : `Not quite. The answer is “${word.word}”.`}
          </p>
          {(q.kind === "se" ? q.answers! : [q.id]).map((id) => {
            const w = WORD_BY_ID.get(id)!;
            return (
              <div key={id} className="mt-2">
                <p className="text-[15px]">
                  <span className="font-semibold">{w.word}</span> — {w.en}
                </p>
                <p lang="bn" className="font-bangla text-[17px] font-medium text-primary">
                  {w.bn}
                </p>
              </div>
            );
          })}
          {q.kind !== "se" && <p className="mt-1.5 text-sm text-muted-foreground">{word.example}</p>}
        </section>
      )}

      {answer && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div className="mx-auto max-w-2xl">
            <Button size="lg" className="w-full" onClick={next} autoFocus={q.kind !== "type"}>
              {index + 1 >= questions.length ? "See results" : "Next question"} <ArrowRight />
            </Button>
          </div>
        </div>
      )}

      {!answer && q.kind !== "type" && (
        <p className="hidden text-center font-mono text-[11px] text-muted-foreground/80 md:block pointer-coarse:hidden">
          {q.kind === "se" ? "Press 1–6 to pick · Enter to check" : "Press 1–4 to answer"} · Enter for next
        </p>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{children}</p>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** − label + control that steps through a list of choices (e.g. Today → Last 3 days → Last week). */
function OptionStepper({
  labels,
  index,
  onChange,
  label,
}: {
  labels: string[];
  index: number;
  onChange: (i: number) => void;
  label: string;
}) {
  const btn =
    "grid size-9 place-items-center rounded-full text-foreground transition hover:bg-muted disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex items-center rounded-full border border-border bg-card p-0.5" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(index - 1)} disabled={index <= 0} aria-label="Shorter period">
        <Minus className="size-4" />
      </button>
      <span className="min-w-[6.75rem] text-center text-[14px] font-medium" aria-live="polite">
        {labels[index]}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(index + 1)}
        disabled={index >= labels.length - 1}
        aria-label="Longer period"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/** − value + control. Steps by 5 (snapping to multiples of 5), always able to reach min and max. */
function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const step = 5;
  const down = () => onChange(Math.max(min, Math.ceil(value / step) * step - step));
  const up = () => onChange(Math.min(max, Math.floor(value / step) * step + step));
  const btn =
    "grid size-9 place-items-center rounded-full text-foreground transition hover:bg-muted disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex items-center rounded-full border border-border bg-card p-0.5" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={down} disabled={disabled || value <= min} aria-label="Fewer">
        <Minus className="size-4" />
      </button>
      <span className="min-w-9 text-center font-mono text-[15px] font-medium tabular-nums" aria-live="polite">
        {disabled ? "–" : value}
      </span>
      <button type="button" className={btn} onClick={up} disabled={disabled || value >= max} aria-label="More">
        <Plus className="size-4" />
      </button>
    </div>
  );
}
