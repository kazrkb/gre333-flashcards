import { Download } from "lucide-react";
import { nativeApp } from "@/lib/native";

export const APK_URL = "/GRE-Words.apk";
const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Bottom of the Cards page (website only; iPhones can't install an APK): one small orange word. */
export function AppDownloadFooter() {
  if (nativeApp || isIos()) return null;
  return (
    <p className="mt-6 text-center font-mono text-[11px]">
      <a
        href={APK_URL}
        download="GRE-Words.apk"
        title="Download the Android app (works with no internet)"
        className="text-primary hover:underline hover:underline-offset-4"
      >
        Download
      </a>
    </p>
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
