"use client";

import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

/** Registers /sw.js and shows a small bar when a new version is ready. */
export function ServiceWorkerRegistration() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !localStorage.getItem("gi-sw-dev")) return; // avoid stale dev caches
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloaded) { reloaded = true; location.reload(); }
    });
  }, []);

  if (!waiting) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-lg lg:bottom-6">
      <RefreshCw className="size-4 shrink-0 text-primary" aria-hidden />
      <p className="flex-1 text-sm">A new version is ready.</p>
      <button
        onClick={() => waiting.postMessage("skip-waiting")}
        className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-primary-hover dark:text-bg"
      >
        Reload
      </button>
    </div>
  );
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Banner shown while offline: pages are read-only copies, changes are disabled. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-accent/40 bg-accent-soft px-4 py-2 text-sm text-accent-text">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      You're offline. Showing the last saved copy; changes are paused until you reconnect.
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** "Install app" button, shown only when the browser offers installation. */
export function InstallButton({ compact = false }: { compact?: boolean }) {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem("gi-install-dismissed")) setHidden(true); } catch {}
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (!evt || hidden) return null;
  const install = async () => { await evt.prompt(); await evt.userChoice; setEvt(null); };
  const dismiss = () => { setHidden(true); try { localStorage.setItem("gi-install-dismissed", "1"); } catch {} };

  if (compact) {
    return (
      <button onClick={install} aria-label="Install app"
        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-text">
        <Download className="size-4" aria-hidden />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft p-3 text-sm">
      <Download className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="flex-1">Install Growth Intelligence for quick access and offline reading.</span>
      <button onClick={install} className="cursor-pointer rounded-md bg-primary px-3 py-1.5 font-medium text-white transition-colors duration-200 hover:bg-primary-hover dark:text-bg">
        Install
      </button>
      <button onClick={dismiss} aria-label="Dismiss" className="cursor-pointer rounded p-1 text-muted hover:text-text">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
