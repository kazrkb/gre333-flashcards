import { useState } from "react";
import { Check, ChevronDown, Cloud, CloudOff, Copy, Loader2, Smartphone, TriangleAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { useProgress } from "@/lib/progress";
import { useOfflineState } from "@/lib/offline";
import { AppDownloadRow } from "@/components/AppDownload";

type Progress = ReturnType<typeof useProgress>;

export function SyncDialog({ progress, onReset }: { progress: Progress; onReset: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const { sync, code } = progress;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [switched, setSwitched] = useState(false);
  const offline = useOfflineState();

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
          setConfirmText("");
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

        {offline.status !== "unsupported" && (
          <p className="mt-3 flex items-start gap-2 text-[13px] text-muted-foreground">
            <WifiOff className="mt-0.5 size-4 shrink-0" />
            <span>
              {offline.status === "ready"
                ? "Ready to use offline, including the sound of every word. Progress made offline is saved when you're back online."
                : offline.status === "downloading"
                  ? `Getting ready for offline use: downloading word sounds (${offline.done.toLocaleString()} of ${offline.total.toLocaleString()})…`
                  : offline.status === "paused"
                    ? `Word sounds for offline use: ${offline.done.toLocaleString()} of ${offline.total.toLocaleString()} saved. The rest download when you're online.`
                    : "Preparing offline use…"}
            </span>
          </p>
        )}

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

        <AppDownloadRow />

        {/* Reset is tucked away and needs typing RESET, so it can't happen by accident */}
        <details className="group mt-6 rounded-lg border border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
            Reset progress
            <ChevronDown className="size-4 transition group-open:rotate-180" />
          </summary>
          <div className="border-t border-border px-4 pb-4 pt-3">
            <p className="flex gap-2 text-[13px] text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                This marks all words as new and deletes your stars, sentences, review schedule and streak, on every
                device that uses this sync code. It can't be undone.
              </span>
            </p>
            <label htmlFor="reset-confirm" className="mt-3 block text-[13px]">
              Type <span className="font-mono font-medium">RESET</span> to confirm
            </label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="reset-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="h-10 font-mono uppercase"
              />
              <Button
                variant="outline"
                className="h-10 shrink-0 border-stone text-foreground"
                disabled={confirmText.trim().toUpperCase() !== "RESET"}
                onClick={() => {
                  onReset();
                  setConfirmText("");
                  setOpen(false);
                }}
              >
                Reset everything
              </Button>
            </div>
          </div>
        </details>
        <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground/70">
          Pronunciation audio made with Piper TTS, voice “semaine” (DFKI SEMAINE database, CC BY-NC-SA 4.0).
        </p>
      </DialogContent>
    </Dialog>
  );
}
