import { useMemo } from "react";
import { BookOpen, BookText, Brain, CalendarCheck, Check, ClipboardCheck, Repeat, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readJSON } from "@/lib/storage";
import { WORDS } from "@/lib/words";
import { addDays, isDue, localDay, type useProgress } from "@/lib/progress";
import { K_TODAY_TEST } from "@/components/QuizView";

type Progress = ReturnType<typeof useProgress>;

/**
 * The daily plan: review what's due → learn new words → test them.
 * Built on three things that make words stay: spaced reviews, active recall and personal meaning.
 */
export function TodayView({
  progress,
  goal,
  onReview,
  onLearn,
  onTest,
}: {
  progress: Progress;
  goal: number;
  onReview: (ids: string[]) => void;
  onLearn: (count: number) => void;
  onTest: (ids: string[], source?: "today") => void;
}) {
  const today = localDay();
  const testedToday = readJSON<string | null>(K_TODAY_TEST, null) === today;

  const s = useMemo(() => {
    const due: string[] = [];
    const learnedToday: string[] = [];
    const lastWeek: string[] = [];
    let longTerm = 0;
    let stronger = 0;
    let learning = 0;
    let notes = 0;
    const weekAgo = addDays(today, -6);
    for (const w of WORDS) {
      const e = progress.get(w.id);
      if (e.note) notes++;
      if (e.status === "new") continue;
      if (isDue(e, today)) due.push(w.id);
      if (e.firstSeen === today) learnedToday.push(w.id);
      if ((e.firstSeen ?? localDay(new Date(e.updatedAt))) >= weekAgo) lastWeek.push(w.id);
      if (e.level >= 5) longTerm++;
      else if (e.status === "known") stronger++;
      else learning++;
    }
    return { due, learnedToday, lastWeek, longTerm, stronger, learning, notes };
  }, [progress, today]);

  const newLeft = Math.max(goal - progress.counts.newToday, 0);
  const allSeen = progress.counts.new === 0;

  const steps = [
    {
      key: "review",
      icon: <CalendarCheck className="size-[18px]" />,
      title: "Review",
      done: s.due.length === 0,
      text:
        s.due.length > 0
          ? `${s.due.length} ${s.due.length === 1 ? "word is" : "words are"} due. Reviewing right before you forget makes memories last.`
          : progress.counts.known + progress.counts.learning === 0
            ? "Nothing to review yet. Words you learn will come back here at the right time."
            : "All reviews done for today.",
      action: s.due.length > 0 ? { label: `Review ${s.due.length}`, run: () => onReview(s.due) } : null,
    },
    {
      key: "learn",
      icon: <BookOpen className="size-[18px]" />,
      title: "Learn new words",
      done: allSeen || newLeft === 0,
      text: allSeen
        ? "You've studied all 333 words. Keep up the reviews!"
        : newLeft === 0
          ? `Daily goal reached: ${progress.counts.newToday} new words today.`
          : `${progress.counts.newToday} of ${goal} today. Say the meaning out loud before you flip each card.`,
      action:
        !allSeen && newLeft > 0
          ? { label: `Learn ${Math.min(newLeft, progress.counts.new)}`, run: () => onLearn(Math.min(newLeft, progress.counts.new)) }
          : null,
    },
    {
      key: "test",
      icon: <ClipboardCheck className="size-[18px]" />,
      title: "Test today's words",
      done: testedToday && s.learnedToday.length > 0,
      text:
        s.learnedToday.length === 0
          ? "Learn some new words first, then test yourself on them."
          : testedToday
            ? "Done! Testing yourself is what locks words in."
            : `Recall the ${s.learnedToday.length} ${s.learnedToday.length === 1 ? "word" : "words"} you learned today, without looking.`,
      action:
        s.learnedToday.length > 0
          ? { label: testedToday ? "Test again" : "Start test", run: () => onTest(s.learnedToday, "today") }
          : null,
    },
  ];
  const current = steps.findIndex((st) => !st.done);
  const allDone = current === -1;

  const studied = s.longTerm + s.stronger + s.learning;
  const pct = (n: number) => `${(n / WORDS.length) * 100}%`;

  return (
    <div className="flex flex-col gap-4">
      {/* Daily plan */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Today's plan</h2>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs tabular-nums text-muted-foreground">
            {steps.filter((st) => st.done).length}/3 done
          </span>
        </div>

        <ol className="mt-4 flex flex-col gap-2.5">
          {steps.map((st, i) => {
            const active = i === current;
            return (
              <li
                key={st.key}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-lg border p-3.5 transition sm:flex-nowrap",
                  active ? "border-primary/50 bg-accent-soft/50" : "border-border",
                  st.done && "bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full",
                    st.done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {st.done ? <Check className="size-[18px]" strokeWidth={3} /> : st.icon}
                </span>
                <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-3rem)]">
                  <p className={cn("text-[15px] font-medium", st.done && "text-muted-foreground")}>
                    <span className="sr-only">{st.done ? "Done: " : ""}</span>
                    {i + 1}. {st.title}
                  </p>
                  <p className="text-[13px] leading-snug text-muted-foreground">{st.text}</p>
                </div>
                {st.action && (
                  <Button
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={st.action.run}
                    className="ml-12 shrink-0 sm:ml-0"
                  >
                    {st.action.label}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>

        {allDone && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-card-back px-3 py-2.5 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Great work today! Sleep helps your brain store what you learned. See you tomorrow for your reviews.
            </span>
          </p>
        )}
      </section>

      {/* Memory strength */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Brain className="size-[18px] text-primary" />
          <h2 className="text-[15px] font-semibold tracking-tight">Memory strength</h2>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
          {s.longTerm}
          <span className="text-lg font-medium text-muted-foreground"> / {WORDS.length}</span>
        </p>
        <p className="text-sm text-muted-foreground">words in long-term memory</p>

        <div
          className="mt-4 flex h-3 overflow-hidden rounded-full bg-mist/70 dark:bg-muted"
          role="img"
          aria-label={`${s.longTerm} long-term, ${s.stronger} getting stronger, ${s.learning} learning`}
        >
          <div className="h-full bg-known transition-[width] duration-700" style={{ width: pct(s.longTerm) }} />
          <div className="h-full bg-known/45 transition-[width] duration-700" style={{ width: pct(s.stronger) }} />
          <div className="h-full bg-learning transition-[width] duration-700" style={{ width: pct(s.learning) }} />
        </div>

        <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-3">
          <Strength color="bg-known" label="Long-term" value={s.longTerm} hint="remembered after a 2+ week gap" />
          <Strength color="bg-known/45" label="Getting stronger" value={s.stronger} hint="you know it; reviews keep going" />
          <Strength color="bg-learning" label="Learning" value={s.learning} hint="still forgetting sometimes" />
        </dl>
        {studied > 0 && s.longTerm === 0 && (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Words move to long-term after you remember them at the 3, 7 and 16-day reviews. Keep doing your daily reviews!
          </p>
        )}
      </section>

      {/* Make it stick */}
      <section className="rounded-xl border border-border bg-card-back p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Make it stick</h2>
        <ul className="mt-3 flex flex-col gap-3 text-sm">
          <Tip icon={<Repeat className="size-4" />} title="Recall before you look">
            Say the meaning out loud before flipping a card. If you hesitated, choose “Still learning”.
          </Tip>
          <Tip icon={<BookText className="size-4" />} title="Read all three sentences">
            Each card has an easy, a medium and a GRE-level sentence. Underlined words are other GRE words: tap
            them to review those too.
          </Tip>
          <Tip icon={<ClipboardCheck className="size-4" />} title="Test the whole week">
            Once a week, test every word you learned in the last 7 days.
            {s.lastWeek.length > 0 && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => onTest(s.lastWeek)}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Test {s.lastWeek.length} words →
                </button>
              </>
            )}
          </Tip>
        </ul>
      </section>
    </div>
  );
}

function Strength({ color, label, value, hint }: { color: string; label: string; value: number; hint: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", color)} />
      <div>
        <dt className="text-foreground">
          {label} <span className="font-medium tabular-nums">{value}</span>
        </dt>
        <dd className="text-muted-foreground">{hint}</dd>
      </div>
    </div>
  );
}

function Tip({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-card text-primary">{icon}</span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}
