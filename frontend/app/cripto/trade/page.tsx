"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const KEY_STORE  = "bnb_api_key";
const SEC_STORE  = "bnb_api_secret";

const PAIRS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT",
  "DOGEUSDT","ADAUSDT","TRXUSDT","AVAXUSDT","TONUSDT",
  "SHIBUSDT","LINKUSDT","DOTUSDT","LTCUSDT","ATOMUSDT",
  "NEARUSDT","MATICUSDT","PEPEUSDT","BCHUSDT","APTUSDT",
  "UNIUSDT","INJUSDT","AAVEUSDT","ARBUSDT","OPUSDT",
  "SUIUSDT","STXUSDT","IMXUSDT","FTMUSDT","GRTUSDT",
  "LDOUSDT","FILUSDT","MKRUSDT","SANDUSDT","MANAUSDT",
  "CRVUSDT","BLURUSDT","WLDUSDT","SEIUSDT","TIAUSDT",
  "WIFUSDT","JUPUSDT","BONKUSDT","FLOKIUSDT","NOTUSDT",
  "PYTHUSDT","APEUSDT","GMXUSDT","DYDXUSDT","GMTUSDT",
];

const EMOJI: Record<string,string> = {
  BTC:"₿",ETH:"Ξ",BNB:"🟡",SOL:"◎",XRP:"✕",DOGE:"🐕",ADA:"₳",TRX:"⚡",
  AVAX:"🔺",TON:"💎",SHIB:"🐶",LINK:"🔗",DOT:"●",LTC:"Ł",ATOM:"⚛️",
  NEAR:"Ⓝ",MATIC:"🟣",PEPE:"🐸",BCH:"₿",APT:"🔷",UNI:"🦄",INJ:"💉",
  AAVE:"👻",ARB:"🔵",OP:"🔴",SUI:"💧",STX:"📚",IMX:"🎮",FTM:"👻",
  GRT:"📊",LDO:"🔷",FIL:"📁",MKR:"🏛️",SAND:"🏖️",MANA:"🌐",CRV:"🔄",
  BLUR:"💨",WLD:"🌍",SEI:"🌊",TIA:"🔭",WIF:"🐕‍🦺",JUP:"🪐",BONK:"🔨",
  FLOKI:"⚡",NOT:"❌",PYTH:"🐍",APE:"🐒",GMX:"🔮",DYDX:"📈",GMT:"⏰",
};

interface HotCoin {
  assetCode: string;
  assetName: string;
  logoUrl: string;
  symbol: string;
  strongRecommendCoin: boolean;
}

interface DynamicItem {
  s: string; o: string; h: string; l: string; c: string; v: string; qv: string;
}

interface StaticInfo { name: string; base: string; tags: string[]; }

interface SymbolItem {
  symbol: string; base: string; fullName: string;
  marketCap: number; volume: number; tags: string[];
}

// Futures
interface FuturesAccount {
  totalWalletBalance: number;
  totalMarginBalance: number;
  totalUnrealizedProfit: number;
  availableBalance: number;
  totalPositionInitialMargin: number;
  canTrade: boolean;
}
interface FuturesPosition {
  symbol: string;
  positionAmt: number;
  entryPrice: number;
  markPrice: number;
  unrealizedProfit: number;
  liquidationPrice: number;
  leverage: number;
  marginType: string;
  positionSide: string;
  notional: number;
}
interface FuturesOpenOrder {
  orderId: number; symbol: string; side: string; type: string;
  origQty: string; price: string; stopPrice: string; status: string; time: number;
  positionSide: string; reduceOnly: boolean;
}

function baseOf(pair: string) { return pair.replace("USDT",""); }
function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  if (n >= 1)    return n.toFixed(4);
  return n.toFixed(6);
}
function fmtQty(n: number, step: number) {
  const dec = Math.max(0, -Math.floor(Math.log10(step)));
  return n.toFixed(Math.min(dec, 8));
}

interface PriceTick {
  price:number; change:number; high:number; low:number; volume:number; bid:number; ask:number;
}
interface Balance { asset:string; free:number; locked:number; }
interface OpenOrder {
  orderId:number; symbol:string; side:string; type:string;
  origQty:string; executedQty:string; price:string; status:string; time:number;
}
interface Trade {
  id:number; symbol:string; side:string; price:string; qty:string;
  quoteQty:string; commission:string; commissionAsset:string; time:number; isBuyer:boolean;
}
interface ExchangeInfo {
  baseAsset:string; quoteAsset:string; stepSize:number; tickSize:number;
  minQty:number; minNotional:number; baseAssetPrecision:number; quotePrecision:number;
}

