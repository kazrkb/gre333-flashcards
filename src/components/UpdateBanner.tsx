import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { nativeApp } from "@/lib/native";

/** Android app only: a newer APK is on the website (installed APKs don't update themselves). */
export function UpdateBanner() {
  const [latest, setLatest] = useState<{ versionCode: number; versionName: string; url: string } | null>(null);

  useEffect(() => {
    if (!nativeApp) return;
    const check = () =>
      fetch("/api/app-version")
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => v && setLatest(v))
        .catch(() => {}); // offline: try again later
    check();
    window.addEventListener("online", check);
    return () => window.removeEventListener("online", check);
  }, []);

  let current = 0;
  try {
    current = nativeApp?.versionCode() ?? 0;
  } catch {
    /* ignore */
  }
  if (!nativeApp || !latest || latest.versionCode <= current) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-accent-soft/60 px-4 py-3 text-[13px]">
      <span>A new version of GRE Words ({latest.versionName}) is available. Your progress stays saved.</span>
      <a
        href={new URL(latest.url, "https://gre333-flashcards.onrender.com").href}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 font-medium text-background"
      >
        <Download className="size-3.5" /> Update
      </a>
    </div>
  );
}
