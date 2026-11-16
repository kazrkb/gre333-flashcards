import { useEffect, useState } from "react";
import { BookOpen, Brain, ChevronDown, ChevronUp, ClipboardCheck, Flame, GraduationCap, List, Lock, Moon, Sun, Target, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StudyView, buildDeck, freshSession, loadSession, shuffled, type Session } from "@/components/StudyView";
import { TodayStrip, longTermCount } from "@/components/TodayView";
import { WordList } from "@/components/WordList";
import { K_TODAY_TEST, QuizView, TODAY_TEST_EVENT } from "@/components/QuizView";
import { GreView } from "@/components/GreView";
import { useWordSmart } from "@/lib/wordSmart";
import { useProgress } from "@/lib/progress";
import { useQuizHistory } from "@/lib/quizHistory";
import { SyncDialog } from "@/components/SyncDialog";
import { readJSON, writeJSON } from "@/lib/storage";
import { WORD_BY_ID, WORDS } from "@/lib/words";
import { cn } from "@/lib/utils";

type Tab = "study" | "quiz" | "gre" | "list";

const GOALS = [5, 10, 15, 20, 25, 30];

function useTheme() {
  const [dark, setDark] = useState<boolean>(() =>
    readJSON<boolean | null>("gre333.dark", null) ?? window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#161614" : "#EDEDF0");
  }, [dark]);
  return [dark, (v: boolean) => (setDark(v), writeJSON("gre333.dark", v))] as const;
}

