import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownAZ, ArrowLeft, ArrowRight, CalendarCheck, Check, PartyPopper, RotateCcw, Shuffle, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Flashcard } from "@/components/Flashcard";
import { SpellCheck } from "@/components/SpellCheck";
import { cn } from "@/lib/utils";
import { readJSON, writeJSON } from "@/lib/storage";
import { speak, WORD_BY_ID, WORDS } from "@/lib/words";
import { isDue, localDay, type useProgress } from "@/lib/progress";

export type Filter = "all" | "due" | "new" | "learning" | "known" | "weak" | "starred" | "custom";

/** `title` is set when studying a custom deck (e.g. a word group). */
export type Session = { filter: Filter; shuffle: boolean; deck: string[]; index: number; title?: string };

const K_SESSION = "gre333.session.v2";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "due", label: "Review" },
  { key: "new", label: "New" },
  { key: "learning", label: "Learning" },
  { key: "known", label: "Known" },
  { key: "weak", label: "Weak" },
  { key: "starred", label: "Starred" },
];

type Progress = ReturnType<typeof useProgress>;

export function buildDeck(filter: Filter, shuffle: boolean, p: Progress): string[] {
  const today = localDay();
  const ids = WORDS.filter((w) => {
    const e = p.get(w.id);
    if (filter === "all") return true;
    if (filter === "starred") return e.starred;
    if (filter === "due") return isDue(e, today);
    if (filter === "weak") return e.misses > 0;
    return e.status === filter;
  }).map((w) => w.id);
  if (filter === "weak") ids.sort((a, b) => p.get(b).misses - p.get(a).misses);
  return shuffle ? shuffled(ids) : ids;
}

export function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Start state: new words in random order (alphabetical order puts look-alike words next to each other). */
export function freshSession(): Session {
  return { filter: "new", shuffle: true, deck: shuffled(WORDS.map((w) => w.id)), index: 0 };
}

