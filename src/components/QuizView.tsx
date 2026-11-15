import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ClipboardCheck, RotateCcw, Trophy, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readJSON, writeJSON } from "@/lib/storage";
import { speak, WORD_BY_ID, WORDS, type Word } from "@/lib/words";
import type { useProgress } from "@/lib/progress";

type Progress = ReturnType<typeof useProgress>;

type Pool = "recent" | "learning" | "known" | "starred" | "all";
type Kind = "meaning" | "word" | "blank";
type Mode = Kind | "mixed";

type Question = { id: string; kind: Kind; options: string[] };
type Answer = { id: string; chosen: string; correct: boolean };

type Quiz = { questions: Question[]; answers: Answer[]; index: number };
type LastResult = { score: number; total: number; at: string };

const K_SETTINGS = "gre333.quiz.settings.v1";
const K_LAST = "gre333.quiz.last.v1";

const COUNTS = [10, 20, 30, 50];

const MODES: { key: Mode; label: string }[] = [
  { key: "mixed", label: "Mixed" },
  { key: "meaning", label: "Word → meaning" },
  { key: "word", label: "Meaning → word" },
  { key: "blank", label: "Fill in the blank" },
];

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

function blankSentence(w: Word) {
  return w.example.replace(stemRegex(w.word), "_____");
}

function pickDistractors(target: Word, n: number): string[] {
  const valid = (w: Word) =>
    w.word.toLowerCase() !== target.word.toLowerCase() && w.en !== target.en && w.bn !== target.bn;
  const samePos = shuffle(WORDS.filter((w) => valid(w) && w.pos === target.pos));
  const others = shuffle(WORDS.filter((w) => valid(w) && w.pos !== target.pos));
  return [...samePos, ...others].slice(0, n).map((w) => w.id);
}

function makeQuestions(ids: string[], mode: Mode): Question[] {
  return ids.map((id, i) => {
    const w = WORD_BY_ID.get(id)!;
    let kind: Kind = mode === "mixed" ? (["meaning", "word", "blank"] as const)[i % 3] : mode;
    if (kind === "blank" && !stemRegex(w.word).test(w.example)) kind = "meaning";
    return { id, kind, options: shuffle([id, ...pickDistractors(w, 3)]) };
  });
}

