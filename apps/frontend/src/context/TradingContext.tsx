import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  addBalanceApi,
  cancelOrderApi,
  createOrderApi,
  fetchAllFills,
  fetchAllPositions,
  fetchBalance,
  fetchCandles,
  fetchFillsForCandles,
  fetchMarketTrades,
  fetchOpenOrders,
  signIn as apiSignIn,
  signUp as apiSignUp,
  ensureDemoAccounts,
  fetchDemoUserSnapshots,
  type DemoUserSnapshot,
  type OpenOrder,
} from "../lib/api";
import { DEMO_ACCOUNTS, isDemoUsername } from "../lib/demoAccounts";
import { toMarketId, toTradableSymbol } from "../lib/markets";
import { mapBackendOrder } from "../lib/mappers";
import { FeedSocket } from "../lib/ws/client";
import { OrderbookSync, type OrderbookView } from "../lib/sync/orderbookSync";
import { PersonalSync } from "../lib/sync/personalSync";
import {
  CandlesSync,
  DEFAULT_CHART_TIMEFRAME,
  getCandleFetchLimit,
  getTimeframeConfig,
  overlayFillsAfterDbSnapshot,
  type Candle,
  type ChartTimeframe,
  type FillForCandle,
} from "../lib/sync/candlesSync";
import { TradesSync } from "../lib/sync/tradesSync";
import { createUiBatcher, type UiBatcher } from "../lib/uiBatcher";
import type {
  MarginType,
  OrderType,
  Side,
  TradableSymbol,
  UiFill,
  UiPosition,
} from "../lib/types";

interface AuthUser {
  id: string;
  username: string;
}

function isRestingOpenOrder(
  order: Pick<OpenOrder, "type" | "status">,
): boolean {
  return (
    order.type === "LIMIT" &&
    (order.status === "OPEN" || order.status === "PARTIALLY_FILLED")
  );
}

type PriceMap = Partial<Record<TradableSymbol, number>>;

interface TradingContextValue {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  signUp: (
    username: string,
    password: string,
  ) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  isDemoSession: boolean;
  demoAccounts: typeof DEMO_ACCOUNTS;
  demoUserSnapshots: DemoUserSnapshot[];
  loginAsDemo: (username: string) => Promise<boolean>;
  switchDemoUser: (username: string) => Promise<boolean>;
  connected: boolean;
  currentSymbol: TradableSymbol;
  setCurrentSymbol: (symbol: TradableSymbol) => void;
  orderbook: OrderbookView;
  trades: import("../lib/types").PublicTrade[];
  candles: Candle[];
  candlesReady: boolean;
  candleTimeframe: ChartTimeframe;
  setCandleTimeframe: (timeframe: ChartTimeframe) => void;
  indexPrices: PriceMap;
  markPrices: PriceMap;
  lastPrices: PriceMap;
  indexPrice: number | null;
  markPrice: number | null;
  lastPrice: number | null;
  balance: { available: number; locked: number };
  positions: UiPosition[];
  openOrders: OpenOrder[];
  fills: UiFill[];
  placeOrder: (params: {
    side: Side;
    type: OrderType;
    price: number;
    qty: number;
    margin: number;
    marginType: MarginType;
    leverage: number;
  }) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  addBalance: (amount: number) => Promise<void>;
  error: string | null;
  notice: string | null;
  setError: (msg: string | null) => void;
  clearNotice: () => void;
}

const TradingContext = createContext<TradingContextValue | undefined>(
  undefined,
);

export function useTrading(): TradingContextValue {
  const ctx = useContext(TradingContext);
  if (!ctx) throw new Error("useTrading must be used within TradingProvider");
  return ctx;
}

const EMPTY_BOOK: OrderbookView = { asks: [], bids: [] };

function decodeUser(token: string, username: string): AuthUser {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { id: payload.userId ?? payload.id, username };
  } catch {
    return { id: "", username };
  }
}

const MARKET_CHANNELS = ["depth", "trade", "ticker"] as const;
const PERSONAL_CHANNELS = ["position", "order"] as const;

