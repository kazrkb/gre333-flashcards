import { BookOpen, ClipboardCheck, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GROUPS } from "@/data/groups";
import { cn } from "@/lib/utils";
import { WORD_BY_ID } from "@/lib/words";
import type { useProgress } from "@/lib/progress";

type Progress = ReturnType<typeof useProgress>;

const DOT: Record<string, string> = { known: "bg-known", learning: "bg-learning", new: "bg-new" };

export function GroupsView({
  progress,
  onStudy,
  onQuiz,
  onOpenWord,
}: {
  progress: Progress;
  onStudy: (title: string, ids: string[]) => void;
  onQuiz: (ids: string[], title: string) => void;
  onOpenWord: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());

  const groups = useMemo(() => {
    if (!q) return GROUPS;
    return GROUPS.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.bn.includes(q) ||
        [...g.words, ...(g.opposite ?? [])].some((id) => id.includes(q)),
    );
  }, [q]);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-border bg-card-back p-4 text-sm leading-relaxed">
        <p className="font-medium">Learn words in families</p>
        <p className="mt-1 text-muted-foreground">
          The GRE often asks for <b className="font-medium text-foreground">two words that mean the same thing</b>. Words in
          each group share a meaning, so learning them together makes those questions much easier. Try{" "}
          <b className="font-medium text-foreground">GRE: pick 2</b> in the Quiz tab to practice.
        </p>
      </section>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search groups or words…"
          className="pl-10"
          aria-label="Search groups"
        />
      </div>

      {groups.length === 0 && (
        <p className="rounded-xl border border-dashed border-border-strong/60 bg-card/50 p-10 text-center text-[15px] text-muted-foreground">
          No groups match “{query}”.
        </p>
      )}

      <div className="grid gap-3">
        {groups.map((g) => {
          const known = g.words.filter((id) => progress.get(id).status === "known").length;
          return (
            <section key={g.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[17px] font-semibold tracking-tight">{g.title}</h3>
                  <p lang="bn" className="font-bangla text-[15px] text-primary">
                    {g.bn}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {known}/{g.words.length} known
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.words.map((id) => (
                  <WordChip key={id} id={id} status={progress.get(id).status} onClick={() => onOpenWord(id)} />
                ))}
              </div>

              {g.opposite && g.opposite.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Opposite</span>
                  {g.opposite.map((id) => (
                    <WordChip key={id} id={id} status={progress.get(id).status} onClick={() => onOpenWord(id)} muted />
                  ))}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onStudy(g.title, g.words)}>
                  <BookOpen /> Study
                </Button>
                <Button variant="outline" size="sm" onClick={() => onQuiz(g.words, g.title)}>
                  <ClipboardCheck /> Quiz me
                </Button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function WordChip({ id, status, onClick, muted }: { id: string; status: string; onClick: () => void; muted?: boolean }) {
  const w = WORD_BY_ID.get(id);
  if (!w) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={w.en}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        muted ? "border-dashed border-border text-muted-foreground" : "border-border bg-background/60",
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[status])} />
      {w.word}
    </button>
  );
}
