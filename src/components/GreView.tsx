import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, GraduationCap, RotateCcw, Shuffle, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readJSON, writeJSON } from "@/lib/storage";
import { plainSentence, stemRegex, WORD_BY_ID, WORDS, wordForForm, type Word } from "@/lib/words";
import { GROUPS } from "@/data/groups";
import GRE_ITEMS from "@/data/gre-items.json";
import type { useProgress } from "@/lib/progress";
import type { QuizHistory } from "@/lib/quizHistory";
import { Stepper } from "@/components/QuizView";

type Progress = ReturnType<typeof useProgress>;

type TcItem = { id: string; text: string; blanks: { choices: string[]; answer: number }[]; explanation: string };
type AnItem = { id: string; stem: [string, string]; choices: [string, string][]; answer: number; relation: string };
const ITEMS = GRE_ITEMS as unknown as { textCompletion: TcItem[]; analogies: AnItem[] };

type GreKind = "tc1" | "tcm" | "se" | "an";
type GreQ =
  | { kind: "tc1"; text: string; options: string[]; answer: string }
  | { kind: "tcm"; item: TcItem }
  | { kind: "se"; text: string; options: string[]; answers: string[] }
  | { kind: "an"; item: AnItem };
type GreAnswer = { correct: boolean; picks: string[] };
type GreSet = { kind: GreKind | "mix"; title: string; questions: GreQ[]; answers: GreAnswer[]; index: number };

const K_COUNTS = "gre333.gre.counts.v1";