export function QuizView({ progress, active }: { progress: Progress; active: boolean }) {
  const saved = readJSON<{ pool: Pool; count: number; mode: Mode }>(K_SETTINGS, {
    pool: "recent",
    count: 10,
    mode: "mixed",
  });
  const [pool, setPool] = useState<Pool>(saved.pool);
  const [count, setCount] = useState<number>(saved.count);
  const [mode, setMode] = useState<Mode>(saved.mode);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [last, setLast] = useState<LastResult | null>(() => readJSON<LastResult | null>(K_LAST, null));

  useEffect(() => writeJSON(K_SETTINGS, { pool, count, mode }), [pool, count, mode]);

  // Words available for each pool. "Recent" = words you've studied, newest first.
  const pools = useMemo(() => {
    const studied = WORDS.filter((w) => progress.get(w.id).status !== "new").sort(
      (a, b) => Date.parse(progress.get(b.id).updatedAt) - Date.parse(progress.get(a.id).updatedAt),
    );
    return {
      recent: studied.map((w) => w.id),
      learning: WORDS.filter((w) => progress.get(w.id).status === "learning").map((w) => w.id),
      known: WORDS.filter((w) => progress.get(w.id).status === "known").map((w) => w.id),
      starred: WORDS.filter((w) => progress.get(w.id).starred).map((w) => w.id),
      all: WORDS.map((w) => w.id),
    } satisfies Record<Pool, string[]>;
  }, [progress]);

  const POOLS: { key: Pool; label: string; hint: string }[] = [
    { key: "recent", label: "Recently studied", hint: `The last ${count} words you marked` },
    { key: "learning", label: "Learning", hint: "Words you're still learning" },
    { key: "known", label: "Known", hint: "Check you really remember them" },
    { key: "starred", label: "Starred", hint: "Your saved words" },
    { key: "all", label: "All words", hint: "Random words from all 333" },
  ];

  const available = pools[pool];
  const total = Math.min(count, available.length);

  const start = (ids?: string[]) => {
    let chosen: string[];
    if (ids) chosen = shuffle(ids);
    else if (pool === "recent") chosen = shuffle(available.slice(0, count));
    else chosen = shuffle(available).slice(0, count);
    if (!chosen.length) return;
    setQuiz({ questions: makeQuestions(chosen, mode), answers: [], index: 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!quiz) {
    return (
      <div className="flex flex-col gap-4">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-primary">
              <ClipboardCheck className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Test yourself</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Pick the right answer from 4 choices. Right answers move a word to <b className="font-medium text-foreground">Known</b>;
                wrong answers move it to <b className="font-medium text-foreground">Learning</b> so you practice it again.
              </p>
            </div>
          </div>
          {last && (
            <p className="mt-4 rounded-lg bg-muted/70 px-3 py-2 text-[13px] text-muted-foreground">
              Last quiz: <span className="font-medium text-foreground">{last.score} / {last.total}</span> correct ·{" "}
              {new Date(last.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </p>
          )}
        </section>

        <Section title="Which words?">
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
        </Section>

        <Section title="How many questions?">
          <div className="grid grid-cols-4 gap-2">
            {COUNTS.map((c) => (
              <Chip key={c} selected={count === c} onClick={() => setCount(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="Question type">
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <Chip key={m.key} selected={mode === m.key} onClick={() => setMode(m.key)}>
                {m.label}
              </Chip>
            ))}
          </div>
        </Section>

        {available.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong/60 bg-card/50 p-5 text-center text-[15px] text-muted-foreground">
            {pool === "starred"
              ? "You haven't starred any words yet. Star words on the flashcards, or pick another group."
              : pool === "all"
                ? "No words found."
                : "No words here yet. Study some flashcards first, or choose “All words”."}
          </p>
        ) : (
          <Button size="lg" className="w-full" onClick={() => start()}>
            Start quiz · {total} {total === 1 ? "question" : "questions"}
          </Button>
        )}
        {available.length > 0 && available.length < count && (
          <p className="-mt-2 text-center text-[13px] text-muted-foreground">
            Only {available.length} {available.length === 1 ? "word is" : "words are"} in this group, so the quiz has {total}.
          </p>
        )}
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
      onRetry={(ids) => start(ids)}
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
  quiz: Quiz;
  setQuiz: (q: Quiz) => void;
  progress: Progress;
  active: boolean;
  onFinish: (score: number, total: number) => void;
  onRetry: (ids: string[]) => void;
  onExit: () => void;
}) {
  const { questions, answers, index } = quiz;
  const finished = index >= questions.length;
  const q = questions[index];
  const answer = answers[index];
  const word = q ? WORD_BY_ID.get(q.id)! : undefined;
  const score = answers.filter((a) => a.correct).length;

  const choose = useCallback(
    (optionId: string) => {
      if (!q || answer) return;
      const correct = optionId === q.id;
      progress.setStatus(q.id, correct ? "known" : "learning");
      setQuiz({ ...quiz, answers: [...answers, { id: q.id, chosen: optionId, correct }] });
    },
    [q, answer, progress, quiz, answers, setQuiz],
  );

  const next = useCallback(() => {
    if (!answer) return;
    const nextIndex = index + 1;
    if (nextIndex >= questions.length) onFinish(score, questions.length);
    setQuiz({ ...quiz, index: nextIndex });
  }, [answer, index, questions.length, onFinish, score, quiz, setQuiz]);

  useEffect(() => {
    if (!active || finished) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [role=dialog]") || e.metaKey || e.ctrlKey) return;
      const n = Number(e.key);
      if (!answer && n >= 1 && n <= 4 && q) choose(q.options[n - 1]);
      else if (answer && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight")) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finished, answer, q, choose, next]);

  if (finished) {
    const missed = answers.filter((a) => !a.correct);
    const pct = Math.round((score / questions.length) * 100);
    const message =
      pct === 100 ? "Perfect score!" : pct >= 80 ? "Great job!" : pct >= 50 ? "Good effort. Keep practicing!" : "Keep going. Practice makes perfect!";
    const sorted = [...answers].sort((a, b) => Number(a.correct) - Number(b.correct));
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
            {pct}% correct. {missed.length > 0 ? `${missed.length} missed ${missed.length === 1 ? "word is" : "words are"} now in Learning.` : "All these words are now marked Known."}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {missed.length > 0 && (
              <Button onClick={() => onRetry(missed.map((a) => a.id))}>
                <RotateCcw /> Retry missed words ({missed.length})
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
            {sorted.map((a) => {
              const w = WORD_BY_ID.get(a.id)!;
              return (
                <li key={a.id} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <span
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                      a.correct ? "bg-primary text-primary-foreground" : "bg-stone text-white",
                    )}
                  >
                    {a.correct ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">{w.word}</span>
                    <span className="block text-sm text-muted-foreground">
                      {w.en} · <span lang="bn" className="font-bangla">{w.bn}</span>
                    </span>
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

  const prompt =
    q.kind === "meaning" ? (
      <>
        <Label>What does this word mean?</Label>
        <div className="mt-3 flex items-center gap-2">
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">{word.word}</h2>
          <button
            type="button"
            aria-label="Pronounce"
            onClick={() => speak(word.word)}
            className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Volume2 className="size-[18px]" />
          </button>
        </div>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{word.pos}</p>
      </>
    ) : q.kind === "word" ? (
      <>
        <Label>Which word means this?</Label>
        <p className="mt-3 text-xl font-medium leading-snug sm:text-2xl">{word.en}</p>
        <p lang="bn" className="mt-1.5 font-bangla text-xl font-medium text-primary">
          {word.bn}
        </p>
      </>
    ) : (
      <>
        <Label>Fill in the blank</Label>
        <p className="mt-3 text-xl font-medium leading-relaxed sm:text-2xl">{blankSentence(word)}</p>
        <p className="mt-2 text-[13px] text-muted-foreground">The word may change form here (for example, -ed or -s).</p>
      </>
    );

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

      <div className="grid gap-2" role="group" aria-label="Answer choices">
        {q.options.map((optId, i) => {
          const opt = WORD_BY_ID.get(optId)!;
          const isAnswer = optId === q.id;
          const isChosen = answer?.chosen === optId;
          return (
            <button
              key={optId}
              type="button"
              disabled={!!answer}
              onClick={() => choose(optId)}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-lg border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                !answer && "border-border bg-card hover:border-border-strong hover:bg-muted/40 active:scale-[0.99]",
                answer && isAnswer && "border-primary bg-accent-soft",
                answer && isChosen && !isAnswer && "border-stone bg-muted",
                answer && !isAnswer && !isChosen && "border-border bg-card opacity-55",
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs",
                  answer && isAnswer
                    ? "border-primary bg-primary text-primary-foreground"
                    : answer && isChosen
                      ? "border-stone bg-stone text-white"
                      : "border-border text-muted-foreground",
                )}
              >
                {answer && isAnswer ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : answer && isChosen ? (
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
                <span className="text-[17px] font-medium">{opt.word}</span>
              )}
            </button>
          );
        })}
      </div>

      {answer && (
        <section className="animate-card-in rounded-xl border border-border bg-card-back p-4" aria-live="polite">
          <p className={cn("flex items-center gap-1.5 font-medium", answer.correct ? "text-primary" : "text-foreground")}>
            {answer.correct ? <Check className="size-4" /> : <X className="size-4" />}
            {answer.correct ? "Correct!" : `Not quite. The answer is “${word.word}”.`}
          </p>
          <p className="mt-2 text-[15px]">
            <span className="font-semibold">{word.word}</span> — {word.en}
          </p>
          <p lang="bn" className="font-bangla text-[17px] font-medium text-primary">
            {word.bn}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">{word.example}</p>
        </section>
      )}

      {answer && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div className="mx-auto max-w-2xl">
            <Button size="lg" className="w-full" onClick={next} autoFocus>
              {index + 1 >= questions.length ? "See results" : "Next question"} <ArrowRight />
            </Button>
          </div>
        </div>
      )}

      {!answer && (
        <p className="hidden text-center font-mono text-[11px] text-muted-foreground/80 md:block pointer-coarse:hidden">
          Press 1–4 to answer · Enter for next
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

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "h-11 rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
