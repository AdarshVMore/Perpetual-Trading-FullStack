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

const LOADING_MESSAGES = [
  {
    afterSeconds: 0,
    text: "Waking up the trading server…",
  },
  {
    afterSeconds: 5,
    text: "This demo runs on Render's free tier. After ~15 minutes of inactivity, the backend sleeps to save resources.",
  },
  {
    afterSeconds: 12,
    text: "We're calling /health on the API and WebSocket services every few seconds until both return 200 OK.",
  },
  {
    afterSeconds: 20,
    text: "Still loading — this is not a CORS error. The server is cold-starting and can take a minute or two to respond.",
  },
  {
    afterSeconds: 30,
    text: "Once health checks pass, the dashboard opens automatically. First visit after idle usually takes 2–3 minutes.",
  },
  {
    afterSeconds: 45,
    text: "Render free instances boot slowly on the first request. Thanks for hanging in there.",
  },
  {
    afterSeconds: 60,
    text: "Almost there — the API and live price feed are spinning up now.",
  },
  {
    afterSeconds: 80,
    text: "Any moment now. You'll land on the trading UI as soon as both services are healthy.",
  },
] as const;

function messageForElapsed(seconds: number): string {
  let message: string = LOADING_MESSAGES[0].text;
  for (const item of LOADING_MESSAGES) {
    if (seconds >= item.afterSeconds) message = item.text;
    else break;
  }
  return message;
}

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
  const statusMessage = messageForElapsed(seconds);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--wr-bg)] p-6">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium text-[var(--wr-text)]">
          Waiting for server to start…
        </p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--wr-border)]">
          <div
            className="h-full rounded-full bg-[var(--wr-green)] transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p
          key={statusMessage}
          className="wr-message-fade mt-5 min-h-[4.5rem] text-sm leading-relaxed text-[var(--wr-text-muted)]"
        >
          {statusMessage}
        </p>
        <p className="mt-2 text-xs text-[var(--wr-text-dim)]">
          Polling /health · usually 2–3 min max after idle
        </p>
      </div>
    </div>
  );
}
