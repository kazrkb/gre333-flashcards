import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fonts are bundled with the app (no internet needed).
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/hind-siliguri/400.css";
import "@fontsource/hind-siliguri/500.css";
import "@fontsource/hind-siliguri/600.css";
import "./index.css";
import App from "./App";
import { prepareOffline } from "./lib/offline";
import { nativeApp } from "./lib/native";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Android app: everything is built in, nothing to cache.
if (nativeApp) prepareOffline();
// Website: cache the app on the device so it opens instantly (even while the server is waking up) and works offline.
else if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* not supported or blocked: the app still works normally */
    });
    prepareOffline(); // keep data safe and download every word recording for offline use
  });
}
