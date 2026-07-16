import React, { useEffect, useState } from "react";
import { useTrading } from "../context/TradingContext";
import {
  X,
  User,
  Lock,
  ArrowRight,
  Sparkles,
  ArrowLeft,
  Users,
} from "lucide-react";
import { DEMO_ACCOUNTS } from "../lib/demoAccounts";
import { ensureDemoAccounts } from "../lib/api";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "signin" | "signup";
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = "signin",
}) => {
  const { login, signUp, loginAsDemo, error, setError } = useTrading();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [showDemoPicker, setShowDemoPicker] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setShowDemoPicker(false);
    setError(null);
    setSuccessMsg(null);
  }, [isOpen, initialMode, setError]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setShowDemoPicker(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    if (mode === "signin") {
      const success = await login(username, password);
      if (success) {
        resetAndClose();
      }
    } else {
      const res = await signUp(username, password);
      if (res.success) {
        setSuccessMsg(res.message);
        setMode("signin");
        setPassword("");
      } else {
        setError(res.message);
      }
    }
    setLoading(false);
  };

  const handleOpenDemoPicker = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await ensureDemoAccounts(DEMO_ACCOUNTS);
      setShowDemoPicker(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to prepare demo accounts",
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePickDemoUser = async (demoUsername: string) => {
    setLoading(true);
    setError(null);
    const success = await loginAsDemo(demoUsername);
    if (success) {
      resetAndClose();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="wr-card relative w-full max-w-md overflow-hidden text-[var(--wr-text-secondary)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--wr-border)] px-6 py-4">
          <h2 className="text-xl font-bold tracking-tight text-white">
            {showDemoPicker
              ? "Choose Demo User"
              : mode === "signin"
                ? "Sign In to Trade"
                : "Create Account"}
          </h2>
          <button
            onClick={resetAndClose}
            className="rounded-lg p-1 text-[var(--wr-text-muted)] transition-colors hover:bg-[var(--wr-card-hover)] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-[var(--wr-red)]/30 bg-[var(--wr-red-glow)] p-3 text-sm text-[var(--wr-red)]">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 rounded-xl border border-[var(--wr-green)]/30 bg-[var(--wr-green-glow)] p-3 text-sm text-[var(--wr-green)]">
              {successMsg}
            </div>
          )}

          {showDemoPicker ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--wr-text-muted)]">
                Pick a shared demo account. Switch anytime from the top bar to
                trade against yourself live.
              </p>

              <div className="space-y-3">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.username}
                    onClick={() => void handlePickDemoUser(account.username)}
                    disabled={loading}
                    className={`flex w-full items-center gap-4 rounded-xl border px-4 py-4 text-left transition-colors disabled:opacity-50 ${
                      account.accent === "green"
                        ? "border-[var(--wr-green)]/25 bg-[var(--wr-green-glow)] hover:border-[var(--wr-green)]/50"
                        : "border-amber-400/25 bg-amber-400/10 hover:border-amber-400/50"
                    }`}
                  >
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold`}
                    >
                      {account.displayName[0]}
                    </div>
                    <div>
                      <div className="text-[15px] font-semibold text-white">
                        {account.displayName}
                      </div>
                      <div className="text-[12px] text-[var(--wr-text-muted)]">
                        {account.role}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-[var(--wr-text-dim)]">
                        @{account.username} · $1,000,000 balance
                      </div>
                    </div>
                    <Users className="ml-auto h-4 w-4 text-[var(--wr-text-dim)]" />
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowDemoPicker(false)}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--wr-border)] py-2.5 text-sm text-[var(--wr-text-muted)] transition-colors hover:bg-[var(--wr-card-hover)] hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--wr-text-muted)]">
                    Username
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--wr-text-dim)]">
                      <User className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. trader1"
                      className="wr-input w-full py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-[var(--wr-text-dim)] focus:border-[var(--wr-green)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--wr-text-muted)]">
                    Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--wr-text-dim)]">
                      <Lock className="h-4 w-4" />
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="wr-input w-full py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-[var(--wr-text-dim)] focus:border-[var(--wr-green)] focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="wr-btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm disabled:opacity-50"
                >
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  ) : (
                    <>
                      {mode === "signin" ? "Sign In" : "Sign Up"}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-4 text-center text-sm text-[var(--wr-text-dim)]">
                {mode === "signin"
                  ? "Don't have an account?"
                  : "Already have an account?"}{" "}
                <button
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="font-semibold text-[var(--wr-green)] underline transition-colors hover:text-[var(--wr-green-dim)]"
                >
                  {mode === "signin" ? "Sign Up" : "Sign In"}
                </button>
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--wr-border)]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[var(--wr-card-from)] px-3 text-[var(--wr-text-dim)]">
                    Or use instant login
                  </span>
                </div>
              </div>

              <button
                onClick={() => void handleOpenDemoPicker()}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--wr-green)]/20 bg-black/30 py-3 text-sm font-semibold text-[var(--wr-green)] transition-colors hover:bg-[var(--wr-card-hover)]"
              >
                <Sparkles className="h-4 w-4 text-[var(--wr-green)]" />
                One-Click Demo Account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
