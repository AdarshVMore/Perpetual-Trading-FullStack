import {
  Search,
  ChevronDown,
  Wallet,
  LogOut,
  Bell,
  HelpCircle,
  Globe,
  Activity,
} from "lucide-react";
import { useTrading } from "../context/TradingContext";

const NAV_ITEMS = ["Trade", "Portfolio", "Wallet", "Affiliate"];

interface TopNavProps {
  onOpenAuth: (mode: "signin" | "signup") => void;
  onOpenSimulator: () => void;
}

export function TopNav({ onOpenAuth, onOpenSimulator }: TopNavProps) {
  const { isAuthenticated, isDemoSession, user, logout, connected } = useTrading();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--wr-border)] bg-[var(--wr-bg)] px-5">
      <div className="flex items-center gap-8">
        <span className="text-[17px] font-bold tracking-tight text-white">
          WhiteRock
        </span>
        <nav className="hidden items-center gap-6 text-[13px] font-medium md:flex">
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              className={`transition-colors hover:text-white ${
                item === "Trade" ? "wr-nav-active text-white" : "text-[var(--wr-text-muted)]"
              }`}
            >
              {item}
            </button>
          ))}
          <button className="flex items-center gap-1 text-[var(--wr-text-muted)] transition-colors hover:text-white">
            More <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSimulator}
          className="hidden items-center gap-1.5 rounded-xl border border-[var(--wr-green)]/25 bg-[var(--wr-green-glow)] px-3 py-1.5 text-[12px] font-semibold text-[var(--wr-green)] transition-colors hover:border-[var(--wr-green)]/50 sm:flex"
          title="Open market simulator"
        >
          <Activity className="h-3.5 w-3.5" />
          Simulate
        </button>
        <button
          onClick={onOpenSimulator}
          className="rounded-lg p-2 text-[var(--wr-green)] transition-colors hover:bg-[var(--wr-card-hover)] sm:hidden"
          title="Market simulator"
        >
          <Activity className="h-4 w-4" />
        </button>
        <button className="rounded-lg p-2 text-[var(--wr-text-muted)] transition-colors hover:bg-[var(--wr-card-hover)] hover:text-white">
          <Bell className="h-4 w-4" />
        </button>
        <button className="rounded-lg p-2 text-[var(--wr-text-muted)] transition-colors hover:bg-[var(--wr-card-hover)] hover:text-white">
          <HelpCircle className="h-4 w-4" />
        </button>
        <button className="rounded-lg p-2 text-[var(--wr-text-muted)] transition-colors hover:bg-[var(--wr-card-hover)] hover:text-white">
          <Globe className="h-4 w-4" />
        </button>
        <button className="rounded-lg p-2 text-[var(--wr-text-muted)] transition-colors hover:bg-[var(--wr-card-hover)] hover:text-white">
          <Search className="h-4 w-4" />
        </button>

        {isAuthenticated ? (
          <div className="ml-1 flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--wr-border)] bg-[var(--wr-card-hover)] px-3 py-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  connected ? "bg-[var(--wr-green)] shadow-[0_0_6px_var(--wr-green)]" : "bg-[var(--wr-red)]"
                }`}
              />
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500">
                <Wallet className="h-3 w-3 text-black" />
              </div>
              {isDemoSession && (
                <span className="rounded-md bg-[var(--wr-green-glow)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--wr-green)]">
                  Demo
                </span>
              )}
              <span className="font-mono text-xs font-semibold text-white">
                {user?.username}
              </span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1 rounded-xl border border-[var(--wr-border)] bg-[var(--wr-card-hover)] px-2.5 py-1.5 text-[var(--wr-text-muted)] transition-colors hover:text-[var(--wr-red)]"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => onOpenAuth("signin")}
              className="rounded-xl px-3 py-1.5 text-[13px] font-semibold text-[var(--wr-text-muted)] transition-colors hover:text-white"
            >
              Log in
            </button>
            <button
              onClick={() => onOpenAuth("signup")}
              className="wr-btn-primary rounded-xl px-4 py-1.5 text-[13px]"
            >
              Sign up
            </button>
          </>
        )}
      </div>
    </header>
  );
}
