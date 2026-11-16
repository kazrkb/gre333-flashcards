import { useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarCheck, Check, ClipboardCheck, Sparkles, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { readJSON } from "@/lib/storage";
import { WORDS } from "@/lib/words";
import { isDue, localDay, type useProgress } from "@/lib/progress";
import { K_TODAY_SPELL, K_TODAY_TEST, TODAY_TEST_EVENT } from "@/components/QuizView";

type Progress = ReturnType<typeof useProgress>;

/** Words remembered after a 2+ week gap (level 5+ in the review schedule). */
export function longTermCount(progress: Progress) {
  return WORDS.reduce((n, w) => n + (progress.get(w.id).level >= 5 ? 1 : 0), 0);
}

/**
 * Today's plan as a compact strip under the stats card:
 * 1. review what's due → 2. learn today's new words → 3. test them.
 */
export function TodayStrip({
  progress,
  goal,
  onReview,
  onLearn,
  onTest,
  onSpell,
}: {
  progress: Progress;
  goal: number;
  onReview: (ids: string[]) => void;
  onLearn: (count: number) => void;
  onTest: (ids: string[], source?: "today") => void;
  onSpell: (ids: string[]) => void;
}) {
  const today = localDay();
  const [testedDay, setTestedDay] = useState<string | null>(() => readJSON<string | null>(K_TODAY_TEST, null));
  const [spelledDay, setSpelledDay] = useState<string | null>(() => readJSON<string | null>(K_TODAY_SPELL, null));
  useEffect(() => {
    const refresh = () => {
      setTestedDay(readJSON<string | null>(K_TODAY_TEST, null));
      setSpelledDay(readJSON<string | null>(K_TODAY_SPELL, null));
    };
    window.addEventListener(TODAY_TEST_EVENT, refresh);
    return () => window.removeEventListener(TODAY_TEST_EVENT, refresh);
  }, []);

  const { due, learnedToday } = useMemo(() => {
    const due: string[] = [];
    const learnedToday: string[] = [];
    for (const w of WORDS) {
      const e = progress.get(w.id);
      if (e.status === "new") continue;
      if (isDue(e, today)) due.push(w.id);
      if (e.firstSeen === today) learnedToday.push(w.id);
    }
    return { due, learnedToday };
  }, [progress, today]);

  const newToday = progress.counts.newToday;
  const newLeft = Math.min(Math.max(goal - newToday, 0), progress.counts.new);
  const tested = testedDay === today && learnedToday.length > 0;
  const spelled = spelledDay === today && learnedToday.length > 0;

  const steps = [
    {
      key: "review",
      icon: CalendarCheck,
      label: "Review",
      detail: due.length > 0 ? `${due.length} due` : progress.today > 0 ? "Done" : "Nothing due",
      done: due.length === 0,
      run: due.length > 0 ? () => onReview(due) : undefined,
    },
    {
      key: "learn",
      icon: BookOpen,
      label: "Learn",
      detail: `${Math.min(newToday, goal)}/${goal} new`,
      done: newLeft === 0,
      run: newLeft > 0 ? () => onLearn(newLeft) : undefined,
    },
    {
      key: "test",
      icon: ClipboardCheck,
      label: "Test",
      detail: tested ? "Done" : learnedToday.length > 0 ? `${learnedToday.length} words` : "Learn first",
      done: tested,
      run: learnedToday.length > 0 ? () => onTest(learnedToday, "today") : undefined,
    },
    {
      key: "spell",
      icon: Volume2,
      label: "Spell",
      detail: spelled ? "Done" : learnedToday.length > 0 ? `${learnedToday.length} words` : "Learn first",
      done: spelled,
      run: learnedToday.length > 0 ? () => onSpell(learnedToday) : undefined,
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className="mt-3 rounded-xl border border-border bg-card p-3" aria-label="Today's plan">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[13px] font-medium">
          {current === -1 ? (
            <span className="flex items-center gap-1.5 text-primary">
              <Sparkles className="size-3.5" /> All done for today!
            </span>
          ) : (
            "Today's plan"
          )}
        </p>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{doneCount}/{steps.length} done</span>
      </div>
      <ol className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((s, i) => {
          const active = i === current;
          const Icon = s.icon;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={s.run}
                disabled={!s.run}
                className={cn(
                  "flex w-full flex-col items-start gap-1.5 rounded-lg border px-2.5 py-2 text-left transition sm:flex-row sm:items-center sm:gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  active
                    ? "border-primary/60 bg-accent-soft/60 hover:bg-accent-soft"
                    : s.done
                      ? "border-transparent bg-muted/50"
                      : "border-border hover:border-border-strong",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full sm:size-7",
                    s.done ? "bg-primary text-primary-foreground" : active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {s.done ? <Check className="size-3.5" strokeWidth={3} /> : <Icon className="size-3.5" />}
                </span>
                <span className="min-w-0 max-w-full leading-tight">
                  <span className={cn("block truncate text-[13px] font-medium", s.done && "text-muted-foreground")}>
                    <span className="sr-only">{s.done ? "Done: " : ""}</span>
                    {s.label}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{s.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
