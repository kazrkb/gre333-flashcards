import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Lightbulb, Star, Volume2, X } from "lucide-react";
import type { Entry } from "@/lib/progress";
import { speak, stemRegex, WORD_BY_ID, wordForForm, type Word } from "@/lib/words";
import { GROUPS } from "@/data/groups";
import PRON_DATA from "@/data/pron.json";

/** British pronunciation guide per word: learner respelling (stress in capitals) and IPA. */
const PRON = PRON_DATA as Record<string, { r: string; ipa: string }>;
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const LEVELS = ["Easy", "Medium", "GRE level"];

/**
 * Keep the whole card in view: center it on screen when it appears and after each flip.
 * If it's taller than the space available (small phones), align its top just below the top of the screen.
 */
function useCenterOnScreen(ref: React.RefObject<HTMLDivElement | null>, flipped: boolean, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const t = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const bottomBar = window.innerWidth < 640 ? 88 : 76; // answer buttons: pinned at the bottom on phones, just below the card on larger screens
      const visible = window.innerHeight - bottomBar;
      const offset = r.height < visible - 24 ? (visible - r.height) / 2 : 12;
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top - offset), behavior: "smooth" });
    }, 120); // after the flip has started, so the new height is known
    return () => window.clearTimeout(t);
  }, [ref, flipped, active]);
}


/** Near-synonyms and opposites from the synonym families (the GRE often tests these together). */
function relatedWords(id: string) {
  const groups = GROUPS.filter((g) => g.words.includes(id));
  const similar = [...new Set(groups.flatMap((g) => g.words))].filter((x) => x !== id);
  const opposite = [...new Set(groups.flatMap((g) => g.opposite ?? []))].filter((x) => x !== id && !similar.includes(x));
  const toWords = (ids: string[]) => ids.map((x) => WORD_BY_ID.get(x)).filter((w): w is Word => !!w);
  return { similar: toWords(similar), opposite: toWords(opposite) };
}

function WordChips({ label, words, onPeek }: { label: string; words: Word[]; onPeek: (w: Word) => void }) {
  if (!words.length) return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[14px]">
      <span className="mr-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      {words.map((w, i) => (
        <span key={w.id}>
          <button
            type="button"
            title={`${w.word}: ${w.en}`}
            onClick={(e) => {
              e.stopPropagation();
              onPeek(w);
            }}
            className="cursor-help font-medium underline decoration-primary/60 decoration-dotted decoration-2 underline-offset-[3px] hover:decoration-primary focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {w.word.toLowerCase()}
          </button>
          {i < words.length - 1 && <span className="text-muted-foreground">,</span>}
        </span>
      ))}
    </p>
  );
}

/** Highlight the card's own word inside a piece of text. */
function HighlightTarget({ text, word }: { text: string; word: string }) {
  const match = stemRegex(word).exec(text);
  if (!match) return <>{text}</>;
  const start = match.index;
  const end = start + match[0].length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-[4px] bg-accent-soft px-1 font-medium text-primary">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

/** A sentence where {braced} words are other GRE words you can tap to see their meaning. */
function Sentence({ text, word, onPeek }: { text: string; word: string; onPeek: (w: Word) => void }) {
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!part.startsWith("{")) return <HighlightTarget key={i} text={part} word={word} />;
        const form = part.slice(1, -1);
        const other = wordForForm(form);
        if (!other) return <span key={i}>{form}</span>;
        return (
          <button
            key={i}
            type="button"
            title={`${other.word}: ${other.en}`}
            onClick={(e) => {
              e.stopPropagation();
              onPeek(other);
            }}
            className="cursor-help font-medium text-card-foreground underline decoration-primary/60 decoration-dotted decoration-2 underline-offset-[3px] hover:decoration-primary focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {form}
          </button>
        );
      })}
    </>
  );
}

function StatusBadge({ status }: { status: Entry["status"] }) {
  if (status === "known")
    return (
      <Badge variant="known">
        <span className="size-1.5 rounded-full bg-known" /> Known
      </Badge>
    );
  if (status === "learning")
    return (
      <Badge variant="learning">
        <span className="size-1.5 rounded-full bg-learning" /> Learning
      </Badge>
    );
  return (
    <Badge variant="outline">
      <span className="size-1.5 rounded-full bg-new" /> New
    </Badge>
  );
}

