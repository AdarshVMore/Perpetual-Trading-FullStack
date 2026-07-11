import { useEffect, useMemo, useState, type ReactNode } from "react";
import { API_URL, WS_URL } from "../lib/constants";

function toHealthUrl(base: string): string | null {
  if (!base || base.startsWith("/")) return null;
  try {
    const url = new URL(base);
    const httpProto =
      url.protocol === "wss:"
        ? "https:"
        : url.protocol === "ws:"
          ? "http:"
          : url.protocol;
    return `${httpProto}//${url.host}/health`;
  } catch {
    return null;
  }
}

async function probe(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const ESTIMATE_SECONDS = 90;

export function ServerGate({ children }: { children: ReactNode }) {
  const enabled = import.meta.env.PROD;
  const apiHealth = useMemo(() => toHealthUrl(API_URL), []);
  const wsHealth = useMemo(() => toHealthUrl(WS_URL), []);

  const nothingToProbe = !apiHealth && !wsHealth;
  const [ready, setReady] = useState(!enabled || nothingToProbe);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    const start = Date.now();

    const ticker = setInterval(() => {
      if (!cancelled) setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 500);

    const run = async () => {
      let aOk = !apiHealth;
      let wOk = !wsHealth;
      while (!cancelled && (!aOk || !wOk)) {
        const [a, w] = await Promise.all([
          aOk ? Promise.resolve(true) : probe(apiHealth!),
          wOk ? Promise.resolve(true) : probe(wsHealth!),
        ]);
        if (cancelled) return;
        aOk = aOk || a;
        wOk = wOk || w;
        if (aOk && wOk) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) setReady(true);
    };

    void run();

    return () => {
      cancelled = true;
      clearInterval(ticker);
    };
  }, [ready, apiHealth, wsHealth]);

  if (ready) return <>{children}</>;

  const progress = Math.min(95, Math.round((seconds / ESTIMATE_SECONDS) * 100));

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--wr-bg)] p-6">
      <div className="w-full max-w-sm text-center">
        <p className="text-sm text-[var(--wr-text-secondary)]">
          Waiting for server to start…
        </p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--wr-border)]">
          <div
            className="h-full rounded-full bg-[var(--wr-green)] transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-[var(--wr-text-dim)]">
          This may take 1–2 minutes on the first visit.
        </p>
      </div>
    </div>
  );
}
