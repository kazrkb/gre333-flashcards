import { useDeferredValue, useMemo, useState } from "react";
import { ChevronRight, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { WORDS } from "@/lib/words";
import type { useProgress } from "@/lib/progress";

type Progress = ReturnType<typeof useProgress>;

const DOT: Record<string, string> = { known: "bg-known", learning: "bg-learning", new: "bg-new" };

export function WordList({ progress, onOpen }: { progress: Progress; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());

  const groups = useMemo(() => {
    const list = q
      ? WORDS.filter((w) => w.word.toLowerCase().includes(q) || w.en.toLowerCase().includes(q) || w.bn.includes(q))
      : WORDS;
    const map = new Map<string, typeof WORDS>();
    for (const w of list) {
      const letter = w.word[0].toUpperCase();
      map.set(letter, [...(map.get(letter) ?? []), w]);
    }
    return [...map.entries()];
  }, [q]);

  const total = groups.reduce((n, [, ws]) => n + ws.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in English or বাংলা…"
          className="pl-10"
          aria-label="Search words"
        />
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong/60 bg-card/50 p-10 text-center text-[15px] text-muted-foreground">
          No words match “{query}”.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {groups.map(([letter, ws]) => (
            <section key={letter}>
              <h3 className="sticky top-0 z-10 border-b border-border bg-muted/90 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground backdrop-blur sm:px-5">
                {letter} <span className="text-muted-foreground/60">· {ws.length}</span>
              </h3>
              <ul>
                {ws.map((w) => {
                  const e = progress.get(w.id);
                  return (
                    <li key={w.id} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => onOpen(w.id)}
                        className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none sm:px-5"
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", DOT[e.status])} title={e.status} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{w.word}</span>
                            {e.starred && <Star className="size-3.5 fill-primary text-primary" aria-label="Starred" />}
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                            {w.en} · <span lang="bn" className="font-bangla">{w.bn}</span>
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
