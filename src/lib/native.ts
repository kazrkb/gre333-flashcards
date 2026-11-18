/**
 * The Android app (android/) runs this web app from files built into the APK and adds a small bridge.
 * On the website this is null.
 */
type Bridge = {
  /** One-way hash of the phone's ID for this app; the same after reinstalling, so progress can be restored. */
  deviceId(): string;
  versionCode(): number;
  setDark(dark: boolean): void;
  /** Speak with Android's text-to-speech; false if the engine isn't ready (app 3.0+). */
  speak?(text: string, gender: string, rate: number): boolean;
  /** The Android voice that would be used for this gender, or "" if none (app 3.0+). */
  voiceName?(gender: string): string;
};

declare global {
  interface Window {
    GREWordsApp?: Bridge;
  }
}

export const nativeApp: Bridge | null = typeof window !== "undefined" ? (window.GREWordsApp ?? null) : null;

/** Hashed device id, or null outside the app (or if Android doesn't provide one). */
export function nativeDeviceId(): string | null {
  try {
    const id = nativeApp?.deviceId() ?? "";
    return /^[0-9a-f]{64}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
