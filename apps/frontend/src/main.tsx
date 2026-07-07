import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { LoadTestPanel } from "./components/LoadTestPanel.tsx";
import { TradingProvider } from "./context/TradingContext.tsx";

const isLoadTest =
  window.location.pathname === "/loadtest" ||
  window.location.search.includes("loadtest=1");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isLoadTest ? (
      <TradingProvider>
        <LoadTestPanel />
      </TradingProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
