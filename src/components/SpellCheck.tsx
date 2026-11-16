import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Keyboard, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { speak, type Word } from "@/lib/words";

/**
 * "I know it" must be earned: type the word from memory.
 * Two tries. Right → known. Wrong twice → the spelling is shown and the word stays in Learning.
 */
export function SpellCheck({
  word,
  onResult,
  onCancel,
}: {
  word: Word;
  onResult: (correct: boolean) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [tries, setTries] = useState(0);
  const [state, setState] = useState<"typing" | "retry" | "right" | "wrong">("typing");
  const inputRef = useRef<HTMLInputElement>(null);
  const target = word.word.toLowerCase();
  const done = state === "right" || state === "wrong";

  useEffect(() => {
    inputRef.current?.focus();
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !done) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, onCancel]);

  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  // After a right answer, move on by itself after a short moment.
  useEffect(() => {
    if (state !== "right") return;
    const t = window.setTimeout(() => resultRef.current(true), 900);
    return () => window.clearTimeout(t);
  }, [state]);

  const check = () => {
    const guess = value.trim().toLowerCase();
    if (!guess || done) return;
    if (guess === target) return setState("right");
    const n = tries + 1;
    setTries(n);
    if (n >= 2) setState("wrong");
    else {
      setState("retry");
      setValue("");
    }
  };

  return (
    <div className="animate-card-in rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(60,60,50,0.18)] sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Keyboard className="size-3.5" /> Spell it to prove you know it
        </p>
        <button
          type="button"
          onClick={() => speak(word.word)}
          aria-label="Hear the word"
          title="Hear the word"
          className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Volume2 className="size-[18px]" />
        </button>
      </div>

      <p className="mt-2 text-xl font-medium leading-snug sm:text-2xl">{word.en}</p>
      <p lang="bn" className="mt-1.5 font-bangla text-xl font-medium text-primary">
        {word.bn}
      </p>
      <p className="mt-2 font-mono text-[13px] text-muted-foreground">
        {word.pos} · starts with “{word.word[0].toUpperCase()}” · {word.word.length} letters
      </p>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (state === "wrong") onResult(false);
          else check();
        }}
      >
        <Input
          ref={inputRef}
          value={done ? (state === "right" ? word.word : value) : value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={done}
          placeholder="Type the word…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Type the word"
          className={cn(
            "h-12 text-lg tracking-wide",
            state === "right" && "border-primary bg-accent-soft",
            state === "wrong" && "border-stone bg-muted line-through decoration-stone/60",
            state === "retry" && "border-stone",
          )}
        />

        <div aria-live="polite" className="mt-3 min-h-6 text-[15px]">
          {state === "retry" && (
            <p className="flex items-center gap-1.5">
              <X className="size-4 text-muted-foreground" /> Not quite. Try once more.
            </p>
          )}
          {state === "right" && (
            <p className="flex items-center gap-1.5 font-medium text-primary">
              <Check className="size-4" /> Correct! Marked as known.
            </p>
          )}
          {state === "wrong" && (
            <div>
              <p>
                The spelling is <span className="font-semibold tracking-wide text-primary">{word.word}</span>.
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                It stays in Learning and will come back tomorrow.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          {!done && (
            <>
              <Button type="button" variant="ghost" onClick={onCancel}>
                <ArrowLeft /> Back to card
              </Button>
              <Button type="submit" className="flex-1" disabled={!value.trim()}>
                Check
              </Button>
            </>
          )}
          {state === "wrong" && (
            <Button type="submit" className="flex-1">
              Continue
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
