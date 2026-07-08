import { useEffect, useState } from "react";
import { TradingProvider, useTrading } from "./context/TradingContext";
import { TopNav } from "./components/TopNav";
import { MarketHeader } from "./components/MarketHeader";
import { PriceChart } from "./components/PriceChart";
import { OrderBook } from "./components/OrderBook";
import { OrderForm } from "./components/OrderForm";
import { BottomPanel } from "./components/BottomPanel";
import { Ticker } from "./components/Ticker";
import { AuthModal } from "./components/AuthModal";
import { DemoUserSwitcher } from "./components/DemoUserSwitcher";
import { MarketSimulatorPanel } from "./components/MarketSimulatorPanel";

type AuthMode = "signin" | "signup";

function Toasts() {
  const { error, notice, setError, clearNotice } = useTrading();

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 3500);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error, setError]);

  return (
    <div className="pointer-events-none fixed right-4 top-16 z-50 flex w-72 flex-col gap-2">
      {error && (
        <div className="pointer-events-auto rounded-xl border border-[var(--wr-red)]/30 bg-[var(--wr-red-glow)] px-3 py-2.5 text-[12px] text-[var(--wr-red)] shadow-xl backdrop-blur-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="pointer-events-auto rounded-xl border border-[var(--wr-green)]/30 bg-[var(--wr-green-glow)] px-3 py-2.5 text-[12px] text-[var(--wr-green)] shadow-xl backdrop-blur-sm">
          {notice}
        </div>
      )}
    </div>
  );
}

function Layout() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [simOpen, setSimOpen] = useState(
    () =>
      window.location.search.includes("simulator=1") ||
      window.location.pathname === "/simulator",
  );

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--wr-bg)] text-[var(--wr-text-secondary)]">
      <TopNav onOpenAuth={openAuth} onOpenSimulator={() => setSimOpen(true)} />
      {/* <DemoUserSwitcher /> */}

      <main className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3">
        {/* Left: market header + chart + bottom panel (trading view column) */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          <MarketHeader />
          <div className="min-h-0 flex-1 overflow-hidden">
            <PriceChart />
          </div>
          <div className="h-[220px] shrink-0">
            <BottomPanel onOpenAuth={openAuth} />
          </div>
        </div>

        {/* Right: order book + form — full height from top */}
        <div className="flex h-full w-[620px] shrink-0 gap-3">
          <div className="min-h-0 w-[300px] shrink-0">
            <OrderBook />
          </div>
          <div className="min-h-0 w-[310px] shrink-0">
            <OrderForm onOpenAuth={openAuth} />
          </div>
        </div>
      </main>

      <Ticker />
      <Toasts />

      <MarketSimulatorPanel open={simOpen} onClose={() => setSimOpen(false)} />

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        initialMode={authMode}
      />
    </div>
  );
}

export default function App() {
  return (
    <TradingProvider>
      <Layout />
    </TradingProvider>
  );
}