export default function App() {
  // Bumped when the active word list changes (Word Smart locked ↔ unlocked), so everything recounts.
  const [wordsVersion, setWordsVersion] = useState(0);
  const progress = useProgress(wordsVersion);
  const wordSmart = useWordSmart(progress, () => setWordsVersion((v) => v + 1));
  const quizHistory = useQuizHistory(progress.code);
  const [dark, setDark] = useTheme();
  const [tab, setTab] = useState<Tab>(() => {
    const saved = readJSON<string>("gre333.tab.v3", "study");
    return (["study", "quiz", "gre", "list"] as const).includes(saved as Tab) ? (saved as Tab) : "study";
  });
  const [session, setSession] = useState<Session>(() => loadSession(progress));
  const [statsOpen, setStatsOpen] = useState(false);
  const [goal, setGoalState] = useState<number>(() => readJSON<number>("gre333.goal", 15));
  const [quizRequest, setQuizRequest] = useState<{ ids: string[]; key: number; source?: "today"; title?: string } | null>(null);
  const { counts } = progress;

  useEffect(() => writeJSON("gre333.tab.v3", tab), [tab]);

  // Right after Word Smart unlocks, refill the "New" deck so it includes the new words (only once:
  // if the deck already has Word Smart words, the learner keeps their place).
  useEffect(() => {
    if (!wordSmart.ready || session.filter !== "new") return;
    if (session.deck.some((id) => WORD_BY_ID.get(id)?.deck === "ws")) return;
    setSession({ filter: "new", shuffle: true, deck: buildDeck("new", true, progress), index: 0 });
  }, [wordSmart.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const setGoal = (g: number) => {
    setGoalState(g);
    writeJSON("gre333.goal", g);
  };

  const studyDeck = (title: string, ids: string[]) => {
    setSession({ filter: "custom", title, shuffle: false, deck: ids, index: 0 });
    setTab("study");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const quizWords = (ids: string[], source?: "today", title?: string) => {
    setQuizRequest({ ids, key: Date.now(), source, title: title ?? (source === "today" ? "Today's words" : "Quiz") });
    setTab("quiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reviewDue = (ids: string[]) => {
    setSession({ filter: "due", shuffle: true, deck: shuffled(ids), index: 0 });
    setTab("study");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const learnNew = (count: number) => {
    const fresh = shuffled(WORDS.filter((w) => progress.get(w.id).status === "new").map((w) => w.id)).slice(0, count);
    setSession({ filter: "custom", title: "Today's new words", shuffle: true, deck: fresh, index: 0 });
    setTab("study");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openWord = (id: string) => {
    const deck = WORDS.map((w) => w.id);
    setSession({ filter: "all", shuffle: false, deck, index: deck.indexOf(id) });
    setTab("study");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const knownPct = (counts.known / counts.total) * 100;
  const learningPct = (counts.learning / counts.total) * 100;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-10 pt-5 sm:px-6 sm:pt-6">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary shadow-sm shadow-primary/30">
            <div className="absolute h-[15px] w-[19px] translate-x-[2px] translate-y-[-2px] rounded-[3px] bg-cream/45" />
            <div className="relative h-[15px] w-[19px] translate-x-[-1px] translate-y-[1px] rounded-[3px] bg-cream" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="text-[17px] font-semibold tracking-tight">GRE 333</h1>
            <p className="truncate text-xs text-muted-foreground">Barron's high-frequency words</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SyncDialog
            progress={progress}
            onReset={() => {
              progress.reset();
              wordSmart.relock();
              quizHistory.clear();
              writeJSON(K_TODAY_TEST, null);
              window.dispatchEvent(new Event(TODAY_TEST_EVENT));
              setSession(freshSession());
            }}
          />
          <Button variant="ghost" size="icon-sm" aria-label="Toggle dark mode" onClick={() => setDark(!dark)}>
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      {/* On the Cards tab the stats collapse into one slim line, so the card fits on screen. */}
      {tab === "study" && !statsOpen ? (
        <button
          type="button"
          onClick={() => setStatsOpen(true)}
          className="mt-3 flex w-full items-center gap-x-3 gap-y-1 overflow-hidden rounded-full border border-border bg-card px-4 py-2 text-left text-[13px] text-muted-foreground transition hover:border-border-strong"
          aria-label="Show stats and today's plan"
        >
          <span className="whitespace-nowrap">
            <span className="font-semibold tabular-nums text-foreground">{counts.known}</span>/{counts.total} known
          </span>
          <span className="whitespace-nowrap">
            <Target className="mr-1 inline size-3.5" />
            <span className="tabular-nums text-foreground">{counts.newToday}</span>/{goal}
          </span>
          <span className="whitespace-nowrap">
            <Flame className={cn("mr-1 inline size-3.5", progress.streak > 0 && "text-primary")} />
            <span className="tabular-nums text-foreground">{progress.streak}</span>
          </span>
          {counts.due > 0 && <span className="whitespace-nowrap text-primary">{counts.due} to review</span>}
          <ChevronDown className="ml-auto size-4 shrink-0" />
        </button>
      ) : (
        <>
      <section className="mt-4 rounded-xl border border-border bg-card p-4 sm:mt-5 sm:p-5">
        <div className="flex items-end justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]"><span className="sm:hidden">Known</span><span className="hidden sm:inline">Words you know</span></p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
              {counts.known}
              <span className="text-lg font-medium text-muted-foreground sm:text-xl"> / {counts.total}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <GoalTile done={counts.newToday} goal={goal} remaining={counts.new} onChange={setGoal} />
            <StatTile
              icon={<Flame className={cn("size-3.5", progress.streak > 0 && "text-primary")} />}
              label="Streak"
              value={progress.streak}
            />
          </div>
        </div>

        <div className="mt-3 flex h-2 sm:mt-4 sm:h-2.5 overflow-hidden rounded-full bg-mist/70 dark:bg-muted" role="img" aria-label={`${counts.known} known, ${counts.learning} learning, ${counts.new} new`}>
          <div className="h-full bg-known transition-[width] duration-700" style={{ width: `${knownPct}%` }} />
          <div className="h-full bg-learning transition-[width] duration-700" style={{ width: `${learningPct}%` }} />
        </div>

        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] sm:mt-3 sm:gap-x-5 text-muted-foreground">
          <Legend color="bg-known" label="Known" value={counts.known} />
          <Legend color="bg-learning" label="Learning" value={counts.learning} />
          <Legend color="bg-new" label="New" value={counts.new} />
          <button
            type="button"
            onClick={() => setTab("quiz")}
            title={wordSmart.unlocked ? "Word Smart words are mixed into your study" : "Study all 333 words or pass the unlock test"}
            className="inline-flex items-center gap-1.5 rounded-full hover:text-foreground"
          >
            {wordSmart.unlocked ? <Unlock className="size-3.5 text-primary" /> : <Lock className="size-3.5" />}
            Word Smart{" "}
            <span className="font-medium tabular-nums text-foreground">
              {wordSmart.unlocked ? "on" : `${wordSmart.studied333}/${wordSmart.total333}`}
            </span>
          </button>
          <span
            className="inline-flex items-center gap-1.5 sm:ml-auto"
            title="Words you remembered after a 2+ week gap: they're in long-term memory"
          >
            <Brain className="size-3.5 text-primary" />
            Long-term <span className="font-medium tabular-nums text-foreground">{longTermCount(progress)}</span>
          </span>
        </div>
      </section>

      {/* Today's plan: review → learn → test */}
      <TodayStrip key={`strip-${wordsVersion}`} progress={progress} goal={goal} onReview={reviewDue} onLearn={learnNew} onTest={quizWords} />
          {tab === "study" && (
            <button
              type="button"
              onClick={() => setStatsOpen(false)}
              className="mx-auto mt-2 flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <ChevronUp className="size-3.5" /> Hide
            </button>
          )}
        </>
      )}

      {/* Tabs */}
      <nav className="mt-4 grid sm:mt-5 grid-cols-4 rounded-full border border-border bg-card p-1" role="tablist">
        {(
          [
            ["study", "Cards", <BookOpen key="i" className="size-4 max-sm:hidden" />],
            ["quiz", "Quiz", <ClipboardCheck key="i" className="size-4 max-sm:hidden" />],
            ["gre", "GRE", <GraduationCap key="i" className="size-4 max-sm:hidden" />],
            ["list", "Words", <List key="i" className="size-4 max-sm:hidden" />],
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition sm:h-9 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === key ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      <main key={`main-${wordsVersion}`} className={cn("mt-4 sm:mt-5", tab === "study" && "pb-24 sm:pb-0")}>
        <div hidden={tab !== "study"}>
          <StudyView progress={progress} session={session} setSession={setSession} active={tab === "study"} />
        </div>
        <div hidden={tab !== "quiz"}>
          <QuizView progress={progress} active={tab === "quiz"} request={quizRequest} history={quizHistory} wordSmart={wordSmart} />
        </div>
        <div hidden={tab !== "gre"}>
          <GreView progress={progress} history={quizHistory} active={tab === "gre"} />
        </div>
        {tab === "list" && <WordList progress={progress} onOpen={openWord} />}
      </main>
    </div>
  );
}

function GoalTile({
  done,
  goal,
  remaining,
  onChange,
}: {
  done: number;
  goal: number;
  remaining: number;
  onChange: (g: number) => void;
}) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const frac = Math.min(done / goal, 1);
  const met = done >= goal;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Daily goal: new words learned today"
          className="flex items-center gap-2 rounded-lg bg-muted/70 py-1.5 pl-1.5 pr-2.5 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-2 sm:pl-2 sm:pr-3"
        >
          <svg viewBox="0 0 36 36" className="size-8 shrink-0 -rotate-90 sm:size-9" aria-hidden>
            <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-mist dark:stroke-border-strong" />
            <circle
              cx="18"
              cy="18"
              r={r}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - frac)}
              className="stroke-primary transition-[stroke-dashoffset] duration-700"
            />
          </svg>
          <span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Target className="size-3" /> {met ? "Goal met!" : "New today"}
            </span>
            <span className="block text-lg font-semibold leading-tight tabular-nums">
              {done}
              <span className="text-xs font-medium text-muted-foreground">/{goal}</span>
            </span>
          </span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Daily goal</DialogTitle>
        <DialogDescription>How many new words do you want to learn each day?</DialogDescription>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {GOALS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange(g)}
              aria-pressed={goal === g}
              className={cn(
                "rounded-lg border px-3 py-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                goal === g ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-border-strong",
              )}
            >
              <span className="block text-lg font-semibold tabular-nums">{g}</span>
              <span className={cn("block text-[11px]", goal === g ? "text-background/70" : "text-muted-foreground")}>
                words / day
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 rounded-lg bg-card-back px-3 py-2.5 text-sm">
          {remaining === 0 ? (
            "You've studied every word! Keep up your daily reviews."
          ) : (
            <>
              At <b>{goal}</b> a day you'll finish the remaining <b>{remaining}</b> words in about{" "}
              <b>{Math.ceil(remaining / goal)} days</b>.
            </>
          )}
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Today you've learned {done} new {done === 1 ? "word" : "words"}. Reviews of older words don't count toward this goal.
        </p>
        <div className="mt-5 flex justify-end">
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="min-w-[64px] rounded-lg bg-muted/70 px-2.5 py-1.5 sm:min-w-[78px] sm:px-3 sm:py-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", color)} />
      {label} <span className="font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}
