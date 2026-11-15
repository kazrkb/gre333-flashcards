import { useState } from "react";
import { Check, Cloud, CloudOff, Copy, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { useProgress } from "@/lib/progress";

type Progress = ReturnType<typeof useProgress>;

export function SyncDialog({ progress }: { progress: Progress }) {
  const { sync, code } = progress;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [switched, setSwitched] = useState(false);

  const pill = {
    connecting: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Connecting…", cls: "text-muted-foreground" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving…", cls: "text-muted-foreground" },
    synced: { icon: <Cloud className="size-3.5" />, text: "Saved", cls: "text-muted-foreground" },
    offline: { icon: <CloudOff className="size-3.5" />, text: "Offline", cls: "text-primary" },
  }[sync];

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the code is still visible to copy by hand */
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await progress.switchCode(input);
    setBusy(false);
    if (err) setError(err);
    else {
      setInput("");
      setSwitched(true);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setError(null);
          setSwitched(false);
          if (sync === "offline") progress.retry();
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          title="Sync across devices"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium transition hover:border-border-strong",
            pill.cls,
          )}
        >
          {pill.icon}
          <span className="hidden sm:inline">{pill.text}</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Your progress</DialogTitle>
        <DialogDescription>
          {sync === "offline"
            ? "You're offline. Progress is kept in this browser and will be saved when you're back online."
            : "Your progress is saved automatically. No account needed."}
        </DialogDescription>

        <div className="mt-5 rounded-lg border border-border bg-card-back p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Your sync code</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-mono text-2xl font-medium tracking-[0.12em] text-card-foreground">
              {code ?? "— — — —"}
            </span>
            {code && (
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Keep this code. Enter it on another device (or after clearing your browser) to get your progress back.
          </p>
        </div>

        <form onSubmit={submit} className="mt-5">
          <label htmlFor="sync-code" className="flex items-center gap-1.5 text-sm font-medium">
            <Smartphone className="size-4 text-muted-foreground" />
            Have a code from another device?
          </label>
          <div className="mt-2 flex gap-2">
            <Input
              id="sync-code"
              value={input}
              onChange={(e) => {
                setInput(e.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
              className="font-mono tracking-[0.12em] uppercase"
            />
            <Button type="submit" disabled={busy || input.trim().length < 8}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Use code
            </Button>
          </div>
          {error && <p className="mt-2 text-[13px] text-primary">{error}</p>}
          {switched && !error && (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-foreground">
              <Check className="size-4 text-primary" /> Done! This device now uses that code.
            </p>
          )}
          <p className="mt-2 text-[13px] text-muted-foreground">
            Progress on this device is merged in, so nothing is lost.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
