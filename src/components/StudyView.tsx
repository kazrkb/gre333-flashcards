import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, PartyPopper, RotateCcw, Shuffle, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Flashcard } from "@/components/Flashcard";
import { cn } from "@/lib/utils";
import { readJSON, writeJSON } from "@/lib/storage";
import { speak, WORD_BY_ID, WORDS } from "@/lib/words";
import type { useProgress } from "@/lib/progress";

export type Filter = "all" | "new" | "learning" | "known" | "starred";

export type Session = { filter: Filter; shuffle: boolean; deck: string[]; index: number };

const K_SESSION = "gre333.session.v1";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "learning", label: "Learning" },
  { key: "known", label: "Known" },
  { key: "starred", label: "Starred" },
];

type Progress = ReturnType<typeof useProgress>;

function buildDeck(filter: Filter, shuffle: boolean, p: Progress): string[] {
  let ids = WORDS.filter((w) => {
    const e = p.get(w.id);
    if (filter === "all") return true;
    if (filter === "starred") return e.starred;
    return e.status === filter;
  }).map((w) => w.id);
  if (shuffle) {
    ids = [...ids];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  }
  return ids;
}

export function loadSession(): Session {
  const s = readJSON<Session | null>(K_SESSION, null);
  if (s && Array.isArray(s.deck) && s.deck.every((id) => WORD_BY_ID.has(id))) return s;
  return { filter: "all", shuffle: false, deck: WORDS.map((w) => w.id), index: 0 };
}

export function StudyView({
  progress,
  session,
  setSession,
  active,
}: {
  progress: Progress;
  session: Session;
  setSession: (s: Session) => void;
  active: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const { deck, index, filter, shuffle } = session;
  const id = deck[index];
  const word = id ? WORD_BY_ID.get(id) : undefined;
  const done = deck.length > 0 && index >= deck.length;

  useEffect(() => writeJSON(K_SESSION, session), [session]);
  useEffect(() => setFlipped(false), [index, deck]);

  const go = useCallback(
    (to: number) => setSession({ ...session, index: Math.max(0, Math.min(to, deck.length)) }),
    [session, setSession, deck.length],
  );

  const rebuild = (f: Filter, sh: boolean) =>
    setSession({ filter: f, shuffle: sh, deck: buildDeck(f, sh, progress), index: 0 });

  const mark = useCallback(
    (status: "known" | "learning") => {
      if (!id) return;
      progress.setStatus(id, status);
      go(index + 1);
    },
    [id, progress, go, index],
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (done || !id) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "1") mark("learning");
      else if (e.key === "2") mark("known");
      else if (e.key.toLowerCase() === "s") progress.toggleStar(id);
      else if (e.key.toLowerCase() === "p" && word) speak(word.word);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, done, id, index, go, mark, progress, word]);

  const learningCount = progress.counts.learning;
  const pct = deck.length ? Math.round((Math.min(index, deck.length) / deck.length) * 100) : 0;

  const emptyText = useMemo(() => {
    if (filter === "starred") return "No starred words yet. Tap the star on any card to save it here.";
    if (filter === "learning") return "No words in “Learning” yet. Cards you mark “Still learning” show up here.";
    if (filter === "known") return "No known words yet. Mark cards with “I know it” and they’ll collect here.";
    if (filter === "new") return "You’ve seen every word. Nice work!";
    return "No words to show.";
  }, [filter]);

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => rebuild(f.key, shuffle)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === f.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {f.key === "starred" && <Star className="size-3.5" />}
              {f.label}
            </button>
          ))}
        </div>
        <Button
          variant={shuffle ? "dark" : "outline"}
          size="sm"
          onClick={() => rebuild(filter, !shuffle)}
          aria-pressed={shuffle}
          className="shrink-0"
        >
          <Shuffle className="!size-3.5" />
          <span className="hidden sm:inline">Shuffle</span>
        </Button>
      </div>

      {/* Deck progress */}
      {deck.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-mist/70 dark:bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {Math.min(index + 1, deck.length)} / {deck.length}
          </span>
        </div>
      )}

      {/* Card / states */}
      {deck.length === 0 ? (
        <div className="grid h-[300px] place-items-center rounded-xl border border-dashed border-border-strong/60 bg-card/50 p-8 text-center">
          <div>
            <p className="text-[15px] text-muted-foreground">{emptyText}</p>
            <Button variant="outline" className="mt-4" onClick={() => rebuild("all", shuffle)}>
              Study all words
            </Button>
          </div>
        </div>
      ) : done ? (
        <div className="animate-card-in flex h-[440px] flex-col items-center justify-center rounded-xl border border-border bg-card-back p-8 text-center sm:h-[390px]">
          <div className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
            <PartyPopper className="size-6" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">Round complete!</h2>
          <p className="mt-2 max-w-xs text-[15px] text-muted-foreground">
            You went through {deck.length} {deck.length === 1 ? "card" : "cards"}. You know{" "}
            <span className="font-medium text-foreground">{progress.counts.known}</span> of {progress.counts.total} words so far.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {learningCount > 0 && (
              <Button onClick={() => rebuild("learning", true)}>
                <RotateCcw /> Practice learning words ({learningCount})
              </Button>
            )}
            <Button variant="outline" onClick={() => go(0)}>
              Start this deck again
            </Button>
          </div>
        </div>
      ) : (
        word && (
          <div key={word.id} className="animate-card-in">
            <Flashcard
              word={word}
              entry={progress.get(word.id)}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
              onStar={() => progress.toggleStar(word.id)}
            />
          </div>
        )
      )}

      {/* Actions */}
      {!done && word && (
        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" aria-label="Previous card" onClick={() => go(index - 1)} disabled={index === 0}>
            <ArrowLeft />
          </Button>
          <Button variant="outline" size="lg" className="flex-1" onClick={() => mark("learning")}>
            <RotateCcw /> Still learning
          </Button>
          <Button size="lg" className="flex-1" onClick={() => mark("known")}>
            <Check /> I know it
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next card" onClick={() => go(index + 1)}>
            <ArrowRight />
          </Button>
        </div>
      )}

      <p className="hidden text-center font-mono text-[11px] text-muted-foreground/80 md:block">
        <Kbd>Space</Kbd> flip · <Kbd>←</Kbd> <Kbd>→</Kbd> move · <Kbd>1</Kbd> still learning · <Kbd>2</Kbd> know it ·{" "}
        <Kbd>S</Kbd> star · <Kbd>P</Kbd> pronounce
      </p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}