function IconAction({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid size-10 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        active && "text-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

export function Flashcard({
  word,
  entry,
  flipped,
  onFlip,
  onStar,
  active = true,
}: {
  /** False while the Cards tab is hidden (then it can't be measured or centered). */
  active?: boolean;
  word: Word;
  entry: Entry;
  flipped: boolean;
  onFlip: () => void;
  onStar: () => void;
}) {
  const [peek, setPeek] = useState<Word | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  useCenterOnScreen(sceneRef, flipped, active);
  const related = useMemo(() => relatedWords(word.id), [word.id]);
  const [openBn, setOpenBn] = useState<Set<number>>(new Set());
  const toggleBn = (i: number) =>
    setOpenBn((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const actions = (
    <div className="flex items-center gap-0.5">
      <IconAction label="Pronounce (P)" onClick={() => speak(word.word)}>
        <Volume2 className="size-[18px]" />
      </IconAction>
      <IconAction label={entry.starred ? "Remove star (S)" : "Star this word (S)"} onClick={onStar} active={entry.starred}>
        <Star className={cn("size-[18px]", entry.starred && "fill-current")} />
      </IconAction>
    </div>
  );

  const shadow = "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(60,60,50,0.18)]";

  return (
    <div className="flip-scene" ref={sceneRef}>
      <div
        role="button"
        tabIndex={0}
        aria-label={flipped ? "Show word" : "Show meaning"}
        onClick={onFlip}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target === e.currentTarget) onFlip();
        }}
        className={cn(
          "flip-inner cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
          flipped && "is-flipped",
        )}
      >
        {/* Front */}
        <div
          aria-hidden={flipped}
                    className={cn(
            "flip-face flex min-h-[340px] flex-col rounded-xl border border-border bg-card p-5 sm:min-h-[380px] sm:p-7",
            shadow,
            flipped && "pointer-events-none",
          )}
        >
          <div className="flex items-start justify-between">
            <StatusBadge status={entry.status} />
            {actions}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{word.pos}</span>
            <h2 className="mt-3 max-w-full break-words text-[2.75rem] font-semibold leading-tight tracking-tight text-card-foreground sm:text-6xl">
              {word.word}
            </h2>
            {PRON[word.id] && (
              <p className="mt-2 text-lg text-muted-foreground" title="British pronunciation">
                <span className="font-medium text-card-foreground/80">{PRON[word.id].r}</span>
                <span className="ml-2 font-mono text-[15px]">{PRON[word.id].ipa}</span>
              </p>
            )}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            <span className="pointer-coarse:hidden">Click the card to see the meaning</span>
            <span className="hidden pointer-coarse:inline">Tap to see the meaning · swipe for next</span>
          </p>
        </div>

        {/* Back */}
        <div
          aria-hidden={!flipped}
          className={cn(
            "flip-face flip-back flex flex-col rounded-xl border border-border bg-card-back p-4 sm:px-6 sm:py-5",
            shadow,
            !flipped && "pointer-events-none",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pt-1">
              <h3 className="truncate text-2xl font-semibold tracking-tight text-card-foreground">{word.word}</h3>
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{word.pos}</span>
              {PRON[word.id] && (
                <span className="ml-2 text-[13px] text-muted-foreground" title="British pronunciation">
                  · <span className="font-medium text-card-foreground/80">{PRON[word.id].r}</span>{" "}
                  <span className="font-mono">{PRON[word.id].ipa}</span>
                </span>
              )}
            </div>
            {actions}
          </div>

          <div className="mt-3 flex flex-1 flex-col gap-3">
            <section>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Meaning</p>
              <p className="mt-1 text-lg font-medium leading-snug text-card-foreground sm:mt-1.5 sm:text-xl">{word.en}</p>
            </section>

            <section>
              <p lang="bn" className="font-bangla text-[13px] font-medium text-muted-foreground">বাংলা অর্থ</p>
              <p lang="bn" className="mt-1 font-bangla text-[19px] font-medium leading-snug text-primary sm:mt-1.5 sm:text-[22px]">
                {word.bn}
              </p>
            </section>

            {(related.similar.length > 0 || related.opposite.length > 0) && (
              <section className="flex flex-col gap-1">
                <WordChips label="Similar" words={related.similar} onPeek={setPeek} />
                <WordChips label="Opposite" words={related.opposite} onPeek={setPeek} />
              </section>
            )}

            <section className="rounded-lg border border-border-strong/40 bg-card/60 p-3 sm:p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">In sentences</p>
              <ol className="mt-2 flex flex-col gap-2 sm:gap-2.5">
                {word.sentences.map((s, i) => {
                  const bn = word.bnSentences?.[i];
                  const open = openBn.has(i);
                  return (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className={cn(
                        "mt-[3px] grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-medium",
                        i === 0 ? "bg-muted text-muted-foreground" : i === 1 ? "bg-accent-soft text-primary" : "bg-primary text-primary-foreground",
                      )}
                      title={LEVELS[i]}
                      aria-label={LEVELS[i]}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] leading-snug text-card-foreground sm:text-[15px] sm:leading-relaxed">
                        <Sentence text={s} word={word.word} onPeek={setPeek} />
                      </p>
                      {bn && open && (
                        <p
                          lang="bn"
                          id={`bn-${word.id}-${i}`}
                          className="mt-1 animate-card-in rounded-md bg-card-back px-2.5 py-1.5 font-bangla text-[15px] leading-relaxed text-card-foreground"
                        >
                          {bn}
                        </p>
                      )}
                    </div>
                    {bn && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBn(i);
                        }}
                        aria-expanded={open}
                        aria-controls={`bn-${word.id}-${i}`}
                        aria-label={open ? "Hide Bangla meaning" : "Show Bangla meaning"}
                        title={open ? "Hide Bangla meaning" : "বাংলা অর্থ দেখুন"}
                        className={cn(
                          "grid size-8 shrink-0 place-items-center self-start rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          open && "bg-muted text-foreground",
                        )}
                      >
                        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
                      </button>
                    )}
                  </li>
                  );
                })}
              </ol>

              {peek ? (
                <div
                  className="mt-3 flex items-start justify-between gap-2 rounded-md bg-card-back px-3 py-2 text-[13px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>
                    <span className="font-semibold">{peek.word}</span> — {peek.en} ·{" "}
                    <span lang="bn" className="font-bangla text-primary">
                      {peek.bn}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setPeek(null)}
                    className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-muted-foreground">
                  <span className="pointer-coarse:hidden">Click</span>
                  <span className="hidden pointer-coarse:inline">Tap</span> an underlined word to see its meaning.
                </p>
              )}

              {word.tip && (
                <p className="mt-3 flex gap-2 border-t border-border-strong/30 pt-3 text-[13px] leading-snug text-muted-foreground">
                  <Lightbulb className="mt-px size-3.5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="sr-only">Memory tip: </span>
                    {word.tip}
                  </span>
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
