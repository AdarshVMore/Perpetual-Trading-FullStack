import { useEffect, useMemo, useState, type ReactNode } from "react";
import { API_URL, WS_URL } from "../lib/constants";

/**
 * Free-tier hosts (Render) sleep after idle and cold-start (~1 min) on the
 * next request. This gate probes the API and WS /health endpoints first and
 * only renders the app once both respond, so the first visitor sees a
 * "waking up" screen instead of failed requests.
 *
 * Only active in production builds; local dev renders immediately.
 */

/** Turn an API/WS base URL into its cross-origin /health URL, or null if it
 * is a relative path (local dev via the Vite proxy). */
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

const SLOW_AFTER_SECONDS = 25;

export function ServerGate({ children }: { children: ReactNode }) {
  const enabled = import.meta.env.PROD;
  const apiHealth = useMemo(() => toHealthUrl(API_URL), []);
  const wsHealth = useMemo(() => toHealthUrl(WS_URL), []);

  const nothingToProbe = !apiHealth && !wsHealth;
  const [ready, setReady] = useState(!enabled || nothingToProbe);
  const [apiOk, setApiOk] = useState(!apiHealth);
  const [wsOk, setWsOk] = useState(!wsHealth);
  const [seconds, setSeconds] = useState(0);
  const [attempt, setAttempt] = useState(0);

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
      setApiOk(aOk);
      setWsOk(wOk);

      while (!cancelled && (!aOk || !wOk)) {
        const [a, w] = await Promise.all([
          aOk ? Promise.resolve(true) : probe(apiHealth!),
          wOk ? Promise.resolve(true) : probe(wsHealth!),
        ]);
        if (cancelled) return;
        if (a && !aOk) {
          aOk = true;
          setApiOk(true);
        }
        if (w && !wOk) {
          wOk = true;
          setWsOk(true);
        }
        if (aOk && wOk) break;
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!cancelled && aOk && wOk) {
        // Small settle delay so the checkmarks are visible before swap.
        setTimeout(() => {
          if (!cancelled) setReady(true);
        }, 350);
      }
    };

    void run();

    return () => {
      cancelled = true;
      clearInterval(ticker);
    };
  }, [ready, attempt, apiHealth, wsHealth]);

  if (ready) return <>{children}</>;

  const slow = seconds >= SLOW_AFTER_SECONDS;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--wr-bg)] p-6">
      <div className="wr-card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-[var(--wr-border)] border-t-[var(--wr-green)]" />

        <h1 className="text-lg font-semibold text-white">
          Waking up the server
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--wr-text-muted)]">
          This is a free demo deployment, so the servers sleep when idle. The
          first visit can take up to a minute to spin back up — live prices and
          trades load as soon as it&apos;s ready.
        </p>

        <div className="mt-6 space-y-2 text-left">
          <StatusRow label="API server" ok={apiOk} />
          <StatusRow label="Live market feed" ok={wsOk} />
        </div>

        <div className="mt-6 flex items-center justify-between text-[11px] text-[var(--wr-text-dim)]">
          <span className="font-mono">{seconds}s elapsed</span>
          {slow && (
            <button
              onClick={() => {
                setSeconds(0);
                setApiOk(!apiHealth);
                setWsOk(!wsHealth);
                setAttempt((a) => a + 1);
              }}
              className="rounded-md border border-[var(--wr-border)] px-2 py-1 text-[var(--wr-text-muted)] transition-colors hover:bg-[var(--wr-card-hover)] hover:text-white"
            >
              Retry now
            </button>
          )}
        </div>

        {slow && (
          <p className="mt-3 text-[11px] text-[var(--wr-text-dim)]">
            Still waking up… hang tight, this is normal on the first request.
          </p>
        )}
      </div>
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--wr-border-subtle)] bg-black/20 px-3 py-2">
      <span className="text-[12px] text-[var(--wr-text-secondary)]">
        {label}
      </span>
      {ok ? (
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--wr-green)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--wr-green)]" />
          Ready
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--wr-text-muted)]">
          <span className="h-3 w-3 animate-spin rounded-full border border-[var(--wr-border)] border-t-[var(--wr-text-secondary)]" />
          Starting
        </span>
      )}
    </div>
  );
}