const SECTIONS: { key: GreKind | "mix"; title: string; hint: string; onGre: boolean }[] = [
  { key: "tc1", title: "Text Completion · 1 blank", hint: "One blank, five choices. Pick the word that fits the logic.", onGre: true },
  { key: "tcm", title: "Text Completion · 2–3 blanks", hint: "Three choices per blank. Every blank must be right.", onGre: true },
  { key: "se", title: "Sentence Equivalence", hint: "One blank, six choices. Pick the two words that both fit.", onGre: true },
  { key: "an", title: "Analogies", hint: "Find the pair with the same relationship (A : B). Not on today's GRE, but used in many other exams.", onGre: false },
  { key: "mix", title: "Mixed GRE set", hint: "A bit of each type, like a real Verbal section.", onGre: true },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Words in the same synonym group as `id` (they could also fit a blank, so they're never used as wrong answers). */
function synonymsOf(id: string) {
  return new Set(GROUPS.filter((g) => g.words.includes(id)).flatMap((g) => g.words));
}

/** Resolve a word written in an item (e.g. "lucid") to a list word, if it is one. */
const listWord = (text: string): Word | undefined => WORD_BY_ID.get(text.toLowerCase()) ?? wordForForm(text);

function makeTc1(count: number): GreQ[] {
  return shuffle(WORDS)
    .filter((w) => stemRegex(w.word).test(plainSentence(w.sentences[2])))
    .slice(0, count)
    .map((w) => {
      const text = plainSentence(w.sentences[2]).replace(stemRegex(w.word), "_____");
      const blocked = synonymsOf(w.id);
      const pool = shuffle(
        WORDS.filter((o) => o.id !== w.id && o.pos === w.pos && !blocked.has(o.id) && o.word.toLowerCase() !== w.word.toLowerCase() && o.en !== w.en),
      );
      return { kind: "tc1" as const, text, answer: w.id, options: shuffle([w.id, ...pool.slice(0, 4).map((o) => o.id)]) };
    });
}

function makeSe(count: number): GreQ[] {
  const items = shuffle(GROUPS.flatMap((g) => g.sentences.map((s) => ({ g, s }))));
  return items.slice(0, count).map(({ g, s }) => {
    const answers = shuffle(s.answers).slice(0, 2);
    const pos = WORD_BY_ID.get(answers[0])!.pos;
    const blocked = new Set([...g.words, ...s.answers]);
    const others = new Set(GROUPS.filter((o) => o.id !== g.id).flatMap((o) => o.words));
    const cands = WORDS.filter((w) => w.pos === pos && !blocked.has(w.id));
    const distractors = [...shuffle(cands.filter((w) => others.has(w.id))), ...shuffle(cands.filter((w) => !others.has(w.id)))]
      .slice(0, 4)
      .map((w) => w.id);
    return { kind: "se" as const, text: s.text, answers, options: shuffle([...answers, ...distractors]) };
  });
}

const makeTcm = (count: number): GreQ[] => shuffle(ITEMS.textCompletion).slice(0, count).map((item) => ({ kind: "tcm" as const, item }));
const makeAn = (count: number): GreQ[] => shuffle(ITEMS.analogies).slice(0, count).map((item) => ({ kind: "an" as const, item }));

const MAX: Record<GreKind | "mix", number> = {
  tc1: 30,
  tcm: ITEMS.textCompletion.length,
  se: GROUPS.reduce((n, g) => n + g.sentences.length, 0),
  an: ITEMS.analogies.length,
  mix: 20,
};

function makeSet(kind: GreKind | "mix", count: number): GreQ[] {
  if (kind === "tc1") return makeTc1(count);
  if (kind === "tcm") return makeTcm(count);
  if (kind === "se") return makeSe(count);
  if (kind === "an") return makeAn(count);
  // Mixed: roughly the real Verbal balance (without reading comprehension).
  const tc1 = Math.round(count * 0.35);
  const tcm = Math.round(count * 0.3);
  const se = Math.max(count - tc1 - tcm, 1);
  return shuffle([...makeTc1(tc1), ...makeTcm(tcm), ...makeSe(se)]);
}

/** Word ids a question tests (for the review schedule and history). */
function testedWords(q: GreQ): string[] {
  if (q.kind === "tc1") return [q.answer];
  if (q.kind === "se") return q.answers;
  if (q.kind === "tcm") return q.item.blanks.map((b) => listWord(b.choices[b.answer])?.id).filter((x): x is string => !!x);
  return q.item.stem.map((s) => listWord(s)?.id).filter((x): x is string => !!x);
}

export function GreView({ progress, history, active }: { progress: Progress; history: QuizHistory; active: boolean }) {
  const [counts, setCounts] = useState<Record<string, number>>(() => readJSON(K_COUNTS, {}));
  const [set, setSet] = useState<GreSet | null>(null);
  useEffect(() => writeJSON(K_COUNTS, counts), [counts]);
  const countFor = (k: GreKind | "mix") => Math.min(counts[k] ?? 10, MAX[k]);

  const start = (kind: GreKind | "mix", questions?: GreQ[], title?: string) => {
    const qs = questions ?? makeSet(kind, countFor(kind));
    if (!qs.length) return;
    setSet({ kind, title: title ?? `GRE · ${SECTIONS.find((s) => s.key === kind)!.title}`, questions: qs, answers: [], index: 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (set) {
    return (
      <GreRunner
        set={set}
        setSet={setSet}
        progress={progress}
        active={active}
        onFinish={(s) => {
          const words = [...new Set(s.questions.flatMap(testedWords))];
          const missed = [...new Set(s.questions.filter((_, i) => !s.answers[i]?.correct).flatMap(testedWords))];
          history.add({
            title: s.title.slice(0, 80),
            mode: `gre-${s.kind}`,
            score: s.answers.filter((a) => a.correct).length,
            total: s.questions.length,
            words,
            missed,
          });
        }}
        onRetry={(s) => {
          const missed = s.questions.filter((_, i) => !s.answers[i]?.correct);
          start(s.kind, shuffle(missed), `Retry: ${s.title}`);
        }}
        onExit={() => setSet(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-primary">
            <GraduationCap className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">GRE Verbal practice</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Practice the question types where vocabulary matters most. All questions are original and use the words
              you're studying.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3">
        {SECTIONS.map((s) => {
          const max = MAX[s.key];
          return (
            <section key={s.key} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold tracking-tight">
                    {s.key === "mix" && <Shuffle className="size-4 text-primary" />}
                    {s.title}
                    {!s.onGre && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Extra
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">{s.hint}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <Stepper
                  value={countFor(s.key)}
                  min={Math.min(5, max)}
                  max={max}
                  onChange={(n) => setCounts((c) => ({ ...c, [s.key]: n }))}
                  label="Number of questions"
                />
                <Button onClick={() => start(s.key)} disabled={max === 0}>
                  Start · {countFor(s.key)}
                </Button>
              </div>
            </section>
          );
        })}
      </div>
      <p className="px-1 text-[12px] text-muted-foreground">
        Reading Comprehension isn't included: it needs full passages. Use the official ETS practice tests for it.
      </p>
    </div>
  );
}

const BLANK_LABELS = ["(i)", "(ii)", "(iii)"];

/** Text with "_____" / "(i) _____" blanks drawn as underlines (filled in after answering). */
function BlankText({ text, fills }: { text: string; fills?: (string | null)[] }) {
  const parts = text.split(/(\((?:i|ii|iii)\) _____|_____)/g);
  let n = 0;
  return (
    <>
      {parts.map((p, i) => {
        if (!/_____/.test(p)) return <span key={i}>{p}</span>;
        const fill = fills?.[n++] ?? null;
        const label = p.startsWith("(") ? p.split(" ")[0] : "";
        return (
          <span
            key={i}
            className={cn(
              "mx-0.5 inline-block min-w-16 border-b-2 px-1 text-center",
              fill ? "border-primary font-semibold text-primary" : "border-border-strong text-muted-foreground",
            )}
          >
            {fill ?? (label ? <span className="font-mono text-[13px]">{label}</span> : " ")}
          </span>
        );
      })}
    </>
  );
}

function WordLine({ w }: { w: Word }) {
  return (
    <p className="text-[15px]">
      <span className="font-semibold">{w.word}</span> — {w.en} ·{" "}
      <span lang="bn" className="font-bangla text-primary">
        {w.bn}
      </span>
    </p>
  );
}

function GreRunner({
  set,
  setSet,
  progress,
  active,
  onFinish,
  onRetry,
  onExit,
}: {
  set: GreSet;
  setSet: (s: GreSet) => void;
  progress: Progress;
  active: boolean;
  onFinish: (s: GreSet) => void;
  onRetry: (s: GreSet) => void;
  onExit: () => void;
}) {
  const { questions, answers, index } = set;
  const finished = index >= questions.length;
  const q = questions[index];
  const answer = answers[index];
  const score = answers.filter((a) => a.correct).length;
  const [picks, setPicks] = useState<string[]>([]);

  useEffect(() => setPicks([]), [index]);

  const record = useCallback(
    (a: GreAnswer) => {
      if (!q || answer) return;
      // Feed the review schedule (analogies test reasoning more than the word, so they don't count).
      if (q.kind === "tc1") progress.grade(q.answer, a.correct);
      if (q.kind === "se") q.answers.forEach((id) => progress.grade(id, a.correct));
      if (q.kind === "tcm")
        q.item.blanks.forEach((b, i) => {
          const w = listWord(b.choices[b.answer]);
          if (w) progress.grade(w.id, a.picks[i] === String(b.answer));
        });
      setSet({ ...set, answers: [...answers, a] });
    },
    [q, answer, progress, set, answers, setSet],
  );

  const pickOne = useCallback(
    (value: string) => {
      if (!q || answer) return;
      if (q.kind === "tc1") record({ correct: value === q.answer, picks: [value] });
      if (q.kind === "an") record({ correct: value === String(q.item.answer), picks: [value] });
    },
    [q, answer, record],
  );

  const ready =
    q?.kind === "se" ? picks.length === 2 : q?.kind === "tcm" ? q.item.blanks.every((_, i) => picks[i] !== undefined && picks[i] !== "") : false;

  const check = useCallback(() => {
    if (!q || answer || !ready) return;
    if (q.kind === "se") record({ correct: picks.every((p) => q.answers.includes(p)), picks });
    if (q.kind === "tcm") record({ correct: q.item.blanks.every((b, i) => picks[i] === String(b.answer)), picks });
  }, [q, answer, ready, picks, record]);

  const next = useCallback(() => {
    if (!answer) return;
    const nextIndex = index + 1;
    const updated = { ...set, index: nextIndex };
    if (nextIndex >= questions.length) onFinish(updated);
    setSet(updated);
  }, [answer, index, questions.length, onFinish, set, setSet]);

  useEffect(() => {
    if (!active || finished || !q) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || (e.target as HTMLElement).closest("input, textarea, [role=dialog]")) return;
      if (e.key === "Enter") {
        e.preventDefault(); // don't also "click" a button that just appeared
        if (answer) next();
        else check();
        return;
      }
      if (answer) return;
      const n = Number(e.key);
      if (!n) return;
      if (q.kind === "tc1" && n <= q.options.length) pickOne(q.options[n - 1]);
      if (q.kind === "an" && n <= q.item.choices.length) pickOne(String(n - 1));
      if (q.kind === "se" && n <= q.options.length) {
        const id = q.options[n - 1];
        setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : [p[1], id]));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finished, q, answer, next, check, pickOne]);

  const rows = useMemo(
    () => questions.map((qq, i) => ({ qq, a: answers[i] })).sort((x, y) => Number(x.a?.correct) - Number(y.a?.correct)),
    [questions, answers],
  );

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    const missed = questions.length - score;
    return (
      <div className="flex flex-col gap-4">
        <section className="animate-card-in rounded-xl border border-border bg-card-back p-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
            <Trophy className="size-6" />
          </div>
          <p className="mt-4 text-4xl font-semibold tracking-tight tabular-nums">
            {score} <span className="text-2xl font-medium text-muted-foreground">/ {questions.length}</span>
          </p>
          <p className="mt-1 text-[15px] font-medium">{set.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{pct}% correct. Saved to your quiz history.</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {missed > 0 && (
              <Button onClick={() => onRetry(set)}>
                <RotateCcw /> Retry missed ({missed})
              </Button>
            )}
            <Button variant="outline" onClick={onExit}>
              Back to GRE practice
            </Button>
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <h3 className="border-b border-border bg-muted/70 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Your answers
          </h3>
          <ul>
            {rows.map(({ qq, a }, i) => (
              <li key={i} className="flex items-start gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0">
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                    a?.correct ? "bg-primary text-primary-foreground" : "bg-stone text-white",
                  )}
                >
                  {a?.correct ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  {qq.kind === "an" ? (
                    <>
                      <span className="font-medium uppercase">
                        {qq.item.stem[0]} : {qq.item.stem[1]}
                      </span>
                      <span className="block text-muted-foreground">{qq.item.relation}</span>
                    </>
                  ) : (
                    testedWords(qq).map((id) => {
                      const w = WORD_BY_ID.get(id);
                      return w ? (
                        <span key={id} className="block">
                          <span className="font-medium">{w.word}</span>
                          <span className="text-muted-foreground"> — {w.en} · </span>
                          <span lang="bn" className="font-bangla text-primary">
                            {w.bn}
                          </span>
                        </span>
                      ) : null;
                    })
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  if (!q) return null;

  const label =
    q.kind === "tc1" ? "Text Completion" : q.kind === "tcm" ? "Text Completion" : q.kind === "se" ? "Sentence Equivalence" : "Analogy";
  const instruction =
    q.kind === "tc1"
      ? "Pick the word that best completes the text. (The word may appear in a different form.)"
      : q.kind === "tcm"
        ? "Pick one word for each blank. All blanks must be right."
        : q.kind === "se"
          ? "Pick the two words that both complete the sentence and give it the same meaning."
          : "Pick the pair that shows the same relationship as the pair in capitals.";

  const optionClass = (isRight: boolean, isPicked: boolean) =>
    cn(
      "flex min-h-12 items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
      !answer && !isPicked && "border-border bg-card hover:border-border-strong hover:bg-muted/40",
      !answer && isPicked && "border-foreground bg-foreground/5",
      answer && isRight && "border-primary bg-accent-soft",
      answer && isPicked && !isRight && "border-stone bg-muted",
      answer && !isRight && !isPicked && "border-border bg-card opacity-55",
    );
  const badge = (i: number, isRight: boolean, isPicked: boolean) => (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs",
        answer && isRight
          ? "border-primary bg-primary text-primary-foreground"
          : answer && isPicked
            ? "border-stone bg-stone text-white"
            : isPicked
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground",
      )}
    >
      {answer && isRight ? <Check className="size-3.5" strokeWidth={3} /> : answer && isPicked ? <X className="size-3.5" strokeWidth={3} /> : i + 1}
    </span>
  );

  // Fill the blanks in the text after answering.
  const fills =
    answer && q.kind === "tc1"
      ? [WORD_BY_ID.get(q.answer)?.word.toLowerCase() ?? null]
      : answer && q.kind === "tcm"
        ? q.item.blanks.map((b) => b.choices[b.answer])
        : undefined;

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
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        {q.kind === "an" ? (
          <p className="mt-3 text-2xl font-semibold uppercase tracking-wide sm:text-3xl">
            {q.item.stem[0]} <span className="text-muted-foreground">:</span> {q.item.stem[1]}
          </p>
        ) : (
          <p className="mt-3 text-lg font-medium leading-relaxed sm:text-xl">
            <BlankText text={q.kind === "tcm" ? q.item.text : q.text} fills={fills} />
          </p>
        )}
        <p className="mt-2 text-[13px] text-muted-foreground">{instruction}</p>
      </section>

      {/* Choices */}
      {q.kind === "tc1" && (
        <div className="grid gap-2" role="group" aria-label="Answer choices">
          {q.options.map((id, i) => {
            const w = WORD_BY_ID.get(id)!;
            const isRight = id === q.answer;
            const isPicked = answer?.picks.includes(id) ?? false;
            return (
              <button key={id} type="button" disabled={!!answer} onClick={() => pickOne(id)} className={optionClass(isRight, isPicked)}>
                {badge(i, isRight, isPicked)}
                <span className="text-[16px] font-medium">{w.word.toLowerCase()}</span>
              </button>
            );
          })}
        </div>
      )}

      {q.kind === "an" && (
        <div className="grid gap-2" role="group" aria-label="Answer choices">
          {q.item.choices.map((pair, i) => {
            const isRight = i === q.item.answer;
            const isPicked = answer?.picks[0] === String(i);
            return (
              <button key={i} type="button" disabled={!!answer} onClick={() => pickOne(String(i))} className={optionClass(isRight, isPicked)}>
                {badge(i, isRight, isPicked)}
                <span className="text-[16px] font-medium">
                  {pair[0]} <span className="text-muted-foreground">:</span> {pair[1]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {q.kind === "se" && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Answer choices">
          {q.options.map((id, i) => {
            const w = WORD_BY_ID.get(id)!;
            const isRight = q.answers.includes(id);
            const isPicked = answer ? answer.picks.includes(id) : picks.includes(id);
            return (
              <button
                key={id}
                type="button"
                disabled={!!answer}
                aria-pressed={isPicked}
                onClick={() => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : [p[1], id]))}
                className={optionClass(isRight, isPicked)}
              >
                {badge(i, isRight, isPicked)}
                <span className="min-w-0 break-words text-[16px] font-medium">{w.word.toLowerCase()}</span>
              </button>
            );
          })}
        </div>
      )}

      {q.kind === "tcm" && (
        <div className={cn("grid gap-3", q.item.blanks.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {q.item.blanks.map((b, bi) => (
            <div key={bi} className="rounded-lg border border-border bg-card p-2" role="group" aria-label={`Blank ${BLANK_LABELS[bi]}`}>
              <p className="px-2 pb-1.5 pt-1 font-mono text-[12px] text-muted-foreground">Blank {BLANK_LABELS[bi]}</p>
              <div className="grid gap-1.5">
                {b.choices.map((c, ci) => {
                  const isRight = ci === b.answer;
                  const isPicked = (answer ? answer.picks[bi] : picks[bi]) === String(ci);
                  return (
                    <button
                      key={ci}
                      type="button"
                      disabled={!!answer}
                      aria-pressed={isPicked}
                      onClick={() =>
                        setPicks((p) => {
                          const nextPicks = [...p];
                          nextPicks[bi] = String(ci);
                          return nextPicks;
                        })
                      }
                      className={cn(optionClass(isRight, isPicked), "min-h-10 px-3 py-2 text-[15px] font-medium")}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {(q.kind === "se" || q.kind === "tcm") && !answer && (
        <Button size="lg" onClick={check} disabled={!ready}>
          {ready ? "Check answer" : q.kind === "se" ? `Pick ${2 - picks.length} more` : "Pick a word for each blank"}
        </Button>
      )}

      {/* Feedback */}
      {answer && (
        <section className="animate-card-in rounded-xl border border-border bg-card-back p-4" aria-live="polite">
          <p className={cn("flex items-center gap-1.5 font-medium", answer.correct ? "text-primary" : "text-foreground")}>
            {answer.correct ? <Check className="size-4" /> : <X className="size-4" />}
            {answer.correct ? "Correct!" : "Not quite."}
          </p>
          <div className="mt-2 space-y-1.5">
            {q.kind === "tcm" && <p className="text-sm text-muted-foreground">{q.item.explanation}</p>}
            {q.kind === "an" && <p className="text-sm">{q.item.relation}</p>}
            {testedWords(q).map((id) => {
              const w = WORD_BY_ID.get(id);
              return w ? <WordLine key={id} w={w} /> : null;
            })}
          </div>
        </section>
      )}

      {answer && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div className="mx-auto max-w-2xl">
            <Button size="lg" className="w-full" onClick={next}>
              {index + 1 >= questions.length ? "See results" : "Next question"} <ArrowRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