export default function TradePage() {
  // Tab principal: spot | futures
  const [mainTab, setMainTab] = useState<"spot"|"futures">("spot");

  // Keys
  const [apiKey,    setApiKey]    = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [keyDraft,  setKeyDraft]  = useState("");
  const [secDraft,  setSecDraft]  = useState("");
  const connected = !!(apiKey && apiSecret);

  // Market
  const [pair,     setPair]     = useState("BTCUSDT");
  const [prices,   setPrices]   = useState<Record<string,PriceTick>>({});
  const [book,     setBook]     = useState<{bids:[number,number][]; asks:[number,number][]}>({bids:[],asks:[]});
  const [exInfo,   setExInfo]   = useState<ExchangeInfo|null>(null);

  // Account
  const [balances,   setBalances]   = useState<Balance[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [trades,     setTrades]     = useState<Trade[]>([]);
  const [loadingAcc, setLoadingAcc] = useState(false);
  const [accErr,     setAccErr]     = useState("");

  // Order form
  const [side,       setSide]       = useState<"BUY"|"SELL">("BUY");
  const [orderType,  setOrderType]  = useState<"MARKET"|"LIMIT"|"CONVERT">("MARKET");
  const [inputMode,  setInputMode]  = useState<"usdt"|"base">("usdt");
  const [usdtAmt,    setUsdtAmt]    = useState("");
  const [baseQty,    setBaseQty]    = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [placing,    setPlacing]    = useState(false);
  const [orderMsg,   setOrderMsg]   = useState<{type:"ok"|"err"; text:string}|null>(null);
  const orderMsgTimeout = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Convert
  const [cvFrom,    setCvFrom]    = useState("USDT");
  const [cvTo,      setCvTo]      = useState("BTC");
  const [cvAmt,     setCvAmt]     = useState("");
  const [cvQuote,   setCvQuote]   = useState<any>(null);
  const [cvTimer,   setCvTimer]   = useState(0);
  const [cvLoading, setCvLoading] = useState(false);

  // Bottom tab spot
  const [btab, setBtab] = useState<"orders"|"trades">("orders");

  // ── Futures state ─────────────────────────────────────────────────────────
  const [ftPair,      setFtPair]      = useState("BTCUSDT");
  const [ftPrices,    setFtPrices]    = useState<Record<string,{price:number;change:number;high:number;low:number}>>({});
  const [ftBook,      setFtBook]      = useState<{bids:[number,number][];asks:[number,number][]}>({bids:[],asks:[]});
  const [ftAccount,   setFtAccount]   = useState<FuturesAccount|null>(null);
  const [ftPositions, setFtPositions] = useState<FuturesPosition[]>([]);
  const [ftOrders,    setFtOrders]    = useState<FuturesOpenOrder[]>([]);
  const [ftLoadAcc,   setFtLoadAcc]   = useState(false);
  const [ftAccErr,    setFtAccErr]    = useState("");

  // Futures order form
  const [ftSide,      setFtSide]      = useState<"LONG"|"SHORT">("LONG");
  const [ftOType,     setFtOType]     = useState<"MARKET"|"LIMIT">("MARKET");
  const [ftQtyUsdt,   setFtQtyUsdt]   = useState("");
  const [ftPrice,     setFtPrice]     = useState("");
  const [ftLeverage,  setFtLeverage]  = useState(10);
  const [ftMargin,    setFtMargin]    = useState<"CROSSED"|"ISOLATED">("CROSSED");
  const [ftPlacing,   setFtPlacing]   = useState(false);
  const [ftMsg,       setFtMsg]       = useState<{type:"ok"|"err";text:string}|null>(null);
  const ftMsgRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [ftBtab,      setFtBtab]      = useState<"positions"|"orders"|"trades">("positions");
  const [ftTrades,    setFtTrades]    = useState<any[]>([]);
  const [ftTp,        setFtTp]        = useState("");
  const [ftSl,        setFtSl]        = useState("");
  const [ftExInfo,    setFtExInfo]    = useState<{minQty:number;stepSize:number;minNotional:number;pricePrecision:number;quantityPrecision:number}|null>(null);
  const [ftAnalysis,  setFtAnalysis]  = useState<any>(null);
  const [ftLoadAna,   setFtLoadAna]   = useState(false);
  // Sinais do scan
  const [ftScanTop,      setFtScanTop]      = useState<any[]>([]);
  const [ftScanLoading,  setFtScanLoading]  = useState(false);
  const [ftScanAge,      setFtScanAge]      = useState(0);

  // Market data (Binance web APIs)
  const [hotCoins,    setHotCoins]    = useState<HotCoin[]>([]);
  const [dynamicData, setDynamicData] = useState<DynamicItem[]>([]);
  const [staticData,  setStaticData]  = useState<Record<string, StaticInfo>>({});
  const [symbolList,  setSymbolList]  = useState<SymbolItem[]>([]);
  const [mktSearch,   setMktSearch]   = useState("");
  const [showMkt,     setShowMkt]     = useState(false);

  // Load keys from localStorage
  useEffect(() => {
    const k = localStorage.getItem(KEY_STORE) ?? "";
    const s = localStorage.getItem(SEC_STORE) ?? "";
    setApiKey(k); setApiSecret(s);
    if (!k || !s) setShowSetup(true);
  }, []);

  const headers = useCallback(() => ({
    "X-Binance-Key":    apiKey,
    "X-Binance-Secret": apiSecret,
  }), [apiKey, apiSecret]);

  // Fetch prices
  const fetchPrices = useCallback(async () => {
    try {
      const d = await fetch(`${API}/trade/prices`).then(r => r.json());
      setPrices(d);
    } catch {}
  }, []);

  // Fetch orderbook
  const fetchBook = useCallback(async () => {
    try {
      const d = await fetch(`${API}/trade/orderbook/${pair}?limit=12`).then(r => r.json());
      setBook(d);
    } catch {}
  }, [pair]);

  // Fetch exchange info
  const fetchExInfo = useCallback(async () => {
    try {
      const d = await fetch(`${API}/trade/exchange-info/${pair}`).then(r => r.json());
      setExInfo(d);
    } catch {}
  }, [pair]);

  // Fetch account (authenticated)
  const fetchAccount = useCallback(async () => {
    if (!connected) return;
    setLoadingAcc(true); setAccErr("");
    try {
      const d = await fetch(`${API}/trade/account`, { headers: headers() }).then(r => r.json());
      if (d.detail) { setAccErr(d.detail); return; }
      setBalances(d.balances ?? []);
    } catch (e) {
      setAccErr("Erro ao buscar conta");
    } finally {
      setLoadingAcc(false);
    }
  }, [connected, headers]);

  const fetchOpenOrders = useCallback(async () => {
    if (!connected) return;
    try {
      const d = await fetch(`${API}/trade/open-orders`, { headers: headers() }).then(r => r.json());
      if (Array.isArray(d)) setOpenOrders(d);
    } catch {}
  }, [connected, headers]);

  const fetchTrades = useCallback(async () => {
    if (!connected) return;
    try {
      const d = await fetch(`${API}/trade/my-trades?symbol=${pair}&limit=30`, { headers: headers() }).then(r => r.json());
      if (Array.isArray(d)) setTrades(d);
    } catch {}
  }, [connected, pair, headers]);

  // ── Futures fetchers ──────────────────────────────────────────────────────

  const showFtMsg = (type:"ok"|"err", text:string) => {
    if (ftMsgRef.current) clearTimeout(ftMsgRef.current);
    setFtMsg({ type, text });
    ftMsgRef.current = setTimeout(() => setFtMsg(null), 6000);
  };

  const fetchFtPrices = useCallback(async () => {
    try {
      const d = await fetch(`${API}/trade/futures/prices`).then(r => r.json());
      setFtPrices(d);
    } catch {}
  }, []);

  const fetchFtBook = useCallback(async () => {
    try {
      const d = await fetch(`${API}/trade/futures/orderbook/${ftPair}?limit=12`).then(r => r.json());
      setFtBook(d);
    } catch {}
  }, [ftPair]);

  const fetchFtAccount = useCallback(async () => {
    if (!connected) return;
    setFtLoadAcc(true); setFtAccErr("");
    try {
      const d = await fetch(`${API}/trade/futures/account`, { headers: headers() }).then(r => r.json());
      if (d.detail) { setFtAccErr(d.detail); return; }
      setFtAccount(d);
    } catch { setFtAccErr("Erro ao buscar conta Futures"); }
    finally { setFtLoadAcc(false); }
  }, [connected, headers]);

  const fetchFtPositions = useCallback(async () => {
    if (!connected) return;
    try {
      const d = await fetch(`${API}/trade/futures/positions`, { headers: headers() }).then(r => r.json());
      if (Array.isArray(d)) setFtPositions(d);
    } catch {}
  }, [connected, headers]);

  const fetchFtOrders = useCallback(async () => {
    if (!connected) return;
    try {
      const d = await fetch(`${API}/trade/futures/open-orders`, { headers: headers() }).then(r => r.json());
      if (Array.isArray(d)) setFtOrders(d);
    } catch {}
  }, [connected, headers]);

  const fetchFtTrades = useCallback(async () => {
    if (!connected) return;
    try {
      const d = await fetch(`${API}/trade/futures/my-trades?symbol=${ftPair}&limit=30`, { headers: headers() }).then(r => r.json());
      if (Array.isArray(d)) setFtTrades(d);
    } catch {}
  }, [connected, headers, ftPair]);

  const refreshFtAll = useCallback(() => {
    fetchFtAccount(); fetchFtPositions(); fetchFtOrders(); fetchFtTrades();
  }, [fetchFtAccount, fetchFtPositions, fetchFtOrders, fetchFtTrades]);

  // ── Scan de sinais IA ─────────────────────────────────────────────────────
  const fetchFtScan = useCallback(async () => {
    setFtScanLoading(true);
    try {
      const d = await fetch(`${API}/cripto/futures/scan`).then(r => r.json());
      const longs  = (d.top_long  ?? []).filter((s: any) => s.operar);
      const shorts = (d.top_short ?? []).filter((s: any) => s.operar);
      const geral  = (d.geral    ?? []).filter((s: any) => s.operar && s.direction !== "NEUTRO");
      // Unifica e ordena por score, sem duplicatas
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const s of [...longs, ...shorts, ...geral]) {
        if (!seen.has(s.simbolo)) { seen.add(s.simbolo); merged.push(s); }
      }
      merged.sort((a, b) => b.score_final - a.score_final);
      setFtScanTop(merged.slice(0, 8));
      setFtScanAge(0);
    } catch {}
    finally { setFtScanLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (mainTab !== "futures") return;
    fetchFtScan();
    const id1 = setInterval(fetchFtScan, 90000);          // refresh 90s
    const id2 = setInterval(() => setFtScanAge(a => a + 1), 1000);
    return () => { clearInterval(id1); clearInterval(id2); };
  }, [mainTab, fetchFtScan]);

  // Fetch exchange info + análise ao trocar par
  useEffect(() => {
    if (mainTab !== "futures") return;
    setFtExInfo(null); setFtAnalysis(null);
    const base = ftPair.replace("USDT", "");
    // Exchange info (stake mínima, stepSize)
    fetch(`${API}/trade/futures/exchange-info/${ftPair}`)
      .then(r => r.json()).then(d => { if (d.stepSize) setFtExInfo(d); }).catch(() => {});
    // Análise do motor de futuros
    setFtLoadAna(true);
    fetch(`${API}/cripto/futures/${base}`)
      .then(r => r.json())
      .then(d => { if (!d.erro) setFtAnalysis(d); })
      .catch(() => {})
      .finally(() => setFtLoadAna(false));
  }, [ftPair, mainTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Futures effects
  useEffect(() => {
    if (mainTab !== "futures") return;
    fetchFtPrices(); fetchFtBook();
    if (connected) refreshFtAll();
  }, [mainTab, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mainTab !== "futures") return;
    const id1 = setInterval(fetchFtPrices, 5000);
    const id2 = setInterval(fetchFtBook,   3000);
    const id3 = setInterval(() => { if (connected) { fetchFtPositions(); fetchFtOrders(); } }, 8000);
    return () => { clearInterval(id1); clearInterval(id2); clearInterval(id3); };
  }, [mainTab, connected, fetchFtPrices, fetchFtBook, fetchFtPositions, fetchFtOrders]);

  const applyLeverage = async (lev: number) => {
    if (!connected) return;
    try {
      await fetch(`${API}/trade/futures/leverage`, {
        method: "POST",
        headers: { "Content-Type":"application/json", ...headers() },
        body: JSON.stringify({ symbol: ftPair, leverage: lev }),
      });
    } catch {}
  };

  const applyMarginType = async (mt: "CROSSED"|"ISOLATED") => {
    if (!connected) return;
    try {
      await fetch(`${API}/trade/futures/margin-type`, {
        method: "POST",
        headers: { "Content-Type":"application/json", ...headers() },
        body: JSON.stringify({ symbol: ftPair, marginType: mt }),
      });
    } catch {}
  };

  const sendFtOrder = async (body: object) => {
    const r = await fetch(`${API}/trade/futures/order`, {
      method: "POST",
      headers: { "Content-Type":"application/json", ...headers() },
      body: JSON.stringify(body),
    }).then(x => x.json());
    if (r.detail || (r.code && r.code < 0))
      throw new Error(r.detail ?? r.msg ?? `Erro ${r.code}`);
    return r;
  };

  const placeFuturesOrder = async (reduceOnly = false, closeAmt?: number) => {
    if (!connected) { showFtMsg("err","Configure a API Key primeiro."); return; }
    if (!ftEffPrice) { showFtMsg("err","Preço indisponível"); return; }

    setFtPlacing(true);
    try {
      const binanceSide = reduceOnly
        ? (ftSide === "LONG" ? "SELL" : "BUY")
        : (ftSide === "LONG" ? "BUY" : "SELL");

      if (reduceOnly && closeAmt !== undefined) {
        // Fechar posição existente
        const r = await sendFtOrder({
          symbol: ftPair, side: binanceSide,
          order_type: "MARKET", quantity: closeAmt,
          reduce_only: true, position_side: "BOTH",
        });
        showFtMsg("ok", `Posição fechada! ID: ${r.orderId}`);
        setTimeout(refreshFtAll, 1500);
        return;
      }

      // Validar quantidade
      const qty = calcFtQty();
      if (!qty || qty <= 0) { showFtMsg("err","Informe o valor em USDT"); return; }
      if (ftExInfo && qty < ftExInfo.minQty) {
        showFtMsg("err", `Mínimo: ${ftExInfo.minQty} ${ftBase} ≈ $${ftMinColateral.toFixed(2)} colateral com ${ftLeverage}x`);
        return;
      }

      // 1. Ordem principal
      const mainBody: any = {
        symbol: ftPair, side: binanceSide,
        order_type: ftOType, quantity: qty, position_side: "BOTH",
      };
      if (ftOType === "LIMIT" && ftPrice) mainBody.price = parseFloat(ftPrice);

      const r = await sendFtOrder(mainBody);
      let msg = `${ftSide} ${ftOType} enviada! ID: ${r.orderId}`;

      // 2. Take Profit (opcional)
      const tpVal = parseFloat(ftTp);
      if (ftTp && tpVal > 0) {
        const tpSide = ftSide === "LONG" ? "SELL" : "BUY";
        try {
          await sendFtOrder({
            symbol: ftPair, side: tpSide,
            order_type: "TAKE_PROFIT_MARKET",
            stop_price: tpVal, close_position: true, position_side: "BOTH",
          });
          msg += ` · TP $${fmtPrice(tpVal)}`;
        } catch (e) { msg += ` · TP falhou: ${e instanceof Error ? e.message : e}`; }
      }

      // 3. Stop Loss (opcional)
      const slVal = parseFloat(ftSl);
      if (ftSl && slVal > 0) {
        const slSide = ftSide === "LONG" ? "SELL" : "BUY";
        try {
          await sendFtOrder({
            symbol: ftPair, side: slSide,
            order_type: "STOP_MARKET",
            stop_price: slVal, close_position: true, position_side: "BOTH",
          });
          msg += ` · SL $${fmtPrice(slVal)}`;
        } catch (e) { msg += ` · SL falhou: ${e instanceof Error ? e.message : e}`; }
      }

      showFtMsg("ok", msg);
      setFtQtyUsdt(""); setFtPrice(""); setFtTp(""); setFtSl("");
      setTimeout(refreshFtAll, 1500);
    } catch (e) {
      showFtMsg("err", e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setFtPlacing(false);
    }
  };

  const cancelFtOrder = async (ord: FuturesOpenOrder) => {
    try {
      const r = await fetch(`${API}/trade/futures/order?symbol=${ord.symbol}&order_id=${ord.orderId}`,
        { method: "DELETE", headers: headers() }).then(x => x.json());
      if (r.detail) { showFtMsg("err", r.detail); return; }
      showFtMsg("ok","Ordem cancelada");
      setFtOrders(prev => prev.filter(o => o.orderId !== ord.orderId));
    } catch { showFtMsg("err","Erro ao cancelar"); }
  };

  // Load market data once
  useEffect(() => {
    fetch(`${API}/trade/market/hot-coins`).then(r => r.json())
      .then(d => { if (Array.isArray(d)) setHotCoins(d); }).catch(() => {});
    fetch(`${API}/trade/market/dynamic`).then(r => r.json())
      .then(d => { if (Array.isArray(d)) setDynamicData(d); }).catch(() => {});
    fetch(`${API}/trade/market/static`).then(r => r.json())
      .then(d => { if (d && typeof d === "object") setStaticData(d as Record<string,StaticInfo>); }).catch(() => {});
    fetch(`${API}/trade/market/symbols`).then(r => r.json())
      .then(d => { if (Array.isArray(d)) setSymbolList(d); }).catch(() => {});
  }, []);

  // Initial load
  useEffect(() => { fetchPrices(); fetchBook(); fetchExInfo(); }, [fetchPrices, fetchBook, fetchExInfo]);
  useEffect(() => {
    if (connected) { fetchAccount(); fetchOpenOrders(); fetchTrades(); }
  }, [connected, fetchAccount, fetchOpenOrders, fetchTrades]);

  // Polling prices + book
  useEffect(() => {
    const id1 = setInterval(fetchPrices, 5000);
    const id2 = setInterval(fetchBook,   3000);
    return () => { clearInterval(id1); clearInterval(id2); };
  }, [fetchPrices, fetchBook]);

  // Set limit price to current when switching to LIMIT
  useEffect(() => {
    if (orderType === "LIMIT" && prices[pair] && !limitPrice)
      setLimitPrice(fmtPrice(prices[pair].price));
  }, [orderType, pair, prices, limitPrice]);

  const tick = prices[pair];
  const base = baseOf(pair);
  const balUsdt = balances.find(b => b.asset === "USDT");
  const balBase = balances.find(b => b.asset === base);
  const step    = exInfo?.stepSize ?? 0.00001;
  const minNot  = exInfo?.minNotional ?? 10;
  const effPrice = orderType === "LIMIT" && limitPrice ? parseFloat(limitPrice) : (tick?.price ?? 0);
  const previewQty  = usdtAmt && effPrice ? parseFloat(usdtAmt) / effPrice : 0;
  const previewUsdt = baseQty && effPrice ? parseFloat(baseQty) * effPrice : 0;

  // Save keys
  const saveKeys = () => {
    localStorage.setItem(KEY_STORE, keyDraft.trim());
    localStorage.setItem(SEC_STORE, secDraft.trim());
    setApiKey(keyDraft.trim()); setApiSecret(secDraft.trim());
    setShowSetup(false);
    setTimeout(() => { fetchAccount(); fetchOpenOrders(); fetchTrades(); }, 300);
  };
  const clearKeys = () => {
    localStorage.removeItem(KEY_STORE); localStorage.removeItem(SEC_STORE);
    setApiKey(""); setApiSecret(""); setBalances([]); setOpenOrders([]);
    setTrades([]); setShowSetup(true);
  };

  const showMsg = (type: "ok"|"err", text: string) => {
    if (orderMsgTimeout.current) clearTimeout(orderMsgTimeout.current);
    setOrderMsg({ type, text });
    orderMsgTimeout.current = setTimeout(() => setOrderMsg(null), 5000);
  };

  // Place order
  const placeOrder = async () => {
    if (!connected) { showMsg("err","Configure a API Key primeiro."); return; }
    setPlacing(true);
    try {
      const body: any = { symbol: pair, side, order_type: orderType };
      if (orderType === "MARKET") {
        if (inputMode === "usdt" && side === "BUY") {
          if (!usdtAmt || parseFloat(usdtAmt) < minNot)
            { showMsg("err",`Mínimo ${minNot} USDT`); setPlacing(false); return; }
          body.quote_order_qty = parseFloat(usdtAmt);
        } else {
          if (!baseQty || parseFloat(baseQty) <= 0)
            { showMsg("err","Informe a quantidade"); setPlacing(false); return; }
          body.quantity = parseFloat(baseQty);
        }
      } else if (orderType === "LIMIT") {
        if (!baseQty || !limitPrice)
          { showMsg("err","Informe quantidade e preço limite"); setPlacing(false); return; }
        body.quantity = parseFloat(baseQty);
        body.price    = parseFloat(limitPrice);
      }
      const r = await fetch(`${API}/trade/order`, {
        method: "POST",
        headers: { "Content-Type":"application/json", ...headers() },
        body: JSON.stringify(body),
      }).then(x => x.json());
      if (r.detail || r.code) { showMsg("err", r.detail ?? r.msg ?? "Erro"); return; }
      showMsg("ok", `Ordem ${r.side} ${r.type} executada! ${r.executedQty ?? ""} ${base}`);
      setUsdtAmt(""); setBaseQty("");
      setTimeout(() => { fetchAccount(); fetchOpenOrders(); fetchTrades(); }, 1000);
    } catch (e) {
      showMsg("err", e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setPlacing(false);
    }
  };

  // Cancel order
  const cancelOrder = async (ord: OpenOrder) => {
    try {
      const r = await fetch(`${API}/trade/order?symbol=${ord.symbol}&order_id=${ord.orderId}`,
        { method: "DELETE", headers: headers() }).then(x => x.json());
      if (r.detail) { showMsg("err", r.detail); return; }
      showMsg("ok","Ordem cancelada");
      setOpenOrders(prev => prev.filter(o => o.orderId !== ord.orderId));
    } catch {
      showMsg("err","Erro ao cancelar");
    }
  };

  // Convert quote
  const getConvertQuote = async () => {
    if (!connected) { showMsg("err","Configure a API Key"); return; }
    if (!cvAmt) return;
    setCvLoading(true); setCvQuote(null);
    try {
      const body = { from_asset: cvFrom, to_asset: cvTo, from_amount: parseFloat(cvAmt) };
      const r = await fetch(`${API}/trade/convert/quote`, {
        method: "POST", headers: { "Content-Type":"application/json", ...headers() },
        body: JSON.stringify(body),
      }).then(x => x.json());
      if (r.detail || r.code) { showMsg("err", r.detail ?? r.msg ?? "Erro na cotação"); return; }
      setCvQuote(r);
      const exp = parseInt(r.expireTime ?? "30000");
      setCvTimer(Math.floor(exp / 1000));
    } catch { showMsg("err","Erro na cotação"); }
    finally { setCvLoading(false); }
  };

  const acceptConvert = async () => {
    if (!cvQuote?.quoteId) return;
    setCvLoading(true);
    try {
      const r = await fetch(`${API}/trade/convert/accept?quote_id=${cvQuote.quoteId}`, {
        method: "POST", headers: headers(),
      }).then(x => x.json());
      if (r.detail) { showMsg("err", r.detail); return; }
      showMsg("ok",`Conversão aceita! Status: ${r.orderStatus ?? "ok"}`);
      setCvQuote(null); setCvAmt("");
      setTimeout(() => fetchAccount(), 1500);
    } catch { showMsg("err","Erro ao aceitar"); }
    finally { setCvLoading(false); }
  };

  useEffect(() => {
    if (cvTimer <= 0) return;
    const id = setInterval(() => setCvTimer(t => { if (t <= 1) { setCvQuote(null); return 0; } return t-1; }), 1000);
    return () => clearInterval(id);
  }, [cvTimer]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const logoMap = Object.fromEntries(hotCoins.map(h => [h.assetCode, h.logoUrl]));

  // ── Helpers Futures ───────────────────────────────────────────────────────
  const parseLeverage = (str?: string) => {
    const m = (str ?? "").match(/\d+/);
    return m ? Math.min(parseInt(m[0]), 20) : 5;
  };

  const useFtSignal = (sig: any) => {
    const pair = sig.simbolo + "USDT";
    const dir  = sig.direction as "LONG"|"SHORT";
    const lev  = parseLeverage(sig.leverage_suggested);
    const n    = sig.niveis ?? {};
    setFtPair(pair); setFtSide(dir); setFtLeverage(lev);
    applyLeverage(lev);
    if (n.alvo1) setFtTp(String(n.alvo1));
    if (n.stop)  setFtSl(String(n.stop));
    setTimeout(() => document.getElementById("ft-order-form")?.scrollIntoView({ behavior:"smooth", block:"start" }), 150);
  };

  const gradeColor = (g: string) =>
    g === "A+" ? "#22c55e" : g === "A" ? "#84cc16" : g === "B" ? "#f59e0b" : g === "C" ? "#f97316" : "#6b7280";
  const ftBase = ftPair.replace("USDT","");
  const ftTick = ftPrices[ftPair];
  const ftIsGreen = (ftTick?.change ?? 0) >= 0;
  const ftEffPrice = ftOType === "LIMIT" && ftPrice ? parseFloat(ftPrice) : (ftTick?.price ?? 0);

  // Qty calculation respecting stepSize
  const roundStep = (v: number, step: number) => {
    if (!step) return v;
    const prec = Math.max(0, -Math.floor(Math.log10(step)));
    return parseFloat((Math.floor(v / step) * step).toFixed(prec));
  };
  const calcFtQty = (usdtAmt?: string): number => {
    const amt = parseFloat(usdtAmt ?? ftQtyUsdt);
    if (!amt || !ftEffPrice) return 0;
    const raw = amt * ftLeverage / ftEffPrice;
    const step = ftExInfo?.stepSize ?? 0.001;
    return Math.max(ftExInfo?.minQty ?? 0, roundStep(raw, step));
  };
  const ftQty = calcFtQty();
  const ftMinColateral = ftExInfo && ftEffPrice
    ? Math.max(ftExInfo.minQty * ftEffPrice / ftLeverage, ftExInfo.minNotional / ftLeverage)
    : 5;
  const ftNotional = ftQty * ftEffPrice;

  const dynMap: Record<string, DynamicItem> = {};
  for (const d of dynamicData) dynMap[d.s] = d;

  const mktFiltered = (() => {
    const q = mktSearch.trim().toUpperCase();
    const src = symbolList.length > 0 ? symbolList : dynamicData.map(d => ({
      symbol: d.s, base: d.s.replace("USDT",""), fullName: "",
      marketCap: 0, volume: parseFloat(d.qv||"0"), tags: [],
    }));
    return src
      .filter(x => !q || x.symbol.includes(q) || x.base.includes(q) || x.fullName.toUpperCase().includes(q))
      .slice(0, 40);
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  const isGreen = (tick?.change ?? 0) >= 0;

  return (
    <div className="max-w-7xl mx-auto px-4 pb-10">

      {/* ── Setup modal ─────────────────────────────────────────── */}
      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}>
          <div className="rounded-2xl p-8 w-full max-w-md mx-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3 mb-6">
              <span className="text-3xl">🔑</span>
              <div>
                <h2 className="text-lg font-black text-[var(--text-primary)]">Configurar Binance API</h2>
                <p className="text-sm text-[var(--text-secondary)]">Suas chaves ficam só neste dispositivo (localStorage)</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] block mb-1.5">API KEY</label>
                <input
                  value={keyDraft} onChange={e => setKeyDraft(e.target.value)}
                  placeholder="cole sua API Key aqui"
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
                  style={{ background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text-primary)",outline:"none" }}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] block mb-1.5">SECRET KEY</label>
                <input
                  type="password" value={secDraft} onChange={e => setSecDraft(e.target.value)}
                  placeholder="cole sua Secret Key aqui"
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
                  style={{ background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text-primary)",outline:"none" }}
                />
              </div>
              <div className="rounded-xl p-3 text-xs" style={{ background:"rgba(234,179,8,0.1)",border:"1px solid rgba(234,179,8,0.3)",color:"#ca8a04" }}>
                ⚠️ Crie uma API Key <strong>somente com permissão de trading Spot</strong>. Nunca habilite saques. Recomendado: restringir IP ao seu endereço.
              </div>
              <div className="flex gap-3">
                <button onClick={() => { if (apiKey) setShowSetup(false); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                  style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-secondary)" }}>
                  Cancelar
                </button>
                <button onClick={saveKeys} disabled={!keyDraft || !secDraft}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{ background: keyDraft && secDraft ? "linear-gradient(135deg,#f59e0b,#d97706)" : "rgba(255,255,255,0.05)",
                    color: keyDraft && secDraft ? "#fff" : "var(--text-muted)", cursor: keyDraft && secDraft ? "pointer":"not-allowed" }}>
                  Conectar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5 pt-2">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)]">💹 Binance Trade</h1>
          <p className="text-sm text-[var(--text-secondary)]">Spot · Compra e venda direto pela Binance</p>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ background:"rgba(34,197,94,0.12)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.3)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block"/> Conectado
              </span>
              <button onClick={() => { setKeyDraft(apiKey); setSecDraft(""); setShowSetup(true); }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-secondary)" }}>
                ⚙️ Config
              </button>
              <button onClick={clearKeys}
                className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",color:"#ef4444" }}>
                Desconectar
              </button>
            </>
          ) : (
            <button onClick={() => setShowSetup(true)}
              className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff" }}>
              🔑 Configurar API
            </button>
          )}
        </div>
      </div>

      {/* ── Tab: Spot | Futures ─────────────────────────────────── */}
      <div className="flex gap-2 mb-5 p-1 rounded-2xl" style={{ background:"var(--bg-card)",border:"1px solid var(--border)",width:"fit-content" }}>
        {([
          { k:"spot"    as const, label:"💱 Spot",    desc:"Compra e venda de ativos" },
          { k:"futures" as const, label:"⚡ Futures",  desc:"Contratos perpétuos USDT-M" },
        ]).map(({ k, label, desc }) => (
          <button key={k} onClick={() => setMainTab(k)}
            className="px-5 py-2.5 rounded-xl text-sm font-black transition-all"
            style={{
              background: mainTab === k
                ? k === "futures"
                  ? "linear-gradient(135deg,rgba(168,85,247,0.3),rgba(99,102,241,0.2))"
                  : "linear-gradient(135deg,rgba(245,158,11,0.25),rgba(234,88,12,0.15))"
                : "transparent",
              color: mainTab === k ? "#fff" : "var(--text-muted)",
              border: mainTab === k
                ? k === "futures" ? "1px solid rgba(168,85,247,0.4)" : "1px solid rgba(245,158,11,0.4)"
                : "1px solid transparent",
            }}>
            {label}
            <div className="text-[9px] font-normal mt-0.5 opacity-70">{desc}</div>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── SPOT ───────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {mainTab === "spot" && (<>

      {/* ── Hot Coins Strip ─────────────────────────────────────── */}
      {hotCoins.length > 0 && (
        <div className="mb-5 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 pb-1" style={{ minWidth: "max-content" }}>
            <span className="flex items-center text-[10px] font-black text-[var(--text-muted)] pr-1 shrink-0">
              🔥 EM ALTA
            </span>
            {hotCoins.map(coin => {
              const dyn = dynMap[coin.symbol];
              const change = dyn ? ((parseFloat(dyn.c) - parseFloat(dyn.o)) / parseFloat(dyn.o) * 100) : null;
              const green = change !== null && change >= 0;
              return (
                <button key={coin.symbol}
                  onClick={() => { if (PAIRS.includes(coin.symbol)) { setPair(coin.symbol); setLimitPrice(""); } }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl shrink-0 transition-all"
                  style={{
                    background: pair === coin.symbol ? "rgba(245,158,11,0.15)" : "var(--bg-card)",
                    border: pair === coin.symbol ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--border)",
                    cursor: PAIRS.includes(coin.symbol) ? "pointer" : "default",
                    opacity: PAIRS.includes(coin.symbol) ? 1 : 0.6,
                  }}>
                  {coin.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coin.logoUrl} alt={coin.assetCode} width={20} height={20}
                      className="rounded-full shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <span className="text-sm">{EMOJI[coin.assetCode] ?? "🪙"}</span>
                  )}
                  <div className="text-left">
                    <div className="text-[11px] font-black text-[var(--text-primary)]">{coin.assetCode}</div>
                    {change !== null && (
                      <div className="text-[9px] font-bold" style={{ color: green ? "#22c55e" : "#ef4444" }}>
                        {green ? "+" : ""}{change.toFixed(2)}%
                      </div>
                    )}
                  </div>
                  {coin.strongRecommendCoin && (
                    <span className="text-[8px] px-1 py-0.5 rounded font-black"
                      style={{ background:"rgba(245,158,11,0.2)",color:"#f59e0b" }}>⭐</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Saldos ──────────────────────────────────────────────── */}
      {connected && (
        <div className="rounded-2xl p-4 mb-5" style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[var(--text-secondary)]">SALDOS SPOT</span>
            <button onClick={fetchAccount} disabled={loadingAcc}
              className="text-xs px-2 py-1 rounded-lg transition-all"
              style={{ background:"var(--bg-surface)",color:"var(--text-muted)",border:"1px solid var(--border)" }}>
              {loadingAcc ? "..." : "↻ Atualizar"}
            </button>
          </div>
          {accErr ? (
            <p className="text-xs text-red-400">{accErr}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {balances.slice(0, 12).map(b => (
                <div key={b.asset} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                  style={{ background:"var(--bg-surface)",border:"1px solid var(--border)" }}>
                  {logoMap[b.asset] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoMap[b.asset]} alt={b.asset} width={20} height={20} className="rounded-full shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <span className="text-base">{EMOJI[b.asset] ?? "🪙"}</span>
                  )}
                  <div>
                    <div className="font-bold text-[var(--text-primary)] text-xs">{b.asset}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      {b.free.toFixed(b.free < 0.001 ? 6 : b.free < 1 ? 4 : 2)}
                      {b.locked > 0 && <span className="text-yellow-500"> +{b.locked.toFixed(4)} lock</span>}
                    </div>
                  </div>
                </div>
              ))}
              {balances.length === 0 && <p className="text-xs text-[var(--text-muted)]">Sem saldo ou chaves inválidas</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Pair selector + ticker ───────────────────────────────── */}
      <div className="rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-4"
        style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
        <div>
          <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">PAR</label>
          <div className="flex items-center gap-2">
            {logoMap[base] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoMap[base]} alt={base} width={28} height={28} className="rounded-full"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
            <select value={pair} onChange={e => { setPair(e.target.value); setLimitPrice(""); }}
              className="px-3 py-2 rounded-xl text-sm font-bold appearance-none"
              style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)",cursor:"pointer" }}>
              {PAIRS.map(p => {
                const name = staticData[p]?.name;
                return <option key={p} value={p}>{p.replace("USDT","/USDT")}{name ? ` — ${name}` : ""}</option>;
              })}
            </select>
          </div>
          {staticData[pair]?.name && (
            <div className="text-[10px] text-[var(--text-secondary)] mt-1 pl-1">
              {staticData[pair].name}
              {staticData[pair].tags?.slice(0,3).map(t => (
                <span key={t} className="ml-1 px-1.5 py-0.5 rounded text-[8px] font-bold"
                  style={{ background:"rgba(99,102,241,0.15)",color:"#a5b4fc" }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        {tick ? (
          <>
            <div>
              <div className="text-[10px] font-bold text-[var(--text-secondary)] mb-0.5">PREÇO</div>
              <div className="text-2xl font-black" style={{ color: isGreen ? "#22c55e" : "#ef4444" }}>
                ${fmtPrice(tick.price)}
              </div>
            </div>
            <div className="flex gap-4 flex-wrap text-xs">
              <div>
                <div className="text-[var(--text-secondary)]">24h</div>
                <div className="font-bold" style={{ color: isGreen ? "#22c55e" : "#ef4444" }}>
                  {isGreen ? "+" : ""}{tick.change.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Máx</div>
                <div className="font-bold text-[var(--text-primary)]">${fmtPrice(tick.high)}</div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Mín</div>
                <div className="font-bold text-[var(--text-primary)]">${fmtPrice(tick.low)}</div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Vol 24h</div>
                <div className="font-bold text-[var(--text-primary)]">
                  ${tick.volume >= 1e9 ? (tick.volume/1e9).toFixed(1)+"B" : (tick.volume/1e6).toFixed(0)+"M"}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Bid</div>
                <div className="font-bold text-emerald-400">${fmtPrice(tick.bid)}</div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Ask</div>
                <div className="font-bold text-red-400">${fmtPrice(tick.ask)}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-[var(--text-muted)] animate-pulse">Carregando preços...</div>
        )}
      </div>

      {/* ── Main grid: ordem | book ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">

        {/* Order form */}
        <div className="lg:col-span-2 rounded-2xl p-5"
          style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>

          {/* Order type tabs */}
          <div className="flex gap-1 p-1 rounded-xl mb-4"
            style={{ background:"var(--bg-surface)" }}>
            {(["MARKET","LIMIT","CONVERT"] as const).map(t => (
              <button key={t} onClick={() => { setOrderType(t); setOrderMsg(null); }}
                className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: orderType === t ? "var(--bg-card)" : "transparent",
                  color: orderType === t ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: orderType === t ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
                }}>
                {t}
              </button>
            ))}
          </div>

          {/* ── MARKET / LIMIT form ── */}
          {orderType !== "CONVERT" && (
            <>
              {/* BUY / SELL toggle */}
              <div className="flex gap-2 mb-4">
                {(["BUY","SELL"] as const).map(s => (
                  <button key={s} onClick={() => setSide(s)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-black transition-all"
                    style={{
                      background: side === s
                        ? s === "BUY" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"
                        : "var(--bg-surface)",
                      color: side === s
                        ? s === "BUY" ? "#22c55e" : "#ef4444"
                        : "var(--text-muted)",
                      border: side === s
                        ? `1px solid ${s === "BUY" ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"}`
                        : "1px solid var(--border)",
                    }}>
                    {s === "BUY" ? "▲ COMPRAR" : "▼ VENDER"}
                  </button>
                ))}
              </div>

              {/* Limit price */}
              {orderType === "LIMIT" && (
                <div className="mb-3">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">PREÇO LIMITE (USDT)</label>
                  <input value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                    placeholder={tick ? fmtPrice(tick.price) : "0.00"}
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-mono font-bold"
                    style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)",outline:"none" }}
                  />
                  {tick && limitPrice && (
                    <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                      {((parseFloat(limitPrice)-tick.price)/tick.price*100).toFixed(2)}% vs preço atual
                    </p>
                  )}
                </div>
              )}

              {/* Input mode toggle (MARKET only) */}
              {orderType === "MARKET" && side === "BUY" && (
                <div className="flex gap-1 mb-3">
                  {(["usdt","base"] as const).map(m => (
                    <button key={m} onClick={() => setInputMode(m)}
                      className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: inputMode === m ? "rgba(245,158,11,0.15)" : "var(--bg-surface)",
                        color: inputMode === m ? "#f59e0b" : "var(--text-muted)",
                        border: inputMode === m ? "1px solid rgba(245,158,11,0.3)" : "1px solid var(--border)",
                      }}>
                      {m === "usdt" ? "Em USDT" : `Em ${base}`}
                    </button>
                  ))}
                </div>
              )}

              {/* Amount input */}
              {(orderType === "MARKET" && inputMode === "usdt" && side === "BUY") ? (
                <div className="mb-3">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">
                    VALOR (USDT) {balUsdt && <span className="text-yellow-500">· Disponível: {balUsdt.free.toFixed(2)}</span>}
                  </label>
                  <div className="relative">
                    <input value={usdtAmt} onChange={e => setUsdtAmt(e.target.value)} type="number" min="0"
                      placeholder={`min. ${minNot}`}
                      className="w-full px-3 py-2.5 rounded-xl text-sm font-mono font-bold pr-16"
                      style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)",outline:"none" }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">USDT</span>
                  </div>
                  {/* Quick amounts */}
                  {balUsdt && (
                    <div className="flex gap-1 mt-1.5">
                      {[25,50,75,100].map(pct => (
                        <button key={pct} onClick={() => setUsdtAmt((balUsdt.free * pct/100).toFixed(2))}
                          className="flex-1 py-1 rounded-lg text-[10px] font-bold transition-all"
                          style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-muted)" }}>
                          {pct}%
                        </button>
                      ))}
                    </div>
                  )}
                  {usdtAmt && effPrice > 0 && (
                    <p className="text-[10px] text-[var(--text-secondary)] mt-1.5">
                      ≈ {fmtQty(previewQty, step)} {base}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mb-3">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">
                    QUANTIDADE ({base}) {balBase && <span className="text-yellow-500">· Disponível: {balBase.free.toFixed(6)}</span>}
                  </label>
                  <div className="relative">
                    <input value={baseQty} onChange={e => setBaseQty(e.target.value)} type="number" min="0"
                      placeholder={`min. ${exInfo?.minQty ?? 0.001}`}
                      className="w-full px-3 py-2.5 rounded-xl text-sm font-mono font-bold pr-16"
                      style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)",outline:"none" }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">{base}</span>
                  </div>
                  {balBase && (
                    <div className="flex gap-1 mt-1.5">
                      {[25,50,75,100].map(pct => (
                        <button key={pct} onClick={() => setBaseQty(fmtQty(balBase.free * pct/100, step))}
                          className="flex-1 py-1 rounded-lg text-[10px] font-bold transition-all"
                          style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-muted)" }}>
                          {pct}%
                        </button>
                      ))}
                    </div>
                  )}
                  {baseQty && effPrice > 0 && (
                    <p className="text-[10px] text-[var(--text-secondary)] mt-1.5">
                      ≈ ${(previewUsdt).toFixed(2)} USDT
                    </p>
                  )}
                </div>
              )}

              {/* Feedback */}
              {orderMsg && (
                <div className="rounded-xl px-3 py-2 mb-3 text-xs font-bold"
                  style={{
                    background: orderMsg.type === "ok" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                    border: `1px solid ${orderMsg.type === "ok" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                    color: orderMsg.type === "ok" ? "#22c55e" : "#ef4444",
                  }}>
                  {orderMsg.type === "ok" ? "✅ " : "❌ "}{orderMsg.text}
                </div>
              )}

              {/* Submit */}
              <button onClick={placeOrder} disabled={placing || !connected}
                className="w-full py-3 rounded-xl text-sm font-black transition-all"
                style={{
                  background: !connected ? "rgba(255,255,255,0.05)"
                    : placing ? "rgba(255,255,255,0.1)"
                    : side === "BUY"
                    ? "linear-gradient(135deg,#22c55e,#16a34a)"
                    : "linear-gradient(135deg,#ef4444,#dc2626)",
                  color: !connected || placing ? "var(--text-muted)" : "#fff",
                  cursor: !connected || placing ? "not-allowed" : "pointer",
                  boxShadow: !connected || placing ? "none"
                    : side === "BUY" ? "0 4px 20px rgba(34,197,94,0.3)" : "0 4px 20px rgba(239,68,68,0.3)",
                }}>
                {placing ? "Enviando..." : !connected ? "Configure a API Key" : `${side === "BUY" ? "▲ COMPRAR" : "▼ VENDER"} ${base}`}
              </button>

              {!connected && (
                <button onClick={() => { setKeyDraft(""); setSecDraft(""); setShowSetup(true); }}
                  className="w-full py-2.5 rounded-xl text-xs font-bold mt-2 transition-all"
                  style={{ background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.3)",color:"#f59e0b" }}>
                  🔑 Configurar API Key
                </button>
              )}
            </>
          )}

          {/* ── CONVERT form ── */}
          {orderType === "CONVERT" && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-secondary)]">
                Converta entre qualquer par de ativos sem necessitar de uma ordem de mercado.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">DE</label>
                  <select value={cvFrom} onChange={e => setCvFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-sm font-bold"
                    style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)" }}>
                    {["USDT","BTC","ETH","BNB","SOL","XRP","DOGE"].map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">PARA</label>
                  <select value={cvTo} onChange={e => setCvTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-sm font-bold"
                    style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)" }}>
                    {["BTC","ETH","BNB","SOL","XRP","USDT","DOGE"].map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">QUANTIDADE ({cvFrom})</label>
                <input value={cvAmt} onChange={e => setCvAmt(e.target.value)} type="number" min="0"
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-mono font-bold"
                  style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)",outline:"none" }}
                />
              </div>

              {cvQuote ? (
                <div className="rounded-xl p-4 space-y-2"
                  style={{ background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.3)" }}>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Taxa</span>
                    <span className="font-bold text-green-400">
                      1 {cvFrom} = {parseFloat(cvQuote.ratio ?? "0").toFixed(6)} {cvTo}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Você recebe</span>
                    <span className="font-black text-[var(--text-primary)]">
                      {parseFloat(cvQuote.toAmount ?? "0").toFixed(6)} {cvTo}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Expira em</span>
                    <span className="font-bold" style={{ color: cvTimer < 5 ? "#ef4444" : "#f59e0b" }}>
                      {cvTimer}s
                    </span>
                  </div>
                  {orderMsg && (
                    <div className="rounded-lg px-3 py-1.5 text-xs font-bold"
                      style={{ background: orderMsg.type === "ok" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                        color: orderMsg.type === "ok" ? "#22c55e" : "#ef4444" }}>
                      {orderMsg.text}
                    </div>
                  )}
                  <button onClick={acceptConvert} disabled={cvLoading || cvTimer === 0}
                    className="w-full py-2.5 rounded-xl text-sm font-black transition-all"
                    style={{ background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",
                      opacity: cvTimer === 0 ? 0.4 : 1 }}>
                    {cvLoading ? "Executando..." : "✓ Confirmar Conversão"}
                  </button>
                </div>
              ) : (
                <>
                  {orderMsg && (
                    <div className="rounded-xl px-3 py-2 text-xs font-bold"
                      style={{ background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",color:"#ef4444" }}>
                      {orderMsg.text}
                    </div>
                  )}
                  <button onClick={getConvertQuote} disabled={cvLoading || !cvAmt || !connected}
                    className="w-full py-3 rounded-xl text-sm font-black transition-all"
                    style={{ background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",
                      opacity: !cvAmt || !connected ? 0.5 : 1 }}>
                    {cvLoading ? "Buscando cotação..." : "Obter Cotação"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Order Book */}
        <div className="lg:col-span-3 rounded-2xl overflow-hidden"
          style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
          <div className="px-4 py-3 border-b" style={{ borderColor:"var(--border)" }}>
            <h3 className="text-sm font-black text-[var(--text-primary)]">📋 Order Book — {pair.replace("USDT","/USDT")}</h3>
          </div>
          <div className="grid grid-cols-2 divide-x" style={{ borderColor:"var(--border)" }}>
            {/* Bids */}
            <div>
              <div className="grid grid-cols-2 px-3 py-1.5 text-[9px] font-bold text-emerald-500 border-b"
                style={{ borderColor:"var(--border)",background:"rgba(34,197,94,0.04)" }}>
                <span>PREÇO (USDT)</span><span className="text-right">QTD</span>
              </div>
              {book.bids.slice(0,12).map(([price, qty], i) => {
                const maxQty = Math.max(...book.bids.slice(0,12).map(b => b[1]));
                const pct = maxQty > 0 ? (qty / maxQty) * 100 : 0;
                return (
                  <div key={i} className="relative grid grid-cols-2 px-3 py-1.5 text-[11px] hover:bg-emerald-500/5 cursor-default"
                    onClick={() => orderType === "LIMIT" && setLimitPrice(fmtPrice(price))}>
                    <div className="absolute inset-y-0 right-0 bg-emerald-500/8 transition-all" style={{ width:`${pct}%` }}/>
                    <span className="font-bold text-emerald-400 relative z-10">{fmtPrice(price)}</span>
                    <span className="text-right text-[var(--text-secondary)] relative z-10">{qty.toFixed(4)}</span>
                  </div>
                );
              })}
            </div>
            {/* Asks */}
            <div>
              <div className="grid grid-cols-2 px-3 py-1.5 text-[9px] font-bold text-red-400 border-b"
                style={{ borderColor:"var(--border)",background:"rgba(239,68,68,0.04)" }}>
                <span>PREÇO (USDT)</span><span className="text-right">QTD</span>
              </div>
              {book.asks.slice(0,12).map(([price, qty], i) => {
                const maxQty = Math.max(...book.asks.slice(0,12).map(a => a[1]));
                const pct = maxQty > 0 ? (qty / maxQty) * 100 : 0;
                return (
                  <div key={i} className="relative grid grid-cols-2 px-3 py-1.5 text-[11px] hover:bg-red-500/5 cursor-default"
                    onClick={() => orderType === "LIMIT" && setLimitPrice(fmtPrice(price))}>
                    <div className="absolute inset-y-0 left-0 bg-red-500/8 transition-all" style={{ width:`${pct}%` }}/>
                    <span className="font-bold text-red-400 relative z-10">{fmtPrice(price)}</span>
                    <span className="text-right text-[var(--text-secondary)] relative z-10">{qty.toFixed(4)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Spread */}
          {book.asks.length > 0 && book.bids.length > 0 && (
            <div className="px-4 py-2 border-t text-center text-[10px] font-bold text-[var(--text-muted)]"
              style={{ borderColor:"var(--border)",background:"var(--bg-surface)" }}>
              Spread: ${(book.asks[0][0] - book.bids[0][0]).toFixed(tick?.price && tick.price > 1000 ? 2 : 4)}
              {" "}({tick?.price ? ((book.asks[0][0] - book.bids[0][0])/tick.price*100).toFixed(4) : "—"}%)
            </div>
          )}
        </div>
      </div>

      {/* ── Market Overview ─────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden mb-5" style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor:"var(--border)" }}>
          <h3 className="text-sm font-black text-[var(--text-primary)]">📊 Mercado USDT</h3>
          <button onClick={() => setShowMkt(v => !v)}
            className="text-xs px-3 py-1 rounded-lg transition-all"
            style={{ background:"var(--bg-surface)",color:"var(--text-muted)",border:"1px solid var(--border)" }}>
            {showMkt ? "▲ Ocultar" : "▼ Expandir"}
          </button>
        </div>
        {showMkt && (
          <>
            <div className="px-4 py-3 border-b" style={{ borderColor:"var(--border)" }}>
              <input
                value={mktSearch}
                onChange={e => setMktSearch(e.target.value)}
                placeholder="Buscar por símbolo, nome ou tag..."
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)",outline:"none" }}
              />
            </div>
            <div className="overflow-x-auto">
              {mktFiltered.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                  {dynamicData.length === 0 ? "Carregando dados de mercado..." : "Nenhum resultado"}
                </div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b text-[9px] uppercase font-bold text-[var(--text-secondary)]"
                      style={{ borderColor:"var(--border)",background:"var(--bg-surface)" }}>
                      <th className="px-4 py-2.5 text-left">Par</th>
                      <th className="px-4 py-2.5 text-left">Nome</th>
                      <th className="px-4 py-2.5 text-right">Preço</th>
                      <th className="px-4 py-2.5 text-right">24h %</th>
                      <th className="px-4 py-2.5 text-right">Vol. 24h</th>
                      <th className="px-4 py-2.5 text-left">Tags</th>
                      <th className="px-4 py-2.5 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mktFiltered.map(sym => {
                      const dyn  = dynMap[sym.symbol];
                      const price  = dyn ? parseFloat(dyn.c) : null;
                      const open   = dyn ? parseFloat(dyn.o) : null;
                      const change = price && open ? ((price - open) / open * 100) : null;
                      const vol    = dyn ? parseFloat(dyn.qv) : sym.volume;
                      const green  = (change ?? 0) >= 0;
                      const logo   = logoMap[sym.base];
                      const name   = staticData[sym.symbol]?.name || sym.fullName;
                      const tags   = staticData[sym.symbol]?.tags || sym.tags;
                      const tradeable = PAIRS.includes(sym.symbol);
                      return (
                        <tr key={sym.symbol} className="border-b hover:bg-[var(--bg-surface)]/50 transition-colors"
                          style={{ borderColor:"var(--border)/40" }}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              {logo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logo} alt={sym.base} width={18} height={18} className="rounded-full shrink-0"
                                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              ) : (
                                <span className="text-xs">{EMOJI[sym.base] ?? "🪙"}</span>
                              )}
                              <span className="font-black text-[var(--text-primary)]">
                                {sym.symbol.replace("USDT","/USDT")}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-[var(--text-secondary)]">{name || "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-[var(--text-primary)]">
                            {price ? `$${fmtPrice(price)}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold"
                            style={{ color: change === null ? "var(--text-muted)" : green ? "#22c55e" : "#ef4444" }}>
                            {change !== null ? `${green ? "+" : ""}${change.toFixed(2)}%` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                            {vol >= 1e9 ? `$${(vol/1e9).toFixed(1)}B` : vol >= 1e6 ? `$${(vol/1e6).toFixed(0)}M` : vol > 0 ? `$${vol.toFixed(0)}` : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1 flex-wrap">
                              {tags.slice(0,3).map(t => (
                                <span key={t} className="px-1.5 py-0.5 rounded text-[8px] font-bold"
                                  style={{ background:"rgba(99,102,241,0.12)",color:"#a5b4fc" }}>{t}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {tradeable ? (
                              <button
                                onClick={() => { setPair(sym.symbol); setLimitPrice(""); }}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                                style={{
                                  background: pair === sym.symbol ? "rgba(245,158,11,0.2)" : "var(--bg-surface)",
                                  border: pair === sym.symbol ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--border)",
                                  color: pair === sym.symbol ? "#f59e0b" : "var(--text-muted)",
                                }}>
                                {pair === sym.symbol ? "✓ Selecionado" : "Selecionar"}
                              </button>
                            ) : (
                              <span className="text-[9px] text-[var(--text-muted)]">Em breve</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Bottom: orders + trades ──────────────────────────────── */}
      {connected && (
        <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor:"var(--border)" }}>
            {([
              { k:"orders" as const, label:`Ordens Abertas (${openOrders.length})` },
              { k:"trades" as const, label:`Histórico de Trades (${trades.length})` },
            ]).map(({ k, label }) => (
              <button key={k} onClick={() => setBtab(k)}
                className="px-5 py-3 text-xs font-bold transition-all border-b-2"
                style={{
                  borderColor: btab === k ? "var(--text-primary)" : "transparent",
                  color: btab === k ? "var(--text-primary)" : "var(--text-muted)",
                  background: btab === k ? "rgba(255,255,255,0.02)" : "transparent",
                }}>
                {label}
              </button>
            ))}
            <div className="ml-auto flex items-center pr-3">
              <button onClick={() => { fetchOpenOrders(); fetchTrades(); }}
                className="text-[10px] px-2 py-1 rounded-lg"
                style={{ background:"var(--bg-surface)",color:"var(--text-muted)",border:"1px solid var(--border)" }}>
                ↻
              </button>
            </div>
          </div>

          {/* Open orders */}
          {btab === "orders" && (
            <div className="overflow-x-auto">
              {openOrders.length === 0 ? (
                <div className="py-10 text-center text-sm text-[var(--text-muted)]">Nenhuma ordem aberta</div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b text-[9px] uppercase font-bold text-[var(--text-secondary)]"
                      style={{ borderColor:"var(--border)",background:"var(--bg-surface)" }}>
                      <th className="px-4 py-2.5 text-left">Par</th>
                      <th className="px-4 py-2.5 text-center">Tipo</th>
                      <th className="px-4 py-2.5 text-center">Lado</th>
                      <th className="px-4 py-2.5 text-right">Preço</th>
                      <th className="px-4 py-2.5 text-right">Qtd Original</th>
                      <th className="px-4 py-2.5 text-right">Executado</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                      <th className="px-4 py-2.5 text-center">Data</th>
                      <th className="px-4 py-2.5 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openOrders.map(ord => (
                      <tr key={ord.orderId} className="border-b hover:bg-[var(--bg-surface)]/50 transition-colors"
                        style={{ borderColor:"var(--border)/40" }}>
                        <td className="px-4 py-2.5 font-bold text-[var(--text-primary)]">
                          {ord.symbol.replace("USDT","/USDT")}
                        </td>
                        <td className="px-4 py-2.5 text-center text-[var(--text-secondary)]">{ord.type}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-black"
                            style={{ background: ord.side === "BUY" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                              color: ord.side === "BUY" ? "#22c55e" : "#ef4444" }}>
                            {ord.side}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[var(--text-primary)]">
                          ${fmtPrice(parseFloat(ord.price))}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{parseFloat(ord.origQty).toFixed(4)}</td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{parseFloat(ord.executedQty).toFixed(4)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold text-yellow-400 bg-yellow-400/10">{ord.status}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-[var(--text-secondary)]">
                          {new Date(ord.time).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => cancelOrder(ord)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                            style={{ background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",color:"#ef4444" }}>
                            Cancelar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Trade history */}
          {btab === "trades" && (
            <div className="overflow-x-auto">
              {trades.length === 0 ? (
                <div className="py-10 text-center text-sm text-[var(--text-muted)]">Nenhum trade encontrado para {pair.replace("USDT","/USDT")}</div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b text-[9px] uppercase font-bold text-[var(--text-secondary)]"
                      style={{ borderColor:"var(--border)",background:"var(--bg-surface)" }}>
                      <th className="px-4 py-2.5 text-left">Par</th>
                      <th className="px-4 py-2.5 text-center">Lado</th>
                      <th className="px-4 py-2.5 text-right">Preço</th>
                      <th className="px-4 py-2.5 text-right">Qtd</th>
                      <th className="px-4 py-2.5 text-right">Total USDT</th>
                      <th className="px-4 py-2.5 text-right">Taxa</th>
                      <th className="px-4 py-2.5 text-center">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map(t => (
                      <tr key={t.id} className="border-b hover:bg-[var(--bg-surface)]/50 transition-colors"
                        style={{ borderColor:"var(--border)/40" }}>
                        <td className="px-4 py-2.5 font-bold text-[var(--text-primary)]">
                          {t.symbol.replace("USDT","/USDT")}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-black"
                            style={{ background: t.isBuyer ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                              color: t.isBuyer ? "#22c55e" : "#ef4444" }}>
                            {t.isBuyer ? "COMPRA" : "VENDA"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[var(--text-primary)]">
                          ${fmtPrice(parseFloat(t.price))}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                          {parseFloat(t.qty).toFixed(6)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-[var(--text-primary)]">
                          ${parseFloat(t.quoteQty).toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                          {parseFloat(t.commission).toFixed(6)} {t.commissionAsset}
                        </td>
                        <td className="px-4 py-2.5 text-center text-[var(--text-secondary)]">
                          {new Date(t.time).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Prompt to connect */}
      {!connected && (
        <div className="rounded-2xl p-10 text-center"
          style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
          <div className="text-5xl mb-4">🔑</div>
          <h3 className="text-lg font-black text-[var(--text-primary)] mb-2">Conecte sua conta Binance</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
            Configure sua API Key para ver saldos, colocar ordens e ver seu histórico de trades.
            Suas chaves ficam salvas <strong>somente neste dispositivo</strong>.
          </p>
          <button onClick={() => { setKeyDraft(""); setSecDraft(""); setShowSetup(true); }}
            className="px-6 py-3 rounded-xl text-sm font-black transition-all"
            style={{ background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",
              boxShadow:"0 4px 20px rgba(245,158,11,0.3)" }}>
            🔑 Configurar API Key
          </button>
        </div>
      )}

      </>)} {/* end mainTab === "spot" */}


      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── FUTURES ────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {mainTab === "futures" && (<>

        {/* ── Aviso de risco ──────────────────────────────────────── */}
        <div className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-3"
          style={{ background:"rgba(234,179,8,0.08)",border:"1px solid rgba(234,179,8,0.25)" }}>
          <span className="text-lg shrink-0">⚠️</span>
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            <strong>Futuros envolvem risco elevado de liquidação.</strong> Use alavancagem com cautela.
            Certifique-se de que sua API Key tem permissão de <strong>Futures Trading</strong> habilitada.
          </p>
        </div>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* ── SINAL DO MOMENTO ──────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════ */}
        {(() => {
          const best = ftScanTop[0];
          const n    = best?.niveis ?? {};
          const isL  = best?.direction === "LONG";
          const dc   = isL ? "#22c55e" : "#ef4444";
          const preco = best?.preco ?? 0;
          const tpPct = n.alvo1 && preco ? ((n.alvo1 - preco) / preco * 100 * (isL ? 1 : -1)) : null;
          const slPct = n.stop  && preco ? ((preco - n.stop)  / preco * 100 * (isL ? 1 : -1)) : null;
          const rr    = tpPct && slPct && slPct > 0 ? (tpPct / slPct).toFixed(2) : null;
          const lev   = parseLeverage(best?.leverage_suggested);

          return (
            <div className="rounded-2xl mb-5 overflow-hidden"
              style={{ border: `1.5px solid ${best ? (isL ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)") : "var(--border)"}`,
                background: best ? `linear-gradient(135deg,${isL?"rgba(34,197,94,0.06)":"rgba(239,68,68,0.06)"}, var(--bg-card))` : "var(--bg-card)" }}>

              {/* Header */}
              <div className="px-4 py-2.5 flex items-center justify-between border-b"
                style={{ borderColor: best ? (isL ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)") : "var(--border)",
                  background: best ? (isL ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)") : "var(--bg-surface)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">🎯</span>
                  <span className="text-xs font-black text-[var(--text-primary)]">SINAL DO MOMENTO — IA FUTUROS</span>
                  {best && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black"
                      style={{ background: gradeColor(best.grade) + "22", color: gradeColor(best.grade), border: `1px solid ${gradeColor(best.grade)}44` }}>
                      Grade {best.grade}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {ftScanAge > 0 && (
                    <span className="text-[9px] text-[var(--text-muted)]">
                      {ftScanAge < 60 ? `${ftScanAge}s atrás` : `${Math.floor(ftScanAge/60)}m atrás`}
                    </span>
                  )}
                  <button onClick={fetchFtScan} disabled={ftScanLoading}
                    className="text-[10px] px-2 py-0.5 rounded-lg"
                    style={{ background:"var(--bg-surface)",color:"var(--text-muted)",border:"1px solid var(--border)" }}>
                    {ftScanLoading ? "⟳ Analisando..." : "↻ Atualizar"}
                  </button>
                </div>
              </div>

              {/* Body */}
              {ftScanLoading && !best ? (
                <div className="py-10 text-center">
                  <div className="text-3xl mb-2 animate-pulse">🔍</div>
                  <p className="text-sm text-[var(--text-secondary)]">Analisando 19 pares com IA...</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Pode levar até 30s na primeira vez</p>
                </div>
              ) : best ? (
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Col 1: Par + Score */}
                    <div className="flex items-start gap-3">
                      {logoMap[best.simbolo] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoMap[best.simbolo]} alt={best.simbolo} width={44} height={44}
                          className="rounded-full shrink-0 mt-0.5"
                          onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />
                      ) : (
                        <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
                          style={{ background:"var(--bg-surface)",border:"1px solid var(--border)" }}>
                          {EMOJI[best.simbolo] ?? "🪙"}
                        </div>
                      )}
                      <div>
                        <div className="text-xl font-black text-[var(--text-primary)]">
                          {best.simbolo}<span className="text-[var(--text-muted)] text-sm font-normal">/USDT</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-sm font-black" style={{ color: dc }}>
                            {isL ? "▲ LONG" : "▼ SHORT"}
                          </span>
                          <span className="text-[10px] font-bold text-[var(--text-secondary)]">
                            {best.direction_confidence?.toFixed(0)}% conf.
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] mt-1">
                          Score <strong style={{ color: gradeColor(best.grade) }}>{best.score_final?.toFixed(1)}</strong>
                          {" "} · Funding <span style={{ color: (best.funding_rate ?? 0) > 0 ? "#ef4444":"#22c55e" }}>
                            {((best.funding_rate ?? 0)*100).toFixed(3)}%
                          </span>
                        </div>
                        <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                          Long {best.long_pct?.toFixed(0)}% · OI {(best.oi_change_pct ?? 0) >= 0 ? "+":""}
                          {best.oi_change_pct?.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* Col 2: Níveis */}
                    <div className="space-y-2">
                      <div className="text-[9px] font-black text-[var(--text-secondary)] mb-1">NÍVEIS DE OPERAÇÃO</div>
                      {[
                        { label:"ENTRADA",       val: preco,   color:"var(--text-primary)", bg:"rgba(255,255,255,0.04)", pct: null },
                        { label:"TAKE PROFIT",   val: n.alvo1, color:"#22c55e",             bg:"rgba(34,197,94,0.06)",   pct: tpPct },
                        { label:"STOP LOSS",     val: n.stop,  color:"#ef4444",             bg:"rgba(239,68,68,0.06)",   pct: slPct ? -Math.abs(slPct) : null },
                        { label:"ALVO 2",        val: n.alvo2, color:"#818cf8",             bg:"rgba(99,102,241,0.06)",  pct: n.alvo2 && preco ? ((n.alvo2-preco)/preco*100*(isL?1:-1)) : null },
                      ].filter(x => x.val).map(({ label, val, color, bg, pct }) => (
                        <div key={label} className="flex items-center justify-between px-3 py-1.5 rounded-lg"
                          style={{ background: bg, border:`1px solid ${color}22` }}>
                          <span className="text-[9px] font-black" style={{ color }}>{label}</span>
                          <div className="text-right">
                            <span className="text-sm font-black" style={{ color }}>
                              ${fmtPrice(val!)}
                            </span>
                            {pct !== null && (
                              <span className="text-[9px] font-bold ml-1.5" style={{ color }}>
                                {pct > 0 ? "+" : ""}{pct!.toFixed(2)}%
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Col 3: Alavancagem + Ação */}
                    <div className="flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="rounded-xl p-3 text-center"
                          style={{ background:"rgba(168,85,247,0.1)",border:"1px solid rgba(168,85,247,0.3)" }}>
                          <div className="text-[9px] font-black text-purple-400 mb-0.5">ALAVANCAGEM SUGERIDA</div>
                          <div className="text-2xl font-black text-purple-300">{best.leverage_suggested}</div>
                        </div>
                        {rr && (
                          <div className="rounded-xl p-2.5 text-center"
                            style={{ background:"var(--bg-surface)",border:"1px solid var(--border)" }}>
                            <div className="text-[9px] font-bold text-[var(--text-secondary)]">RISCO / RETORNO</div>
                            <div className="text-lg font-black" style={{ color: parseFloat(rr) >= 1.5 ? "#22c55e" : "#f59e0b" }}>
                              R {rr}
                            </div>
                            <div className="text-[9px] text-[var(--text-muted)]">
                              {tpPct!.toFixed(2)}% gain · {Math.abs(slPct!).toFixed(2)}% risco
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => useFtSignal(best)}
                        className="w-full py-3 mt-3 rounded-xl text-sm font-black transition-all"
                        style={{
                          background: isL
                            ? "linear-gradient(135deg,#22c55e,#16a34a)"
                            : "linear-gradient(135deg,#ef4444,#dc2626)",
                          color:"#fff",
                          boxShadow: isL ? "0 4px 24px rgba(34,197,94,0.35)" : "0 4px 24px rgba(239,68,68,0.35)",
                        }}>
                        {isL ? "▲" : "▼"} CONFIGURAR {best.simbolo} {best.leverage_suggested} {isL?"LONG":"SHORT"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                  Nenhum sinal operável no momento — clique em Atualizar
                </div>
              )}

              {/* Outros sinais */}
              {ftScanTop.length > 1 && (
                <div className="px-4 py-2.5 border-t overflow-x-auto no-scrollbar"
                  style={{ borderColor:"var(--border)",background:"var(--bg-surface)" }}>
                  <div className="flex items-center gap-2" style={{ minWidth:"max-content" }}>
                    <span className="text-[9px] font-black text-[var(--text-muted)] shrink-0">OUTROS SINAIS</span>
                    {ftScanTop.slice(1).map(sig => {
                      const sIsL = sig.direction === "LONG";
                      const sN = sig.niveis ?? {};
                      return (
                        <button key={sig.simbolo} onClick={() => useFtSignal(sig)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 transition-all"
                          style={{
                            background: sIsL ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                            border: `1px solid ${sIsL ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                          }}>
                          {logoMap[sig.simbolo] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoMap[sig.simbolo]} alt={sig.simbolo} width={16} height={16} className="rounded-full"
                              onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />
                          ) : <span className="text-xs">{EMOJI[sig.simbolo] ?? "🪙"}</span>}
                          <span className="text-[10px] font-black text-[var(--text-primary)]">{sig.simbolo}</span>
                          <span className="text-[9px] font-bold" style={{ color: sIsL ? "#22c55e" : "#ef4444" }}>
                            {sIsL ? "▲" : "▼"} {sig.score_final?.toFixed(0)}
                          </span>
                          <span className="text-[9px] font-bold text-purple-400">{sig.leverage_suggested}</span>
                          {sN.alvo1 && sN.stop && sig.preco && (
                            <span className="text-[9px] text-[var(--text-muted)]">
                              TP${fmtPrice(sN.alvo1)} SL${fmtPrice(sN.stop)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Conta Futures ───────────────────────────────────────── */}
        {connected ? (
          <div className="rounded-2xl p-4 mb-5" style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-[var(--text-secondary)]">CONTA FUTURES USDT-M</span>
              <button onClick={refreshFtAll} disabled={ftLoadAcc}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ background:"var(--bg-surface)",color:"var(--text-muted)",border:"1px solid var(--border)" }}>
                {ftLoadAcc ? "..." : "↻ Atualizar"}
              </button>
            </div>
            {ftAccErr ? (
              <p className="text-xs text-red-400">{ftAccErr}</p>
            ) : ftAccount ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label:"Saldo Carteira", val:`$${ftAccount.totalWalletBalance.toFixed(2)}`, color:"var(--text-primary)" },
                  { label:"Saldo Margem",   val:`$${ftAccount.totalMarginBalance.toFixed(2)}`,  color:"var(--text-primary)" },
                  { label:"Disponível",     val:`$${ftAccount.availableBalance.toFixed(2)}`,    color:"#22c55e" },
                  { label:"PnL Não Realiz", val:`${ftAccount.totalUnrealizedProfit >= 0 ? "+" : ""}$${ftAccount.totalUnrealizedProfit.toFixed(2)}`,
                    color: ftAccount.totalUnrealizedProfit >= 0 ? "#22c55e" : "#ef4444" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="rounded-xl p-3 text-center"
                    style={{ background:"var(--bg-surface)",border:"1px solid var(--border)" }}>
                    <div className="text-[9px] font-bold text-[var(--text-secondary)] mb-1">{label}</div>
                    <div className="text-sm font-black" style={{ color }}>{val}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)] animate-pulse">Carregando conta...</p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl p-6 mb-5 text-center" style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
            <p className="text-sm text-[var(--text-secondary)] mb-3">Configure sua API Key para operar em Futures</p>
            <button onClick={() => { setKeyDraft(""); setSecDraft(""); setShowSetup(true); }}
              className="px-5 py-2.5 rounded-xl text-sm font-black"
              style={{ background:"linear-gradient(135deg,#a855f7,#6366f1)",color:"#fff" }}>
              🔑 Configurar API Key
            </button>
          </div>
        )}

        {/* ── Par + Preço Futures ─────────────────────────────────── */}
        <div className="rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-4"
          style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">PAR FUTURES</label>
            <div className="flex items-center gap-2">
              {logoMap[ftBase] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoMap[ftBase]} alt={ftBase} width={28} height={28} className="rounded-full"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <select value={ftPair} onChange={e => { setFtPair(e.target.value); setFtPrice(""); }}
                className="px-3 py-2 rounded-xl text-sm font-bold appearance-none"
                style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)",cursor:"pointer" }}>
                {PAIRS.map(p => <option key={p} value={p}>{p.replace("USDT","/USDT")} PERP</option>)}
              </select>
            </div>
          </div>
          {ftTick ? (
            <>
              <div>
                <div className="text-[10px] font-bold text-[var(--text-secondary)] mb-0.5">MARK PRICE</div>
                <div className="text-2xl font-black" style={{ color: ftIsGreen ? "#22c55e" : "#ef4444" }}>
                  ${fmtPrice(ftTick.price)}
                </div>
              </div>
              <div className="flex gap-4 flex-wrap text-xs">
                <div>
                  <div className="text-[var(--text-secondary)]">24h</div>
                  <div className="font-bold" style={{ color: ftIsGreen ? "#22c55e" : "#ef4444" }}>
                    {ftIsGreen ? "+" : ""}{ftTick.change.toFixed(2)}%
                  </div>
                </div>
                <div><div className="text-[var(--text-secondary)]">Máx</div><div className="font-bold text-[var(--text-primary)]">${fmtPrice(ftTick.high)}</div></div>
                <div><div className="text-[var(--text-secondary)]">Mín</div><div className="font-bold text-[var(--text-primary)]">${fmtPrice(ftTick.low)}</div></div>
              </div>
              {/* Leverage + Margin controls */}
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <div>
                  <div className="text-[9px] font-bold text-[var(--text-secondary)] mb-1">ALAVANCAGEM</div>
                  <div className="flex items-center gap-1">
                    {[1,2,3,5,10,20,50,75,100,125].map(lv => (
                      <button key={lv} onClick={() => { setFtLeverage(lv); applyLeverage(lv); }}
                        className="px-2 py-1 rounded-lg text-[10px] font-black transition-all"
                        style={{
                          background: ftLeverage === lv ? "linear-gradient(135deg,#a855f7,#6366f1)" : "var(--bg-surface)",
                          color: ftLeverage === lv ? "#fff" : "var(--text-muted)",
                          border: ftLeverage === lv ? "1px solid #a855f7" : "1px solid var(--border)",
                        }}>
                        {lv}x
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-[var(--text-secondary)] mb-1">MARGEM</div>
                  <div className="flex gap-1">
                    {(["CROSSED","ISOLATED"] as const).map(mt => (
                      <button key={mt} onClick={() => { setFtMargin(mt); applyMarginType(mt); }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black transition-all"
                        style={{
                          background: ftMargin === mt ? "rgba(99,102,241,0.2)" : "var(--bg-surface)",
                          color: ftMargin === mt ? "#a5b4fc" : "var(--text-muted)",
                          border: ftMargin === mt ? "1px solid rgba(99,102,241,0.4)" : "1px solid var(--border)",
                        }}>
                        {mt === "CROSSED" ? "Cruzada" : "Isolada"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-[var(--text-muted)] animate-pulse">Carregando preços...</div>
          )}
        </div>

        {/* ── Main grid Futures: form | book ──────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">

          {/* Order form Futures */}
          <div className="lg:col-span-2 space-y-4">

            {/* ── Análise IA ───────────────────────────────────────── */}
            <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black text-[var(--text-secondary)]">🤖 ANÁLISE IA — {ftBase}</span>
                {ftLoadAna && <span className="text-[10px] text-purple-400 animate-pulse">Analisando...</span>}
              </div>

              {ftAnalysis ? (() => {
                const n = ftAnalysis.niveis ?? {};
                const dir = ftAnalysis.direction as string;
                const isLong = dir === "LONG";
                const score = ftAnalysis.score_final ?? 0;
                const conf = ftAnalysis.direction_confidence ?? 0;
                const dirColor = dir === "LONG" ? "#22c55e" : dir === "SHORT" ? "#ef4444" : "#f59e0b";
                return (
                  <div className="space-y-2.5">
                    {/* Score + Direção */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 rounded-xl p-2.5 text-center"
                        style={{ background:"var(--bg-surface)",border:"1px solid var(--border)" }}>
                        <div className="text-[9px] font-bold text-[var(--text-secondary)]">SCORE</div>
                        <div className="text-lg font-black" style={{ color: score >= 65 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444" }}>
                          {score.toFixed(0)}
                        </div>
                        <div className="text-[9px] font-bold" style={{ color: score >= 65 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444" }}>
                          {ftAnalysis.grade}
                        </div>
                      </div>
                      <div className="flex-1 rounded-xl p-2.5 text-center"
                        style={{ background:"var(--bg-surface)",border:"1px solid var(--border)" }}>
                        <div className="text-[9px] font-bold text-[var(--text-secondary)]">DIREÇÃO</div>
                        <div className="text-base font-black mt-0.5" style={{ color: dirColor }}>
                          {dir === "LONG" ? "▲ LONG" : dir === "SHORT" ? "▼ SHORT" : "— NEUTRO"}
                        </div>
                        <div className="text-[9px] font-bold text-[var(--text-secondary)]">{conf.toFixed(0)}% conf.</div>
                      </div>
                      <div className="flex-1 rounded-xl p-2.5 text-center"
                        style={{ background:"var(--bg-surface)",border:"1px solid var(--border)" }}>
                        <div className="text-[9px] font-bold text-[var(--text-secondary)]">LAV. SUG.</div>
                        <div className="text-base font-black text-purple-400 mt-0.5">
                          {ftAnalysis.leverage_suggested}
                        </div>
                      </div>
                    </div>

                    {/* Níveis */}
                    {n.entrada && (
                      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                        <div className="rounded-lg p-2 text-center" style={{ background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)" }}>
                          <div className="text-[8px] font-bold text-emerald-500 mb-0.5">ENTRADA</div>
                          <div className="font-black text-[var(--text-primary)]">${fmtPrice(n.entrada)}</div>
                        </div>
                        <div className="rounded-lg p-2 text-center" style={{ background:"rgba(99,102,241,0.08)",border:"1px solid rgba(99,102,241,0.2)" }}>
                          <div className="text-[8px] font-bold text-indigo-400 mb-0.5">ALVO 1</div>
                          <div className="font-black" style={{ color: isLong ? "#22c55e" : "#ef4444" }}>${fmtPrice(n.alvo1)}</div>
                          <div className="text-[8px] text-[var(--text-muted)]">{n.alvo1_pct}% · R{n.rr1}</div>
                        </div>
                        <div className="rounded-lg p-2 text-center" style={{ background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)" }}>
                          <div className="text-[8px] font-bold text-red-400 mb-0.5">STOP</div>
                          <div className="font-black text-red-400">${fmtPrice(n.stop)}</div>
                          <div className="text-[8px] text-[var(--text-muted)]">{n.stop_pct}%</div>
                        </div>
                      </div>
                    )}

                    {/* Alvo 2 */}
                    {n.alvo2 && (
                      <div className="rounded-lg p-2 text-center text-[10px]"
                        style={{ background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.15)" }}>
                        <span className="text-[8px] font-bold text-indigo-400">ALVO 2 </span>
                        <span className="font-black" style={{ color: isLong ? "#22c55e" : "#ef4444" }}>${fmtPrice(n.alvo2)}</span>
                        <span className="text-[var(--text-muted)] ml-1">{n.alvo2_pct}% · R{n.rr2}</span>
                      </div>
                    )}

                    {/* Usar análise */}
                    {dir !== "NEUTRO" && n.alvo1 && n.stop && (
                      <button
                        onClick={() => {
                          setFtSide(isLong ? "LONG" : "SHORT");
                          setFtTp(String(n.alvo1));
                          setFtSl(String(n.stop));
                          if (ftOType === "LIMIT") setFtPrice(fmtPrice(n.entrada));
                        }}
                        className="w-full py-2 rounded-xl text-xs font-black transition-all"
                        style={{
                          background: isLong ? "linear-gradient(135deg,rgba(34,197,94,0.2),rgba(16,185,129,0.1))" : "linear-gradient(135deg,rgba(239,68,68,0.2),rgba(220,38,38,0.1))",
                          border: `1px solid ${isLong ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
                          color: dirColor,
                        }}>
                        ✨ Usar Análise IA ({dir}) — TP ${fmtPrice(n.alvo1)} · SL ${fmtPrice(n.stop)}
                      </button>
                    )}

                    {/* Indicadores rápidos */}
                    <div className="flex flex-wrap gap-1">
                      {[
                        { label:`Funding ${(ftAnalysis.funding_rate*100).toFixed(3)}%`, color: ftAnalysis.funding_rate > 0 ? "#ef4444":"#22c55e" },
                        { label:`Long ${ftAnalysis.long_pct?.toFixed(0)}%`, color: "#f59e0b" },
                        { label:`OI ${ftAnalysis.oi_change_pct >= 0 ? "+":""}${ftAnalysis.oi_change_pct?.toFixed(1)}%`, color: ftAnalysis.oi_change_pct >= 0 ? "#22c55e":"#ef4444" },
                      ].map(({ label, color }) => (
                        <span key={label} className="px-2 py-0.5 rounded text-[9px] font-bold"
                          style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color }}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })() : (
                <div className="text-center py-4 text-xs text-[var(--text-muted)]">
                  {ftLoadAna ? "Carregando análise..." : "Análise indisponível para este par"}
                </div>
              )}
            </div>

            {/* ── Formulário de Ordem ──────────────────────────────── */}
            <div id="ft-order-form" className="rounded-2xl p-5" style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>

              {/* Order type */}
              <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background:"var(--bg-surface)" }}>
                {(["MARKET","LIMIT"] as const).map(t => (
                  <button key={t} onClick={() => setFtOType(t)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{
                      background: ftOType === t ? "var(--bg-card)" : "transparent",
                      color: ftOType === t ? "var(--text-primary)" : "var(--text-muted)",
                      boxShadow: ftOType === t ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
                    }}>
                    {t}
                  </button>
                ))}
              </div>

              {/* LONG / SHORT */}
              <div className="flex gap-2 mb-4">
                {(["LONG","SHORT"] as const).map(s => (
                  <button key={s} onClick={() => setFtSide(s)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-black transition-all"
                    style={{
                      background: ftSide === s
                        ? s === "LONG" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"
                        : "var(--bg-surface)",
                      color: ftSide === s
                        ? s === "LONG" ? "#22c55e" : "#ef4444"
                        : "var(--text-muted)",
                      border: ftSide === s
                        ? `1px solid ${s === "LONG" ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"}`
                        : "1px solid var(--border)",
                    }}>
                    {s === "LONG" ? "▲ LONG" : "▼ SHORT"}
                  </button>
                ))}
              </div>

              {/* Limit price */}
              {ftOType === "LIMIT" && (
                <div className="mb-3">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">PREÇO ENTRADA (USDT)</label>
                  <input value={ftPrice} onChange={e => setFtPrice(e.target.value)}
                    placeholder={ftTick ? fmtPrice(ftTick.price) : "0.00"}
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-mono font-bold"
                    style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)",outline:"none" }}
                  />
                </div>
              )}

              {/* Colateral em USDT */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)]">
                    COLATERAL (USDT) · {ftLeverage}x
                    {ftAccount && <span className="text-purple-400"> · Disp: ${ftAccount.availableBalance.toFixed(2)}</span>}
                  </label>
                  {ftExInfo && (
                    <button onClick={() => setFtQtyUsdt(String(Math.ceil(ftMinColateral + 1)))}
                      className="text-[9px] px-2 py-0.5 rounded font-bold transition-all"
                      style={{ background:"rgba(168,85,247,0.15)",color:"#a855f7",border:"1px solid rgba(168,85,247,0.3)" }}>
                      Mín ~${Math.ceil(ftMinColateral + 1)}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input value={ftQtyUsdt} onChange={e => setFtQtyUsdt(e.target.value)} type="number" min="0"
                    placeholder={ftExInfo ? `Mín ~$${Math.ceil(ftMinColateral+1)}` : "Ex: 50"}
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-mono font-bold pr-16"
                    style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)",outline:"none" }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">USDT</span>
                </div>
                {ftAccount && (
                  <div className="flex gap-1 mt-1.5">
                    {[10,25,50,100].map(pct => (
                      <button key={pct} onClick={() => setFtQtyUsdt((ftAccount.availableBalance * pct/100).toFixed(2))}
                        className="flex-1 py-1 rounded-lg text-[10px] font-bold transition-all"
                        style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-muted)" }}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                )}
                {ftQtyUsdt && ftEffPrice > 0 && ftQty > 0 && (
                  <div className="rounded-lg px-3 py-1.5 mt-1.5 text-[10px] flex justify-between"
                    style={{ background:"var(--bg-surface)",border:"1px solid var(--border)" }}>
                    <span className="text-[var(--text-secondary)]">Qtd</span>
                    <span className="font-bold text-[var(--text-primary)]">{ftQty} {ftBase}</span>
                    <span className="text-[var(--text-secondary)]">Nocional</span>
                    <span className="font-bold text-purple-400">${ftNotional.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Take Profit */}
              <div className="mb-2">
                <label className="text-[10px] font-bold text-emerald-500 block mb-1">TAKE PROFIT (opcional)</label>
                <div className="relative">
                  <input value={ftTp} onChange={e => setFtTp(e.target.value)} type="number" min="0"
                    placeholder="Preço de saída (TAKE_PROFIT_MARKET)"
                    className="w-full px-3 py-2 rounded-xl text-sm font-mono"
                    style={{ background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.25)",color:"var(--text-primary)",outline:"none" }}
                  />
                  {ftTp && ftEffPrice > 0 && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-emerald-400">
                      {((parseFloat(ftTp)-ftEffPrice)/ftEffPrice*100*(ftSide==="SHORT"?-1:1)).toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Stop Loss */}
              <div className="mb-4">
                <label className="text-[10px] font-bold text-red-400 block mb-1">STOP LOSS (opcional)</label>
                <div className="relative">
                  <input value={ftSl} onChange={e => setFtSl(e.target.value)} type="number" min="0"
                    placeholder="Preço de stop (STOP_MARKET)"
                    className="w-full px-3 py-2 rounded-xl text-sm font-mono"
                    style={{ background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.25)",color:"var(--text-primary)",outline:"none" }}
                  />
                  {ftSl && ftEffPrice > 0 && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-red-400">
                      {((ftEffPrice-parseFloat(ftSl))/ftEffPrice*100*(ftSide==="SHORT"?-1:1)).toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Feedback */}
              {ftMsg && (
                <div className="rounded-xl px-3 py-2 mb-3 text-xs font-bold"
                  style={{
                    background: ftMsg.type === "ok" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                    border: `1px solid ${ftMsg.type === "ok" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                    color: ftMsg.type === "ok" ? "#22c55e" : "#ef4444",
                  }}>
                  {ftMsg.type === "ok" ? "✅ " : "❌ "}{ftMsg.text}
                </div>
              )}

              {/* Submit */}
              <button onClick={() => placeFuturesOrder(false)} disabled={ftPlacing || !connected}
                className="w-full py-3 rounded-xl text-sm font-black transition-all mb-2"
                style={{
                  background: !connected ? "rgba(255,255,255,0.05)"
                    : ftPlacing ? "rgba(255,255,255,0.1)"
                    : ftSide === "LONG"
                    ? "linear-gradient(135deg,#22c55e,#16a34a)"
                    : "linear-gradient(135deg,#ef4444,#dc2626)",
                  color: !connected || ftPlacing ? "var(--text-muted)" : "#fff",
                  cursor: !connected || ftPlacing ? "not-allowed" : "pointer",
                  boxShadow: !connected || ftPlacing ? "none"
                    : ftSide === "LONG" ? "0 4px 20px rgba(34,197,94,0.3)" : "0 4px 20px rgba(239,68,68,0.3)",
                }}>
                {ftPlacing ? "Enviando..." : !connected ? "Configure a API Key" :
                  `${ftSide === "LONG" ? "▲ Abrir LONG" : "▼ Abrir SHORT"} ${ftLeverage}x${ftTp||ftSl ? " + TP/SL" : ""}`}
              </button>

              {!connected && (
                <button onClick={() => { setKeyDraft(""); setSecDraft(""); setShowSetup(true); }}
                  className="w-full py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{ background:"rgba(168,85,247,0.12)",border:"1px solid rgba(168,85,247,0.3)",color:"#a855f7" }}>
                  🔑 Configurar API Key
                </button>
              )}
            </div>
          </div>

          {/* Order Book Futures */}
          <div className="lg:col-span-3 rounded-2xl overflow-hidden"
            style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor:"var(--border)" }}>
              <h3 className="text-sm font-black text-[var(--text-primary)]">
                📋 Order Book Futures — {ftPair.replace("USDT","/USDT")} PERP
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold"
                style={{ background:"rgba(168,85,247,0.15)",color:"#a855f7",border:"1px solid rgba(168,85,247,0.3)" }}>
                PERPÉTUO
              </span>
            </div>
            <div className="grid grid-cols-2 divide-x" style={{ borderColor:"var(--border)" }}>
              <div>
                <div className="grid grid-cols-2 px-3 py-1.5 text-[9px] font-bold text-emerald-500 border-b"
                  style={{ borderColor:"var(--border)",background:"rgba(34,197,94,0.04)" }}>
                  <span>PREÇO (USDT)</span><span className="text-right">QTD</span>
                </div>
                {ftBook.bids.slice(0,12).map(([price, qty], i) => {
                  const maxQ = Math.max(...ftBook.bids.slice(0,12).map(b => b[1]));
                  return (
                    <div key={i} className="relative grid grid-cols-2 px-3 py-1.5 text-[11px] hover:bg-emerald-500/5 cursor-default"
                      onClick={() => ftOType === "LIMIT" && setFtPrice(fmtPrice(price))}>
                      <div className="absolute inset-y-0 right-0 bg-emerald-500/8" style={{ width:`${maxQ>0?(qty/maxQ*100):0}%` }}/>
                      <span className="font-bold text-emerald-400 relative z-10">{fmtPrice(price)}</span>
                      <span className="text-right text-[var(--text-secondary)] relative z-10">{qty.toFixed(3)}</span>
                    </div>
                  );
                })}
              </div>
              <div>
                <div className="grid grid-cols-2 px-3 py-1.5 text-[9px] font-bold text-red-400 border-b"
                  style={{ borderColor:"var(--border)",background:"rgba(239,68,68,0.04)" }}>
                  <span>PREÇO (USDT)</span><span className="text-right">QTD</span>
                </div>
                {ftBook.asks.slice(0,12).map(([price, qty], i) => {
                  const maxQ = Math.max(...ftBook.asks.slice(0,12).map(a => a[1]));
                  return (
                    <div key={i} className="relative grid grid-cols-2 px-3 py-1.5 text-[11px] hover:bg-red-500/5 cursor-default"
                      onClick={() => ftOType === "LIMIT" && setFtPrice(fmtPrice(price))}>
                      <div className="absolute inset-y-0 left-0 bg-red-500/8" style={{ width:`${maxQ>0?(qty/maxQ*100):0}%` }}/>
                      <span className="font-bold text-red-400 relative z-10">{fmtPrice(price)}</span>
                      <span className="text-right text-[var(--text-secondary)] relative z-10">{qty.toFixed(3)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {ftBook.asks.length > 0 && ftBook.bids.length > 0 && (
              <div className="px-4 py-2 border-t text-center text-[10px] font-bold text-[var(--text-muted)]"
                style={{ borderColor:"var(--border)",background:"var(--bg-surface)" }}>
                Spread: ${(ftBook.asks[0][0] - ftBook.bids[0][0]).toFixed(ftTick?.price && ftTick.price > 1000 ? 2 : 4)}
              </div>
            )}
          </div>
        </div>

        {/* ── Posições / Ordens / Histórico ───────────────────────── */}
        {connected && (
          <div className="rounded-2xl overflow-hidden mb-5" style={{ background:"var(--bg-card)",border:"1px solid var(--border)" }}>
            <div className="flex border-b" style={{ borderColor:"var(--border)" }}>
              {([
                { k:"positions" as const, label:`Posições Abertas (${ftPositions.length})` },
                { k:"orders"    as const, label:`Ordens Abertas (${ftOrders.length})` },
                { k:"trades"    as const, label:`Histórico (${ftTrades.length})` },
              ]).map(({ k, label }) => (
                <button key={k} onClick={() => setFtBtab(k)}
                  className="px-5 py-3 text-xs font-bold transition-all border-b-2"
                  style={{
                    borderColor: ftBtab === k ? "#a855f7" : "transparent",
                    color: ftBtab === k ? "#a855f7" : "var(--text-muted)",
                    background: ftBtab === k ? "rgba(168,85,247,0.06)" : "transparent",
                  }}>
                  {label}
                </button>
              ))}
              <div className="ml-auto flex items-center pr-3">
                <button onClick={refreshFtAll}
                  className="text-[10px] px-2 py-1 rounded-lg"
                  style={{ background:"var(--bg-surface)",color:"var(--text-muted)",border:"1px solid var(--border)" }}>
                  ↻
                </button>
              </div>
            </div>

            {/* Posições */}
            {ftBtab === "positions" && (
              <div className="overflow-x-auto">
                {ftPositions.length === 0 ? (
                  <div className="py-10 text-center text-sm text-[var(--text-muted)]">Nenhuma posição aberta</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b text-[9px] uppercase font-bold text-[var(--text-secondary)]"
                        style={{ borderColor:"var(--border)",background:"var(--bg-surface)" }}>
                        <th className="px-4 py-2.5 text-left">Par</th>
                        <th className="px-4 py-2.5 text-center">Lado</th>
                        <th className="px-4 py-2.5 text-right">Tamanho</th>
                        <th className="px-4 py-2.5 text-right">Entrada</th>
                        <th className="px-4 py-2.5 text-right">Mark Price</th>
                        <th className="px-4 py-2.5 text-right">Liq. Price</th>
                        <th className="px-4 py-2.5 text-right">PnL Não Real.</th>
                        <th className="px-4 py-2.5 text-center">Lav</th>
                        <th className="px-4 py-2.5 text-center">Fechar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ftPositions.map((pos, i) => {
                        const isLong = pos.positionAmt > 0;
                        const pnlPct = pos.entryPrice > 0
                          ? ((pos.markPrice - pos.entryPrice) / pos.entryPrice * 100 * (isLong ? 1 : -1) * pos.leverage)
                          : 0;
                        return (
                          <tr key={i} className="border-b hover:bg-[var(--bg-surface)]/50"
                            style={{ borderColor:"var(--border)/40" }}>
                            <td className="px-4 py-2.5 font-black text-[var(--text-primary)]">
                              {pos.symbol.replace("USDT","/USDT")}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black"
                                style={{ background: isLong ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                  color: isLong ? "#22c55e" : "#ef4444" }}>
                                {isLong ? "▲ LONG" : "▼ SHORT"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-[var(--text-primary)]">
                              {Math.abs(pos.positionAmt).toFixed(4)} {pos.symbol.replace("USDT","")}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-[var(--text-secondary)]">
                              ${fmtPrice(pos.entryPrice)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-[var(--text-primary)]">
                              ${fmtPrice(pos.markPrice)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-red-400">
                              {pos.liquidationPrice > 0 ? `$${fmtPrice(pos.liquidationPrice)}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-black"
                              style={{ color: pos.unrealizedProfit >= 0 ? "#22c55e" : "#ef4444" }}>
                              {pos.unrealizedProfit >= 0 ? "+" : ""}${pos.unrealizedProfit.toFixed(2)}
                              <div className="text-[9px] font-normal" style={{ color: pnlPct >= 0 ? "#22c55e" : "#ef4444" }}>
                                {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold"
                                style={{ background:"rgba(168,85,247,0.15)",color:"#a855f7" }}>
                                {pos.leverage}x
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => {
                                  const origSide = isLong ? "LONG" : "SHORT";
                                  setFtSide(origSide);
                                  setFtPair(pos.symbol);
                                  placeFuturesOrder(true, Math.abs(pos.positionAmt));
                                }}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                                style={{ background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",color:"#ef4444" }}>
                                Fechar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Ordens abertas Futures */}
            {ftBtab === "orders" && (
              <div className="overflow-x-auto">
                {ftOrders.length === 0 ? (
                  <div className="py-10 text-center text-sm text-[var(--text-muted)]">Nenhuma ordem Futures aberta</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b text-[9px] uppercase font-bold text-[var(--text-secondary)]"
                        style={{ borderColor:"var(--border)",background:"var(--bg-surface)" }}>
                        <th className="px-4 py-2.5 text-left">Par</th>
                        <th className="px-4 py-2.5 text-center">Tipo</th>
                        <th className="px-4 py-2.5 text-center">Lado</th>
                        <th className="px-4 py-2.5 text-right">Preço</th>
                        <th className="px-4 py-2.5 text-right">Qtd</th>
                        <th className="px-4 py-2.5 text-center">Reduce</th>
                        <th className="px-4 py-2.5 text-center">Data</th>
                        <th className="px-4 py-2.5 text-center">Cancelar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ftOrders.map(ord => (
                        <tr key={ord.orderId} className="border-b hover:bg-[var(--bg-surface)]/50"
                          style={{ borderColor:"var(--border)/40" }}>
                          <td className="px-4 py-2.5 font-black text-[var(--text-primary)]">
                            {ord.symbol.replace("USDT","/USDT")}
                          </td>
                          <td className="px-4 py-2.5 text-center text-[var(--text-secondary)]">{ord.type}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-black"
                              style={{ background: ord.side === "BUY" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                color: ord.side === "BUY" ? "#22c55e" : "#ef4444" }}>
                              {ord.side}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--text-primary)]">
                            {parseFloat(ord.price) > 0 ? `$${fmtPrice(parseFloat(ord.price))}` :
                             parseFloat(ord.stopPrice) > 0 ? `Stop $${fmtPrice(parseFloat(ord.stopPrice))}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                            {parseFloat(ord.origQty).toFixed(4)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {ord.reduceOnly ? (
                              <span className="text-[9px] text-yellow-400 font-bold">✓</span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center text-[var(--text-secondary)]">
                            {new Date(ord.time).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button onClick={() => cancelFtOrder(ord)}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-bold"
                              style={{ background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",color:"#ef4444" }}>
                              Cancelar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Histórico Futures */}
            {ftBtab === "trades" && (
              <div className="overflow-x-auto">
                {ftTrades.length === 0 ? (
                  <div className="py-10 text-center text-sm text-[var(--text-muted)]">
                    Nenhum trade Futures para {ftPair.replace("USDT","/USDT")}
                  </div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b text-[9px] uppercase font-bold text-[var(--text-secondary)]"
                        style={{ borderColor:"var(--border)",background:"var(--bg-surface)" }}>
                        <th className="px-4 py-2.5 text-left">Par</th>
                        <th className="px-4 py-2.5 text-center">Lado</th>
                        <th className="px-4 py-2.5 text-right">Preço</th>
                        <th className="px-4 py-2.5 text-right">Qtd</th>
                        <th className="px-4 py-2.5 text-right">Realiz. PnL</th>
                        <th className="px-4 py-2.5 text-right">Taxa</th>
                        <th className="px-4 py-2.5 text-center">Data/Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ftTrades.map((t: any) => (
                        <tr key={t.id} className="border-b hover:bg-[var(--bg-surface)]/50"
                          style={{ borderColor:"var(--border)/40" }}>
                          <td className="px-4 py-2.5 font-black text-[var(--text-primary)]">
                            {t.symbol.replace("USDT","/USDT")}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-black"
                              style={{ background: t.side === "BUY" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                color: t.side === "BUY" ? "#22c55e" : "#ef4444" }}>
                              {t.side}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--text-primary)]">
                            ${fmtPrice(parseFloat(t.price))}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                            {parseFloat(t.qty).toFixed(6)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold"
                            style={{ color: parseFloat(t.realizedPnl ?? "0") >= 0 ? "#22c55e" : "#ef4444" }}>
                            {parseFloat(t.realizedPnl ?? "0") >= 0 ? "+" : ""}${parseFloat(t.realizedPnl ?? "0").toFixed(4)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                            {parseFloat(t.commission).toFixed(6)} {t.commissionAsset}
                          </td>
                          <td className="px-4 py-2.5 text-center text-[var(--text-secondary)]">
                            {new Date(t.time).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

      </>)} {/* end mainTab === "futures" */}

    </div>
  );
}
