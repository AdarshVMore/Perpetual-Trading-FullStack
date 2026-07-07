import { useState } from "react";
import { ArrowLeftRight, Sparkles } from "lucide-react";
import { useTrading } from "../context/TradingContext";
import { getDemoAccount } from "../lib/demoAccounts";
import { formatUsd } from "../lib/format";

export function DemoUserSwitcher() {
  const {
    user,
    isDemoSession,
    demoAccounts,
    demoUserSnapshots,
    switchDemoUser,
  } = useTrading();
  const [switching, setSwitching] = useState<string | null>(null);

  if (!isDemoSession || !user) return null;

  const handleSwitch = async (username: string) => {
    if (username === user.username || switching) return;
    setSwitching(username);
    try {
      await switchDemoUser(username);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div className="border-b border-[var(--wr-border)] bg-[var(--wr-card-from)]/80 px-5 py-2 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-[var(--wr-text-muted)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--wr-green)]" />
          <span>
            Demo mode — switch users to place orders as one and close as the
            other
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {demoAccounts.map((account) => {
            const snapshot = demoUserSnapshots.find(
              (item) => item.username === account.username,
            );
            const active = user.username === account.username;
            const accentClass =
              account.accent === "green"
                ? "border-[var(--wr-green)]/40 bg-[var(--wr-green-glow)] text-[var(--wr-green)]"
                : "border-amber-400/40 bg-amber-400/10 text-amber-300";

            return (
              <button
                key={account.username}
                onClick={() => void handleSwitch(account.username)}
                disabled={!!switching}
                className={`flex min-w-[180px] items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all ${
                  active
                    ? accentClass
                    : "border-[var(--wr-border)] bg-black/20 text-[var(--wr-text-secondary)] hover:border-[var(--wr-border-strong)] hover:bg-[var(--wr-card-hover)]"
                } ${switching === account.username ? "opacity-60" : ""}`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    account.accent === "green"
                      ? "bg-[var(--wr-green)] text-black"
                      : "bg-amber-400 text-black"
                  }`}
                >
                  {account.displayName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-white">
                      {account.displayName}
                    </span>
                    {active && (
                      <span className="rounded-md bg-black/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--wr-text-dim)]">
                    {account.role}
                  </div>
                  {snapshot && (
                    <div className="mt-0.5 font-mono text-[10px] text-[var(--wr-text-muted)]">
                      {formatUsd(snapshot.availableBalance)} ·{" "}
                      {snapshot.openPositions} pos · {snapshot.openOrders} ord
                    </div>
                  )}
                </div>
                {!active && (
                  <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {demoUserSnapshots.length > 0 && (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {demoUserSnapshots.map((snapshot) => {
            const account = getDemoAccount(snapshot.username);
            if (!account) return null;
            const isActive = snapshot.username === user.username;

            return (
              <div
                key={snapshot.userId}
                className={`rounded-xl border px-3 py-2 text-[11px] ${
                  isActive
                    ? "border-[var(--wr-border)] bg-black/25"
                    : "border-[var(--wr-border-subtle)] bg-black/10"
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold text-white">
                    {account.displayName}
                    {!isActive && (
                      <span className="ml-2 font-normal text-[var(--wr-text-dim)]">
                        (other user)
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[var(--wr-text-muted)]">
                    {formatUsd(snapshot.availableBalance)}
                  </span>
                </div>
                {snapshot.positions.length === 0 ? (
                  <span className="text-[var(--wr-text-dim)]">
                    No open positions
                  </span>
                ) : (
                  <div className="space-y-0.5 text-[var(--wr-text-muted)]">
                    {snapshot.positions.map((position) => (
                      <div key={`${position.marketId}-${position.positionType}`}>
                        {position.marketId} {position.positionType}{" "}
                        {position.qty} @ {position.entryPrice}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