export function TradingProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("perp_token"),
  );
  const [user, setUser] = useState<AuthUser | null>(() => {
    const t = localStorage.getItem("perp_token");
    const u = localStorage.getItem("perp_username");
    if (!t || !u) return null;
    return decodeUser(t, u);
  });
  const [isDemoSession, setIsDemoSession] = useState(
    () => localStorage.getItem("perp_is_demo") === "true",
  );
  const [demoUserSnapshots, setDemoUserSnapshots] = useState<DemoUserSnapshot[]>(
    [],
  );

  const [connected, setConnected] = useState(false);
  const [currentSymbol, setCurrentSymbolState] =
    useState<TradableSymbol>("SOLUSD");

  const [orderbook, setOrderbook] = useState<OrderbookView>(EMPTY_BOOK);
  const [trades, setTrades] = useState<import("../lib/types").PublicTrade[]>(
    [],
  );
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesReady, setCandlesReady] = useState(false);
  const [candleTimeframe, setCandleTimeframeState] =
    useState<ChartTimeframe>(DEFAULT_CHART_TIMEFRAME);
  const [indexPrices, setIndexPrices] = useState<PriceMap>({});
  const [markPrices, setMarkPrices] = useState<PriceMap>({});
  const [lastPrices, setLastPrices] = useState<PriceMap>({});

  const [balance, setBalance] = useState({ available: 0, locked: 0 });
  const [positions, setPositions] = useState<UiPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [fills, setFills] = useState<UiFill[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const socketRef = useRef<FeedSocket | null>(null);
  const orderbookSyncRef = useRef(new OrderbookSync());
  const tradesSyncRef = useRef(new TradesSync("SOLUSD"));
  const candlesSyncRef = useRef(
    new CandlesSync("SOLUSD", DEFAULT_CHART_TIMEFRAME),
  );
  const personalSyncRef = useRef(new PersonalSync());
  const openOrdersRef = useRef<Map<string, OpenOrder>>(new Map());
  const currentSymbolRef = useRef<TradableSymbol>(currentSymbol);
  const candleTimeframeRef = useRef<ChartTimeframe>(candleTimeframe);
  const tokenRef = useRef<string | null>(token);
  const userIdRef = useRef<string | null>(user?.id ?? null);
  const subscribedMarketRef = useRef<string | null>(null);

  currentSymbolRef.current = currentSymbol;
  candleTimeframeRef.current = candleTimeframe;
  tokenRef.current = token;
  userIdRef.current = user?.id ?? null;

  const clearNotice = useCallback(() => setNotice(null), []);

  const syncOpenOrders = useCallback(() => {
    setOpenOrders(
      [...openOrdersRef.current.values()].filter(isRestingOpenOrder),
    );
  }, []);

  const flushOrderbookUi = useCallback(() => {
    setOrderbook(orderbookSyncRef.current.getView());
  }, []);

  const flushTradesUi = useCallback(() => {
    setTrades(tradesSyncRef.current.getTrades());
    setCandles(candlesSyncRef.current.getCandles());
  }, []);

  const uiBatcherRef = useRef<UiBatcher | null>(null);

  useEffect(() => {
    const batcher = createUiBatcher({
      orderbook: flushOrderbookUi,
      trades: flushTradesUi,
    });
    uiBatcherRef.current = batcher;
    return () => {
      batcher.dispose();
      uiBatcherRef.current = null;
    };
  }, [flushOrderbookUi, flushTradesUi]);

  const pushPersonalState = useCallback(() => {
    setBalance({ ...personalSyncRef.current.getBalance() });
    setPositions(personalSyncRef.current.getPositions());
    setFills(personalSyncRef.current.getFills());
  }, []);

  const loadOpenOrders = useCallback(
    async (symbol: TradableSymbol) => {
      const activeToken = tokenRef.current;
      if (!activeToken) return;
      try {
        const orders = await fetchOpenOrders(activeToken, symbol);
        for (const [id] of openOrdersRef.current) {
          const existing = openOrdersRef.current.get(id);
          if (existing?.marketSymbol === symbol) {
            openOrdersRef.current.delete(id);
          }
        }
        for (const order of orders) {
          if (isRestingOpenOrder(order)) {
            openOrdersRef.current.set(order.orderId, order);
          }
        }
        syncOpenOrders();
      } catch {
        // db-poller may lag
      }
    },
    [syncOpenOrders],
  );

  const loadAccountData = useCallback(async () => {
    const activeToken = tokenRef.current;
    if (!activeToken) return;
    try {
      const [bal, pos, allFills] = await Promise.all([
        fetchBalance(activeToken),
        fetchAllPositions(activeToken),
        fetchAllFills(activeToken),
      ]);
      personalSyncRef.current.setBalance({
        balance: bal.available,
        lockedBalance: bal.locked,
      });
      personalSyncRef.current.applyPositionSnapshot({
        positions: Object.fromEntries(
          pos.map((p) => [p.marketSymbol, {
            userId: userIdRef.current ?? "",
            price: p.entryPrice,
            quantity: p.quantity,
            type: p.type,
            marketSymbol: p.marketSymbol,
            createdAt: "",
            margin: p.margin,
            marginType: p.marginType,
            liquidationPrice: p.liquidationPrice,
          }]),
        ),
        lastFillId: 0,
      });
      personalSyncRef.current.seedFills(
        allFills.map((f) => ({
          fillId: f.fillId,
          marketSymbol: f.marketSymbol,
          side: f.side,
          price: f.price,
          qty: f.qty,
          status: "FILLED" as const,
          time: f.time,
        })),
      );
      pushPersonalState();
      await loadOpenOrders(currentSymbolRef.current);
    } catch {
      // ignore transient errors
    }
  }, [loadOpenOrders, pushPersonalState]);

  const loadMarketCandles = useCallback(
    async (symbol: TradableSymbol, timeframe: ChartTimeframe) => {
      const { apiTimeframe, bucketMs } = getTimeframeConfig(timeframe);
      const limit = getCandleFetchLimit(timeframe);

      try {
        const [dbRows, fills, tradesSnapshot] = await Promise.all([
          fetchCandles(symbol, apiTimeframe, limit),
          fetchFillsForCandles(symbol, timeframe),
          fetchMarketTrades(symbol, 500),
        ]);

        tradesSyncRef.current.applySnapshot(tradesSnapshot);
        setTrades(tradesSyncRef.current.getTrades());

        if (tradesSnapshot[0]) {
          setLastPrices((prev) => ({
            ...prev,
            [symbol]: tradesSnapshot[0].price,
          }));
          setMarkPrices((prev) => ({
            ...prev,
            [symbol]: tradesSnapshot[0].price,
          }));
        }

        const fillRows: FillForCandle[] = fills.map((fill) => ({
          fillId: fill.fillId,
          price: fill.price,
          time: fill.time,
        }));

        if (dbRows.length > 0) {
          const overlayFills = overlayFillsAfterDbSnapshot(
            fillRows,
            dbRows,
            bucketMs,
          );
          candlesSyncRef.current.applyDbSnapshot(dbRows, overlayFills);
        } else if (fillRows.length > 0) {
          candlesSyncRef.current.applyFillsSnapshot(fillRows);
        } else {
          candlesSyncRef.current.goLiveWithoutSnapshot();
        }
      } catch {
        candlesSyncRef.current.goLiveWithoutSnapshot();
      } finally {
        setCandles(candlesSyncRef.current.getCandles());
        setCandlesReady(true);
      }
    },
    [],
  );

  const loadMarketTrades = useCallback(
    async (symbol: TradableSymbol) => {
      await loadMarketCandles(symbol, candleTimeframeRef.current);
    },
    [loadMarketCandles],
  );

  const subscribeMarket = useCallback((marketId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    if (subscribedMarketRef.current) {
      for (const ch of MARKET_CHANNELS) {
        socket.unsubscribe(ch, subscribedMarketRef.current);
      }
    }
    subscribedMarketRef.current = marketId;
    for (const ch of MARKET_CHANNELS) {
      socket.subscribe(ch, marketId);
    }
  }, []);

  const subscribePersonal = useCallback((marketId: string, userId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    for (const ch of PERSONAL_CHANNELS) {
      socket.subscribe(ch, marketId, userId);
    }
  }, []);

  const unsubscribePersonal = useCallback((marketId: string, userId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    for (const ch of PERSONAL_CHANNELS) {
      socket.unsubscribe(ch, marketId, userId);
    }
  }, []);

  const handleWsMessage = useCallback(
    (data: Record<string, unknown>) => {
      const type = data.type as string;
      const activeSymbol = currentSymbolRef.current;
      const activeMarketId = toMarketId(activeSymbol);

      if (type === "depth") {
        const market =
          (data.market as string) ?? (data.marketId as string) ?? "";
        if (toTradableSymbol(market) !== activeSymbol) return;
        orderbookSyncRef.current.applyFullDepth(
          (data.asks as [number, number][]) ?? [],
          (data.bids as [number, number][]) ?? [],
        );
        uiBatcherRef.current?.markOrderbookDirty();
        return;
      }

      if (type === "trades") {
        const marketId = data.marketId as string;
        const symbol = toTradableSymbol(marketId);
        if (!symbol) return;
        const price = data.price as number;
        const qty = data.qty as number;
        const time = (data.timestamp as number) ?? Date.now();
        const fillId = `${marketId}-${time}-${price}`;

        setLastPrices((prev) => ({ ...prev, [symbol]: price }));
        setMarkPrices((prev) => ({ ...prev, [symbol]: price }));

        if (symbol !== activeSymbol) return;

        tradesSyncRef.current.onLiveTrade({ fillId, price, qty, time });
        candlesSyncRef.current.onLiveTrade(price, time, fillId);
        uiBatcherRef.current?.markTradesDirty();
        return;
      }

      if (type === "ticker") {
        const marketId = data.marketId as string;
        const symbol = toTradableSymbol(marketId);
        if (!symbol) return;
        const indexPrice = data.indexPrice as number;
        setIndexPrices((prev) => ({ ...prev, [symbol]: indexPrice }));
        if (data.markPrice != null) {
          setMarkPrices((prev) => ({
            ...prev,
            [symbol]: data.markPrice as number,
          }));
        }
        return;
      }

      if (type === "orderCreate" || type === "orderUpdate") {
        const marketId = data.marketId as string;
        if (marketId !== activeMarketId) return;
        const mapped = mapBackendOrder({
          id: data.orderId as string,
          marketId,
          positionType: data.positionType as import("../lib/types").PositionType,
          orderType: "LIMIT",
          price: (data.price as number) ?? 0,
          qty: data.qty as number,
          remainingQty: data.remainingQty as number,
          orderStatus: data.status as string,
          leverage: data.leverage as number,
        });
        if (!mapped) return;
        if (isRestingOpenOrder(mapped)) {
          openOrdersRef.current.set(mapped.orderId, mapped);
        } else {
          openOrdersRef.current.delete(mapped.orderId);
        }
        syncOpenOrders();
        void loadAccountData();
        return;
      }

      if (type === "position") {
        void loadAccountData();
      }
    },
    [loadAccountData, syncOpenOrders],
  );

  const bootstrapSymbol = useCallback(
    (symbol: TradableSymbol) => {
      const marketId = toMarketId(symbol);
      orderbookSyncRef.current = new OrderbookSync();
      tradesSyncRef.current = new TradesSync(symbol);
      candlesSyncRef.current = new CandlesSync(
        symbol,
        candleTimeframeRef.current,
      );
      setOrderbook(EMPTY_BOOK);
      setTrades([]);
      setCandles([]);
      setCandlesReady(false);
      subscribeMarket(marketId);
      void loadMarketTrades(symbol);
      if (tokenRef.current) {
        void loadOpenOrders(symbol);
        const uid = userIdRef.current;
        if (uid) subscribePersonal(marketId, uid);
      }
    },
    [
      loadMarketTrades,
      loadOpenOrders,
      subscribeMarket,
      subscribePersonal,
    ],
  );

  const doLogout = useCallback(() => {
    const marketId = subscribedMarketRef.current;
    const uid = userIdRef.current;
    if (marketId && uid) {
      unsubscribePersonal(marketId, uid);
    }
    localStorage.removeItem("perp_token");
    localStorage.removeItem("perp_username");
    localStorage.removeItem("perp_is_demo");
    setToken(null);
    setUser(null);
    setIsDemoSession(false);
    setDemoUserSnapshots([]);
    setBalance({ available: 0, locked: 0 });
    setPositions([]);
    setFills([]);
    openOrdersRef.current.clear();
    setOpenOrders([]);
  }, [unsubscribePersonal]);

  const handlersRef = useRef({ handleWsMessage, bootstrapSymbol, doLogout });
  handlersRef.current = { handleWsMessage, bootstrapSymbol, doLogout };

  // WebSocket — always connected for market data
  useEffect(() => {
    const socket = new FeedSocket({
      onStatusChange: setConnected,
      onMessage: (data) => handlersRef.current.handleWsMessage(data),
    });
    socketRef.current = socket;
    socket.connect();
    handlersRef.current.bootstrapSymbol(currentSymbolRef.current);

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload account data when auth changes
  useEffect(() => {
    if (!token || !user) return;
    void loadAccountData();
    const marketId = toMarketId(currentSymbolRef.current);
    subscribePersonal(marketId, user.id);
    return () => {
      unsubscribePersonal(marketId, user.id);
    };
  }, [token, user, loadAccountData, subscribePersonal, unsubscribePersonal]);

  const login = useCallback(
    async (
      username: string,
      password: string,
      options?: { demo?: boolean },
    ): Promise<boolean> => {
      try {
        setError(null);
        const { token: jwt, userId } = await apiSignIn(username, password);
        localStorage.setItem("perp_token", jwt);
        localStorage.setItem("perp_username", username);
        const demo = options?.demo ?? isDemoUsername(username);
        localStorage.setItem("perp_is_demo", demo ? "true" : "false");
        setIsDemoSession(demo);
        setUser({ id: userId, username });
        setToken(jwt);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
        return false;
      }
    },
    [],
  );

  const refreshDemoSnapshots = useCallback(async () => {
    const snapshots = await fetchDemoUserSnapshots();
    setDemoUserSnapshots(snapshots);
  }, []);

  const loginAsDemo = useCallback(
    async (username: string): Promise<boolean> => {
      const account = DEMO_ACCOUNTS.find((item) => item.username === username);
      if (!account) return false;

      setError(null);
      await ensureDemoAccounts(DEMO_ACCOUNTS);
      const success = await login(account.username, account.password, {
        demo: true,
      });
      if (success) {
        await refreshDemoSnapshots();
      }
      return success;
    },
    [login, refreshDemoSnapshots],
  );

  const switchDemoUser = useCallback(
    async (username: string): Promise<boolean> => {
      if (user?.username === username) return true;
      const account = DEMO_ACCOUNTS.find((item) => item.username === username);
      if (!account) return false;

      const marketId = toMarketId(currentSymbolRef.current);
      const uid = userIdRef.current;
      if (marketId && uid) {
        unsubscribePersonal(marketId, uid);
      }

      openOrdersRef.current.clear();
      setOpenOrders([]);
      setPositions([]);
      setFills([]);
      personalSyncRef.current = new PersonalSync();

      const success = await login(account.username, account.password, {
        demo: true,
      });
      if (success) {
        await Promise.all([
          loadAccountData(),
          loadOpenOrders(currentSymbolRef.current),
          refreshDemoSnapshots(),
        ]);
      }
      return success;
    },
    [
      user?.username,
      login,
      unsubscribePersonal,
      loadAccountData,
      loadOpenOrders,
      refreshDemoSnapshots,
    ],
  );

  useEffect(() => {
    if (!isDemoSession) return;
    void refreshDemoSnapshots();
    const timer = setInterval(() => {
      void refreshDemoSnapshots();
    }, 3000);
    return () => clearInterval(timer);
  }, [isDemoSession, refreshDemoSnapshots]);

  const signUp = useCallback(async (username: string, password: string) => {
    try {
      setError(null);
      const result = await apiSignUp(username, password);
      if (result === "exists") {
        return {
          success: false,
          message: "Username already exists",
        };
      }
      return { success: true, message: "Account created. Please sign in." };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Signup failed",
      };
    }
  }, []);

  const placeOrder = useCallback(
    async (params: {
      side: Side;
      type: OrderType;
      price: number;
      qty: number;
      margin: number;
      marginType: MarginType;
      leverage: number;
    }) => {
      const activeToken = tokenRef.current;
      if (!activeToken) {
        setError("Please sign in first");
        return;
      }
      try {
        const { orderId } = await createOrderApi(activeToken, {
          marketSymbol: currentSymbolRef.current,
          side: params.side,
          type: params.type,
          price: params.price,
          qty: params.qty,
          leverage: params.leverage,
        });
        setNotice("Order accepted");
        if (isDemoSession) {
          setTimeout(() => void refreshDemoSnapshots(), 1200);
        }
        // engine + db-poller are async — refresh after a short delay
        setTimeout(() => void loadAccountData(), 600);
        setTimeout(() => void loadAccountData(), 2000);
        if (params.type === "LIMIT") {
          openOrdersRef.current.set(orderId, {
            orderId,
            side: params.side,
            type: params.type,
            price: params.price,
            quantity: params.qty,
            filledQuantity: 0,
            status: "OPEN",
            marginType: params.marginType,
            marketSymbol: currentSymbolRef.current,
            leverage: params.leverage,
          });
          syncOpenOrders();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Order failed");
      }
    },
    [loadAccountData, syncOpenOrders, isDemoSession, refreshDemoSnapshots],
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      const activeToken = tokenRef.current;
      if (!activeToken) return;
      const order = openOrdersRef.current.get(orderId);
      if (!order) return;
      try {
        await cancelOrderApi(activeToken, order, order.leverage);
        openOrdersRef.current.delete(orderId);
        syncOpenOrders();
        setNotice("Cancel request accepted");
        if (isDemoSession) {
          setTimeout(() => void refreshDemoSnapshots(), 1200);
        }
        setTimeout(() => void loadAccountData(), 600);
        setTimeout(() => void loadAccountData(), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Cancel failed");
      }
    },
    [loadAccountData, syncOpenOrders, isDemoSession, refreshDemoSnapshots],
  );

  const addBalance = useCallback(
    async (amount: number) => {
      const activeToken = tokenRef.current;
      if (!activeToken) return;
      try {
        const bal = await addBalanceApi(activeToken, amount);
        personalSyncRef.current.setBalance({
          balance: bal.available,
          lockedBalance: bal.locked,
        });
        pushPersonalState();
        setNotice(`Added $${amount} to balance`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Deposit failed");
      }
    },
    [pushPersonalState],
  );

  const setCurrentSymbol = useCallback(
    (symbol: TradableSymbol) => {
      if (symbol === currentSymbolRef.current) return;
      const prevMarketId = toMarketId(currentSymbolRef.current);
      const uid = userIdRef.current;
      if (uid) unsubscribePersonal(prevMarketId, uid);

      currentSymbolRef.current = symbol;
      setCurrentSymbolState(symbol);
      handlersRef.current.bootstrapSymbol(symbol);
    },
    [unsubscribePersonal],
  );

  const setCandleTimeframe = useCallback(
    (timeframe: ChartTimeframe) => {
      if (timeframe === candleTimeframeRef.current) return;
      candleTimeframeRef.current = timeframe;
      setCandleTimeframeState(timeframe);

      const symbol = currentSymbolRef.current;
      candlesSyncRef.current = new CandlesSync(symbol, timeframe);
      setCandles([]);
      setCandlesReady(false);
      void loadMarketCandles(symbol, timeframe);
    },
    [loadMarketCandles],
  );

  const value = useMemo<TradingContextValue>(
    () => ({
      isAuthenticated: !!token,
      user,
      login,
      signUp,
      logout: doLogout,
      isDemoSession,
      demoAccounts: DEMO_ACCOUNTS,
      demoUserSnapshots,
      loginAsDemo,
      switchDemoUser,
      connected,
      currentSymbol,
      setCurrentSymbol,
      orderbook,
      trades,
      candles,
      candlesReady,
      candleTimeframe,
      setCandleTimeframe,
      indexPrices,
      markPrices,
      lastPrices,
      indexPrice: indexPrices[currentSymbol] ?? null,
      markPrice: markPrices[currentSymbol] ?? null,
      lastPrice: lastPrices[currentSymbol] ?? null,
      balance,
      positions,
      openOrders,
      fills,
      placeOrder,
      cancelOrder,
      addBalance,
      error,
      notice,
      setError,
      clearNotice,
    }),
    [
      token,
      user,
      login,
      signUp,
      doLogout,
      isDemoSession,
      demoUserSnapshots,
      loginAsDemo,
      switchDemoUser,
      connected,
      currentSymbol,
      setCurrentSymbol,
      orderbook,
      trades,
      candles,
      candlesReady,
      candleTimeframe,
      setCandleTimeframe,
      indexPrices,
      markPrices,
      lastPrices,
      balance,
      positions,
      openOrders,
      fills,
      placeOrder,
      cancelOrder,
      addBalance,
      error,
      notice,
      clearNotice,
    ],
  );

  return (
    <TradingContext.Provider value={value}>{children}</TradingContext.Provider>
  );
}
