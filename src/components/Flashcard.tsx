import { Star, Volume2 } from "lucide-react";
import type { Entry } from "@/lib/progress";
import { speak, type Word } from "@/lib/words";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function Highlight({ sentence, word }: { sentence: string; word: string }) {
  const stem = word.slice(0, Math.max(4, word.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b(${stem}\\w*)`, "i").exec(sentence);
  if (!match) return <>{sentence}</>;
  const start = match.index;
  const end = start + match[0].length;
  return (
    <>
      {sentence.slice(0, start)}
      <mark className="rounded-[4px] bg-accent-soft px-1 font-medium text-primary">{sentence.slice(start, end)}</mark>
      {sentence.slice(end)}
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
}: {
  word: Word;
  entry: Entry;
  flipped: boolean;
  onFlip: () => void;
  onStar: () => void;
}) {
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

  return (
    <div className="flip-scene h-[420px] sm:h-[390px]">
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
          className={cn("flip-face flex flex-col rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(60,60,50,0.18)] sm:p-7", flipped && "pointer-events-none")}
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
            "flip-face flip-back flex flex-col rounded-xl border border-border bg-card-back p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(60,60,50,0.18)] sm:p-7",
            !flipped && "pointer-events-none",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pt-1">
              <h3 className="truncate text-2xl font-semibold tracking-tight text-card-foreground">{word.word}</h3>
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{word.pos}</span>
            </div>
            {actions}
          </div>

          <div className="mt-4 flex flex-1 flex-col gap-4">
            <section>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Meaning</p>
              <p className="mt-1.5 text-xl font-medium leading-snug text-card-foreground">{word.en}</p>
            </section>

            <section>
              <p lang="bn" className="font-bangla text-[13px] font-medium text-muted-foreground">বাংলা অর্থ</p>
              <p lang="bn" className="mt-1.5 font-bangla text-[22px] font-medium leading-snug text-primary">
                {word.bn}
              </p>
            </section>

            <section className="mt-auto rounded-lg border border-border-strong/40 bg-card/60 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">In a sentence</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-card-foreground">
                <Highlight sentence={word.example} word={word.word} />
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
