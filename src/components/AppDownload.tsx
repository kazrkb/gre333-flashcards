import { Download } from "lucide-react";
import { nativeApp } from "@/lib/native";
import { Button } from "@/components/ui/button";

export const APK_URL = "/GRE-Words.apk";

const isAndroidBrowser = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) && !nativeApp;

/** Header icon next to sync and dark mode: website on Android phones only. */
export function AppDownloadButton() {
  if (!isAndroidBrowser()) return null;
  return (
    <Button variant="ghost" size="icon-sm" asChild>
      <a href={APK_URL} download="GRE-Words.apk" aria-label="Get the Android app" title="Get the Android app (works with no internet)">
        <Download />
      </a>
    </Button>
  );
}

/** Permanent link in "Your progress" (website only). */
export function AppDownloadRow() {
  if (nativeApp) return null;
  return (
    <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
      <p className="min-w-0 text-[13px]">
        <span className="font-medium">Android app</span>
        <span className="block text-muted-foreground">Works fully offline. Open this link on your Android phone to install.</span>
      </p>
      <a
        href={APK_URL}
        download="GRE-Words.apk"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-medium hover:border-border-strong"
      >
        <Download className="size-3.5" /> Download
      </a>
    </div>
  );
}
