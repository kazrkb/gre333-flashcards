import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { prepareOffline } from "./lib/offline";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Cache the app on the device so it opens instantly (even while the server is waking up) and works offline.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* not supported or blocked: the app still works normally */
    });
    prepareOffline(); // keep data safe and download every word recording for offline use
  });
}