export function loadSession(p: Progress): Session {
  const s = readJSON<Session | null>(K_SESSION, null);
  if (s && Array.isArray(s.deck) && s.deck.every((id) => WORD_BY_ID.has(id))) return s;
  const deck = buildDeck("new", true, p);
  return deck.length ? { filter: "new", shuffle: true, deck, index: 0 } : { filter: "all", shuffle: true, deck: buildDeck("all", true, p), index: 0 };
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
  /** "I know it" opens a spelling check; only a correct spelling counts as known. */
  const [spelling, setSpelling] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const { deck, index, filter, shuffle } = session;
  const id = deck[index];
  const word = id ? WORD_BY_ID.get(id) : undefined;
  const done = deck.length > 0 && index >= deck.length;

  useEffect(() => writeJSON(K_SESSION, session), [session]);
  useEffect(() => {
    setFlipped(false);
    setSpelling(false);
  }, [index, deck]);

  const go = useCallback(
    (to: number) => setSession({ ...session, index: Math.max(0, Math.min(to, deck.length)) }),
    [session, setSession, deck.length],
  );

  const rebuild = (f: Filter, sh: boolean) =>
    setSession({ filter: f, shuffle: sh, deck: buildDeck(f, sh, progress), index: 0 });

  const mark = useCallback(
    (correct: boolean) => {
      if (!id) return;
      progress.grade(id, correct);
      // In a review session, a missed card comes back once at the end.
      if (!correct && filter === "due" && deck.indexOf(id, index + 1) === -1) {
        setSession({ ...session, deck: [...deck, id], index: index + 1 });
      } else go(index + 1);
    },
    [id, progress, go, index, filter, deck, session, setSession],
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (done || !id || spelling) return; // the spelling check handles its own keys
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "1") mark(false);
      else if (e.key === "2") setSpelling(true);
      else if (e.key.toLowerCase() === "s") progress.toggleStar(id);
      else if (e.key.toLowerCase() === "p" && word) speak(word.word);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, done, id, index, go, mark, progress, word, spelling]);

  const learningCount = progress.counts.learning;
  const pct = deck.length ? Math.round((Math.min(index, deck.length) / deck.length) * 100) : 0;

  const emptyText = useMemo(() => {
    if (filter === "starred") return "No starred words yet. Tap the star on any card to save it here.";
    if (filter === "learning") return "No words in “Learning” yet. Cards you mark “Still learning” show up here.";
    if (filter === "known") return "No known words yet. Mark cards with “I know it” and they’ll collect here.";
    if (filter === "new") return "You’ve seen every word. Nice work!";
    if (filter === "due") return "Nothing to review today. Come back tomorrow, or learn some new words!";
    if (filter === "weak") return "No weak words yet. Words you get wrong will collect here so you can practice them.";
    return "No words to show.";
  }, [filter]);

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_88%,transparent)] pr-6">
          {FILTERS.map((f) => {
            const n = f.key === "due" ? progress.counts.due : f.key === "weak" ? progress.counts.weak : 0;
            return (
            <button
              key={f.key}
              type="button"
              onClick={() => rebuild(f.key, shuffle)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] sm:h-8 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === f.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {f.key === "starred" && <Star className="size-3.5" />}
              {f.label}
              {n > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 font-mono text-[10px] tabular-nums",
                    filter === f.key ? "bg-background/20" : f.key === "due" ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {n}
                </span>
              )}
            </button>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => rebuild(filter, !shuffle)}
          title={shuffle ? "Cards are in random order. Tap for A–Z." : "Cards are in A–Z order. Tap to shuffle."}
          aria-label={shuffle ? "Order: shuffled. Switch to A to Z" : "Order: A to Z. Switch to shuffled"}
          className="shrink-0"
        >
          {shuffle ? <Shuffle className="!size-3.5" /> : <ArrowDownAZ className="!size-3.5" />}
          <span className="hidden sm:inline">{shuffle ? "Shuffled" : "A–Z"}</span>
        </Button>
      </div>

      {/* Custom deck title (e.g. a word group) */}
      {filter === "custom" && session.title && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
          <p className="min-w-0 truncate text-sm">
            <span className="text-muted-foreground">Studying: </span>
            <span className="font-medium">{session.title}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => rebuild("all", shuffle)}>
            <X /> Close
          </Button>
        </div>
      )}

      {/* Review reminder */}
      {filter !== "due" && progress.counts.due > 0 && (
        <button
          type="button"
          onClick={() => rebuild("due", true)}
          className="flex items-center gap-3 rounded-xl border border-primary/40 bg-accent-soft/60 px-4 py-3 text-left transition hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <CalendarCheck className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">
              {progress.counts.due} {progress.counts.due === 1 ? "word" : "words"} to review today
            </span>
            <span className="block text-[13px] text-muted-foreground">Reviewing at the right time helps you remember for good.</span>
          </span>
          <span className="shrink-0 text-sm font-medium text-primary">Review →</span>
        </button>
      )}

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
        <div className="animate-card-in flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-border bg-card-back p-8 text-center sm:min-h-[380px]">
          <div className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
            <PartyPopper className="size-6" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">
            {filter === "due" ? "Today's review is done!" : "Round complete!"}
          </h2>
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
      ) : word && spelling ? (
        <SpellCheck
          key={`spell-${word.id}`}
          word={word}
          onResult={(correct) => mark(correct)}
          onCancel={() => setSpelling(false)}
        />
      ) : (
        word && (
          <div
            key={word.id}
            className="animate-card-in"
            onTouchStart={(e) => {
              const t = e.touches[0];
              touch.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              const start = touch.current;
              touch.current = null;
              if (!start) return;
              const t = e.changedTouches[0];
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? index + 1 : index - 1);
            }}
          >
            <Flashcard
              word={word}
              entry={progress.get(word.id)}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
              onStar={() => progress.toggleStar(word.id)}
              active={active}
            />
          </div>
        )
      )}


      {/* Actions */}
      {!done && word && !spelling && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:sticky sm:bottom-0 sm:z-20 sm:border-0 sm:px-0 sm:pb-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" aria-label="Previous card" onClick={() => go(index - 1)} disabled={index === 0}>
            <ArrowLeft />
          </Button>
          <Button variant="outline" size="lg" className="flex-1" onClick={() => mark(false)}>
            <RotateCcw /> Still learning
          </Button>
          <Button size="lg" className="flex-1" onClick={() => setSpelling(true)}>
            <Check /> I know it
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next card" onClick={() => go(index + 1)}>
            <ArrowRight />
          </Button>
        </div>
        </div>
      )}

      <p className="hidden text-center font-mono text-[11px] text-muted-foreground/80 md:block pointer-coarse:hidden">
        <Kbd>Space</Kbd> flip · <Kbd>←</Kbd> <Kbd>→</Kbd> move · <Kbd>1</Kbd> still learning · <Kbd>2</Kbd> know it (spell it) ·{" "}
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
