import { useEffect, useState } from "react";
import { BookOpen, ClipboardCheck, Flame, Layers, List, Moon, RotateCcw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StudyView, loadSession, type Session } from "@/components/StudyView";
import { WordList } from "@/components/WordList";
import { QuizView } from "@/components/QuizView";
import { useProgress } from "@/lib/progress";
import { SyncDialog } from "@/components/SyncDialog";
import { readJSON, writeJSON } from "@/lib/storage";
import { WORDS } from "@/lib/words";
import { cn } from "@/lib/utils";

type Tab = "study" | "quiz" | "list";

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
  const progress = useProgress();
  const [dark, setDark] = useTheme();
  const [tab, setTab] = useState<Tab>(() => readJSON<Tab>("gre333.tab", "study"));
  const [session, setSession] = useState<Session>(loadSession);
  const { counts } = progress;

  useEffect(() => writeJSON("gre333.tab", tab), [tab]);

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
          <SyncDialog progress={progress} />
          <Button variant="ghost" size="icon-sm" aria-label="Toggle dark mode" onClick={() => setDark(!dark)}>
            {dark ? <Sun /> : <Moon />}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Reset progress" title="Reset progress">
                <RotateCcw />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Reset all progress?</DialogTitle>
              <DialogDescription>
                This marks all {counts.total} words as new, removes your stars and clears your streak on every device that uses your sync code. You can't undo this.
              </DialogDescription>
              <div className="mt-6 flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    onClick={() => {
                      progress.reset();
                      setSession(loadSessionFresh());
                    }}
                  >
                    Reset progress
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Stats */}
      <section className="mt-4 rounded-xl border border-border bg-card p-4 sm:mt-5 sm:p-5">
        <div className="flex items-end justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">Words you know</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
              {counts.known}
              <span className="text-lg font-medium text-muted-foreground sm:text-xl"> / {counts.total}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <StatTile icon={<Layers className="size-3.5" />} label="Today" value={progress.today} />
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
        </div>
      </section>

      {/* Tabs */}
      <nav className="mt-4 grid sm:mt-5 grid-cols-3 rounded-full border border-border bg-card p-1" role="tablist">
        {(
          [
            ["study", "Flashcards", <BookOpen key="i" className="size-4 max-[400px]:hidden" />],
            ["quiz", "Quiz", <ClipboardCheck key="i" className="size-4 max-[400px]:hidden" />],
            ["list", "Word list", <List key="i" className="size-4 max-[400px]:hidden" />],
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-full text-sm font-medium transition sm:h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === key ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      <main className={cn("mt-4 sm:mt-5", tab === "study" && "pb-24 sm:pb-0")}>
        <div hidden={tab !== "study"}>
          <StudyView progress={progress} session={session} setSession={setSession} active={tab === "study"} />
        </div>
        <div hidden={tab !== "quiz"}>
          <QuizView progress={progress} active={tab === "quiz"} />
        </div>
        {tab === "list" && <WordList progress={progress} onOpen={openWord} />}
      </main>
    </div>
  );
}

function loadSessionFresh(): Session {
  return { filter: "all", shuffle: false, deck: WORDS.map((w) => w.id), index: 0 };
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
