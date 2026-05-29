# One Piece — System Architecture

> Last updated: 2026-05-29

## Overview

One Piece is a full-stack automated quantitative hedge fund for Indian equities (NSE/BSE). Two runtime environments:

| Mode | Entry point | Storage | WebSocket | Deployed on |
|------|------------|---------|-----------|-------------|
| **Local** | `api/main.py` | DuckDB | Yes (`/ws`) | Developer machine |
| **Cloud** | `api/cloud_main.py` | Supabase | No | Vercel (serverless) |

---

## Directory Map

```
one-piece/
├── core/                       # Provider abstraction layer
│   ├── config.py               # Unified Settings class (all env vars, one import)
│   ├── market_data.py          # Public price-fetch API (replaces 3 duplicate helpers)
│   └── providers/
│       ├── base.py             # Abstract interfaces: MarketDataProvider, AIProvider,
│       │                       #   CacheProvider, NotificationProvider, BrokerProvider
│       ├── registry.py         # Factory singletons with @lru_cache — get_market_provider(),
│       │                       #   get_ai_provider(), get_cache(), get_notifier()
│       ├── market/             # yfinance (default), nse (nsepython), mock
│       ├── ai/                 # groq, gemini, openrouter, nvidia (NIM/DeepSeek R1),
│       │                       #   chain (cascade), mock
│       ├── cache/              # memory (default), supabase (cache_entries), redis
│       ├── notifications/      # telegram, email (Resend), multi (both)
│       └── stockinsights/      # StockInsights.ai async client
│           ├── client.py       # Rate-limited (10 req/s), retry, dead-letter to si_dlq
│           └── models.py       # Pydantic models for SI.ai responses
│
├── api/                        # FastAPI application
│   ├── _config.py              # Shared CORS, versioning, router prefixes
│   ├── main.py                 # Local dev entry point (DuckDB + WebSocket)
│   ├── cloud_main.py           # Vercel entry point (Supabase stubs, no WebSocket)
│   ├── universe.py             # Canonical stock universe (dim_company, ≥₹1000 Cr mcap)
│   ├── middleware/
│   │   └── security.py         # HSTS, X-Frame, CSP, Referrer-Policy headers
│   └── routers/
│       ├── chat.py             # AI assistant — uses core.market_data (fast_info only)
│       ├── earnings.py         # Quarterly earnings cards (earnings_results table, OCR pipeline)
│       ├── journal.py          # Trading journal CRUD + NAV + parallel price fetch
│       ├── market.py           # Indices, FII/DII, movers, filings, OHLCV
│       ├── portfolio.py        # Paper/live positions, equity curve, P&L calendar
│       ├── profile.py          # NEO stock profile (hydrated from dim_company + fact_*)
│       ├── risk.py             # Drawdown, Sharpe, kill switch
│       ├── screener.py         # 7-strategy screener, L1+L2 cache, background scan
│       ├── settings.py         # LLM/broker/alert config, system-info endpoint
│       ├── strategies.py       # Strategy performance, signals, allocation
│       ├── system.py           # Kill switch, audit log (local DuckDB)
│       ├── telegram_bot.py     # Telegram webhook (cloud only)
│       ├── trades.py           # Screener auto-trade log
│       └── watchlist.py        # Watchlist CRUD + DeepSeek R1 stock analysis
│
├── execution/                  # Order management system
│   ├── brokers/
│   │   ├── base.py             # BrokerInterface ABC + dataclasses
│   │   ├── kite.py             # Zerodha Kite Connect — real-time, primary
│   │   ├── dhan.py             # Dhan — fallback
│   │   └── shoonya.py          # Shoonya/Finvasia — final fallback
│   ├── router.py               # SmartOrderRouter: Kite → Dhan → Shoonya
│   ├── oms.py                  # Order lifecycle management
│   ├── slippage.py             # Slippage estimation
│   └── reconciliation.py       # Position reconciliation
│
├── dashboard/                  # React 19 + TypeScript (Vite 5)
│   └── src/
│       ├── App.tsx             # Route-level lazy loading (9 pages)
│       ├── api/
│       │   ├── client.ts       # Typed HTTP wrapper (timeout, retry, ApiError)
│       │   ├── earnings-queries.ts  # useLatestEarnings, useEarningsStats hooks
│       │   ├── market-queries.ts    # Indices, FII/DII, screener, movers
│       │   ├── pnl-queries.ts       # P&L calendar, paper positions, journal
│       │   ├── queries.ts           # Portfolio, risk, strategies, system
│       │   ├── settings-queries.ts  # useSystemInfo + LLM/broker/alert config
│       │   ├── watchlist-queries.ts # Watchlist CRUD + useAnalyseStock (DeepSeek R1)
│       │   └── types.ts
│       ├── components/
│       │   ├── charts/
│       │   │   └── ChartDrawer.tsx  # Slide-in TradingView OHLCV chart + AI analysis panel
│       │   ├── layout/
│       │   │   ├── Layout.tsx       # Shared layout wrapper (sidebar + header)
│       │   │   └── Sidebar.tsx      # Navigation sidebar
│       │   └── ui/
│       │       └── ChatBot.tsx      # Extracted AI chat component (used in Market page)
│       └── pages/
│           ├── EarningsPulse.tsx    # Earnings calendar + rated cards (OCR pipeline)
│           ├── Login.tsx            # Password-gated entry (24h session cookie)
│           ├── Market.tsx           # Market terminal (indices, FII/DII, movers, chat)
│           ├── Portfolio.tsx        # Holdings, P&L calendar, auto-trades, live tab
│           ├── Results.tsx          # Quarterly earnings results (Excellent→Weak)
│           ├── Risk.tsx             # Drawdown, VaR, kill switch status
│           ├── Screener.tsx         # 7 strategies, confidence filter, background scan
│           ├── Settings.tsx         # Agent config, system-info panel, providers
│           ├── TradingJournal.tsx   # Manual live trade journal
│           └── Watchlist.tsx        # User watchlists + DeepSeek R1 analysis
│
├── scripts/
│   ├── paper_trader.py             # ₹25K/trade auto paper trading
│   ├── multibagger_alert.py        # High-conviction morning + afternoon alerts
│   ├── daily_report.py             # 10 PM Telegram + email report
│   ├── strategy_agent.py           # Groq function-calling — analyses 30d paper trades
│   ├── monthly_report.py           # Monthly P&L summary
│   ├── neo_poller.py               # NEO master poller (6 concurrent SI.ai + NSE streams)
│   ├── si_realtime_poller.py       # SI.ai filings + announcements + results calendar
│   ├── results_pipeline.py         # BSE PDF → NVIDIA NIM DeepSeek R1 → Telegram
│   ├── screener_scraper.py         # Screener.in fundamentals bulk scraper
│   ├── si_universe_seed.py         # Seeds dim_company from StockInsights.ai
│   ├── update_fii_dii.py           # Backfills FII/DII flows into Supabase
│   └── migrations/                 # 025 Supabase migration files (run in order)
│
├── risk/                       # Kill switch, position sizer, drawdown, limits
├── data/                       # Data pipeline, DuckDB + Supabase storage
├── backtest/                   # India equity backtester
└── .github/workflows/          # CI + 13 scheduled workflows
```

---

## Provider Abstraction Layer

The `core/` package decouples all external dependencies from business logic. Every router that needs market data, AI, or caching imports from `core/` — never directly from `yfinance`, `groq`, etc.

### Pattern

```python
# Any router — one line to swap providers
from core.providers.registry import get_cache, get_market_provider

cache = get_cache()            # memory | supabase | redis — per CACHE_PROVIDER env var
prices = get_market_provider() # yfinance | nse | kite — per MARKET_PROVIDER env var
```

### Singleton lifecycle

Registry functions use `@lru_cache(maxsize=1)` — each process creates exactly one instance per provider type. First call reads the env var and constructs; subsequent calls return the same object. On Vercel serverless, each lambda worker has its own singleton (not shared across instances — that's why `CACHE_PROVIDER=supabase` matters for cross-instance state).

### Adding a new provider

1. Create `core/providers/<type>/<name>_provider.py` implementing the ABC from `base.py`
2. Add a branch in `registry.py` matching the new env var value
3. Set `MARKET_PROVIDER=yourname` — zero other code changes needed

---

## Screener Cache Architecture

Two-level cache designed for Vercel serverless cold starts:

```
Request arrives
      │
      ▼
L1: in-process dict          ← warm after first request in this lambda worker
    TTL = 6h
    (lost on cold start)
      │ miss
      ▼
L2: CacheProvider            ← configured via CACHE_PROVIDER
    TTL = 24h
    ┌─────────────────────────────────────┐
    │ memory   → same as L1 (no benefit)  │
    │ supabase → cache_entries table      │ ← recommended on Vercel
    │ redis    → Upstash/Redis            │ ← best for high traffic
    └─────────────────────────────────────┘
      │ miss
      ▼
Background scan              ← ThreadPoolExecutor, never blocks GET
Returns stale or []          ← GET responds immediately with is_scanning=true
```

Cache keys: `"screener:{strategy}:{universe}"` (e.g. `"screener:vcp:nifty500"`)

---

## Smart Order Router

```
place_order(order)
      │
      ▼
_default_primary()
  ├─ settings.has_kite → KiteBroker()   (KITE_API_KEY + KITE_ACCESS_TOKEN set)
  └─ fallback          → DhanBroker()   (DHAN_CLIENT_ID + DHAN_ACCESS_TOKEN set)
      │
      ▼
primary.place_order(order)
  │ success → return result
  │ failure (≥3 consecutive) → ShoonyaBroker fallback
      │
      ▼
fallback.place_order(order)
```

To upgrade to Kite execution: add `KITE_API_KEY` and `KITE_ACCESS_TOKEN` to env — no code changes.

---

## NEO Stock Profile Pipeline

A structured data pipeline that populates pre-materialized Supabase tables for sub-200ms hydrated stock profiles.

### Data Sources

| Source | Data | Cadence |
|--------|------|---------|
| StockInsights.ai | Filings, announcements, income/BS/CF statements, results calendar | Every 60s (SI poller) |
| yFinance | Daily OHLCV + technical indicators (EMA, RSI, ATR) | Daily at 15:40 IST |
| Screener.in | Market cap, P/E, ROCE, ROE, debt/equity, promoter holding | Periodic bulk scrape |
| NSE API | Bulk/block deals | Every 15 min during market hours |
| BSE filings PDF | Quarterly results (PDF extraction) | Every 20 min (results pipeline) |

### NEO Poller (`scripts/neo_poller.py`)

Single process, 6 concurrent async streams:
1. **Announcements** — SI.ai tagged feed, every 60s
2. **Filings** — SI.ai regulatory filings, every 60s
3. **Fundamentals** — SI.ai income/BS/CF statements, triggered on new results + slow backfill
4. **Results Calendar** — SI.ai calendar, every 60 min
5. **Technicals** — yFinance OHLCV + indicators, daily at 15:40 IST + on-demand
6. **Bulk/Block Deals** — NSE API, every 15 min during market hours

### Profile API (`GET /api/profile/{symbol}`)

```python
# All data is pre-materialized; no external calls on request path
# p95 target: <200ms
{
  "symbol": "RELIANCE",
  "company": "Reliance Industries Ltd",
  "sector": "Energy",
  # From dim_company
  "market_cap_cr": 1847000,
  "cmp": 2890,
  "pe_ratio": 24.5,
  # From fact_screener_fundamentals
  "roe": 11.2,
  "roce": 13.4,
  "debt_equity": 0.43,
  # From fact_income_statement (latest quarter)
  "revenue_cr": 250000,
  "pat_cr": 18000,
  # From fact_market_realtime
  "ltp": 2895,
  "day_change_pct": 0.8,
  # From fact_filings (latest)
  "latest_filing": { ... }
}
```

### StockInsights.ai Client (`core/providers/stockinsights/client.py`)

```python
# Rate-limited async client
# Token bucket: 10 req/s sustained, burst 20
# Retry: 3 attempts, exponential backoff 1→8s with jitter
# Dead-letter: persistent failures → si_dlq Supabase table
# Observability: in-process counters per endpoint
```

---

## EarningsPulse Data Pipeline

BSE financial results → structured quarterly cards → Telegram + dashboard.

```
GitHub Actions (results_pipeline.yml) — every 20 min weekdays
  → scripts/results_pipeline.py
      → Fetch BSE filing list (Financial Results category)
      → Deduplicate against earnings_results by filing_id
      → For each new filing:
          → Download PDF (pdfminer text extraction)
          → POST to NVIDIA NIM DeepSeek R1
              → structured JSON: Sales, OP, OPM, PAT, EPS (QoQ + YoY)
          → Deterministic rating: Excellent | Great | Good | Ok | Weak
              → NOT AI opinion — computed from metric thresholds
          → Fetch live CMP + market cap via yfinance fast_info
          → UPSERT to earnings_results (Supabase)
          → Telegram alert with rating + key metrics
```

**Why NVIDIA NIM over OpenRouter:** Direct NVIDIA inference — lower latency, dedicated capacity for structured extraction tasks.

---

## Frontend Architecture

### Routing

`react-router-dom` v6 with a shared `<Layout>` wrapper. All 9 pages are **lazy-loaded** via `React.lazy()` — each page JS chunk is downloaded only when the user first navigates to that route.

```
/                → MarketPage         (lazy) — market terminal + AI chat
/screener        → ScreenerPage       (lazy) — 7 strategies, confidence filter
/portfolio       → PortfolioPage      (lazy) — holdings, P&L, paper trades
/risk            → RiskPage           (lazy) — drawdown, VaR, kill switch
/journal         → TradingJournalPage (lazy) — manual trade CRUD
/results         → ResultsPage        (lazy) — quarterly rated cards
/watchlist       → WatchlistPage      (lazy) — watchlists + AI stock analysis
/earnings-pulse  → EarningsPulsePage  (lazy) — live earnings from OCR pipeline
/settings        → SettingsPage       (lazy) — providers, brokers, alerts
```

First paint downloads ~80 KB instead of ~235 KB.

### Data Fetching

All server state uses `@tanstack/react-query`. Key behaviours:
- Default timeout: 10s, chat endpoints: 35s
- GET: one automatic retry on network failure (not 4xx/5xx)
- Errors surface as `ApiError(message, status, path)`

### ChartDrawer Component

`components/charts/ChartDrawer.tsx` — slide-in panel activated from Watchlist and other pages:
- TradingView `lightweight-charts` candlestick chart (OHLCV)
- Live price via `useLivePrice` React Query hook
- Stock fundamentals via `useStockFundamentals`
- AI analysis via `useAnalyseStock` (DeepSeek R1 via watchlist router)
- TradingView widget map for NSE indices (NIFTY50, BANKNIFTY, etc.)

### Bundle Chunks (Vite `manualChunks`)

| Chunk | Contents | Gzip |
|-------|---------|------|
| `vendor-charts` | recharts | ~112 KB |
| `vendor-motion` | framer-motion | ~40 KB |
| `vendor-icons` | lucide-react | ~6 KB |
| `vendor-query` | @tanstack/react-query | ~15 KB |
| `nse-data` | NSE 500 symbol list | ~38 KB |
| Per-page chunks | Each page file | 5–30 KB each |

---

## Settings Page — Provider Health

The Settings → Connections tab shows a live provider status grid via `GET /api/settings/system-info`:

```json
{
  "market": "yfinance",
  "ai": "groq",
  "ai_chain": ["groq", "gemini", "openrouter"],
  "cache": "memory",
  "notify": "telegram",
  "has_kite": false,
  "has_dhan": false,
  "has_groq": true,
  "has_gemini": false,
  "has_redis": false,
  "has_nvidia": false,
  "has_si": false,
  "live_trading": false,
  "paper_trading": true,
  "deployment": "cloud",
  "brokers": { "dhan": false, "kite": false, "shoonya": false },
  "notifications": { "telegram": true, "email": false }
}
```

---

## Backend: Key Design Decisions

### Timeout budget (Vercel 10s limit)

| Operation | Old time | New time | Fix |
|-----------|---------|----------|-----|
| `ticker.info` in chat context | 3–10s | — | Replaced with `fast_info` (<1s) |
| Bulk price fetch | Sequential | Parallel | `ThreadPoolExecutor`, 7s total timeout |
| Screener scan | Blocks GET | Background | Never blocks; returns immediately with `is_scanning` |
| AI cascade | No timeout | 5s + 6s + 6s | Hard per-provider timeout, 8.5s total budget |
| Profile API | External calls on request | Pre-materialized | Supabase read, p95 <200ms |

### NAV computation

`/api/journal/summary` computes NAV from `buy_price × quantity` (cost basis) — no yFinance in the critical path. Live prices fetched separately via `/api/journal/prices` using parallel threads.

### Canonical universe

`api/universe.py` is the single source of truth for stock universe filtering. All screener, breadth, and portfolio queries use `UNIVERSE_MIN_MCAP_CR = 1000` (₹1000 Cr minimum). Universe reads from `dim_company` with a 1-hour in-process cache.

### WebSocket (local only)

Vercel serverless doesn't support persistent connections. `/ws` (portfolio snapshots every 5s) is only in `main.py`. Cloud frontend polls HTTP endpoints.

### Dual system router

- `api/routers/system.py` — full DuckDB-backed (local dev)
- Inline stubs in `cloud_main.py` — lightweight (Vercel)

---

## Supabase Migrations

Run once in Supabase SQL Editor in order:

| File | Creates | Enables |
|------|---------|---------|
| `001_app_config.sql` | `app_config` | Persistent kill switch + agent config |
| `002_cache_entries.sql` | `cache_entries` | `CACHE_PROVIDER=supabase` (cross-lambda cache) |
| `003_signals_table.sql` | `signals` | Normalized signal history |
| `004_journal_trades.sql` | `journal_trades` | Trading journal schema |
| `005_quarterly_results.sql` | `quarterly_results` | Legacy results table |
| `006_watchlists.sql` | `watchlists`, `watchlist_items` | User watchlist CRUD |
| `007–016_*.sql` | Universe, industry, RLS | Stock universe + permissions |
| `017_neo_schema.sql` | `dim_company`, `fact_income_statement`, `fact_balance_sheet`, `fact_cash_flow`, `fact_results_calendar`, `fact_filings`, `fact_announcements_tagged`, `job_run`, `data_quality_log`, `si_dlq` | Full NEO data pipeline |
| `018_neo_technicals_schema.sql` | `fact_technicals` | Daily OHLCV + indicators |
| `019_screener_schema.sql` | `fact_screener_fundamentals` | Screener.in bulk data cache |
| `020_market_realtime_schema.sql` | `fact_market_realtime` | Live price state (5–15 min refresh) |
| `021_stock_snapshot_view.sql` | Materialized view | Unified stock snapshot |
| `022_screener_trigger.sql` | PG trigger | Auto-action on scan completion |
| `023_event_bus_schema.sql` | `fact_market_events` | AI agent reaction + alert bus |
| `024_journal_trades_broker_fields.sql` | Broker columns | Broker-linked journal entries |
| `025_earnings_results.sql` | `earnings_results` | OCR earnings pipeline output |

---

## Data Flows

### Screener / Auto-Trades

```
GitHub Actions (paper_trading.yml) — 9:30 AM
  → scripts/paper_trader.py --open
      → GET /api/screener/results?strategy=vcp&min_confidence=70
          → L1/L2 cache hit (instant)
      → POST /api/portfolio/paper-positions  → Supabase paper_trades

GitHub Actions — 3:15 PM
  → scripts/paper_trader.py --check
      → fetch LTP via core.market_data.get_prices_bulk()
      → PUT /api/portfolio/paper-positions/{ticker}/exit
```

### Earnings Pipeline

```
GitHub Actions (results_pipeline.yml) — every 20 min weekdays
  → scripts/results_pipeline.py
      → BSE filings API → filter Financial Results
      → deduplicate against earnings_results
      → PDF download → pdfminer text extraction
      → NVIDIA NIM DeepSeek R1 → structured JSON
      → deterministic rating (Excellent→Weak)
      → yfinance fast_info → CMP + market cap
      → UPSERT earnings_results
      → Telegram alert
```

### NEO Data Pipeline

```
scripts/neo_poller.py (persistent process, Railway/Fly.io)
  ├─ Stream 1: SI.ai announcements (60s) → fact_announcements_tagged
  ├─ Stream 2: SI.ai filings (60s) → fact_filings
  ├─ Stream 3: SI.ai fundamentals (on-demand + backfill) → fact_income_statement etc.
  ├─ Stream 4: SI.ai results calendar (60 min) → fact_results_calendar
  ├─ Stream 5: yFinance OHLCV (daily 15:40 IST) → fact_technicals
  └─ Stream 6: NSE bulk/block deals (15 min) → fact_market_realtime

GET /api/profile/{symbol}
  → reads dim_company + fact_* (pre-materialized, <200ms)
  → no external calls on request path
```

### Daily Report

```
GitHub Actions (daily_report.yml) — 10:00 PM
  → scripts/strategy_agent.py
      → Groq function-calling → reads paper_trades (30d)
      → saves insights → Supabase strategy_notes
  → scripts/daily_report.py
      → screener hits, P&L summary, top picks, agent insights
      → Telegram + Email (Resend)
```

### AI Chat Request

```
POST /api/chat/message { symbol: "RELIANCE", messages: [...] }
  → core.market_data.get_stock_context("RELIANCE", fast=True)   # <1s, fast_info only
  → core.providers.registry.get_ai_chain().complete(...)
      → GroqProvider  (timeout: 5s)
      → GeminiProvider (timeout: 6s, if Groq fails)
      → OpenRouterProvider (timeout: 6s, if Gemini fails)
  → response within 8.5s total budget
```

---

## CI/CD

### `.github/workflows/ci.yml`

1. **Frontend**: `npm ci` → `eslint` → `tsc --noEmit` → `vite build`
2. **Backend**: `ruff check` → `ruff format --check` → `pyright`

### Scheduled automation (13 workflows total)

| File | Schedule | Job |
|------|---------|-----|
| `screener_scan.yml` | Daily weekdays | NSE 500 full scan |
| `screener_biweekly.yml` | Bi-weekly weekdays | Full NSE (~2137) scan |
| `paper_trading.yml` | 9:30 AM + 3:15 PM | Open/check paper trades |
| `daily_report.yml` | 10:00 PM | Strategy agent + report |
| `monthly_report.yml` | 1st of month | P&L summary |
| `multibagger_alert.yml` | 10:30 AM + 2:00 PM | High-conviction alerts |
| `results_pipeline.yml` | Every 20 min weekdays | BSE earnings PDF pipeline |
| `market_realtime.yml` | Market hours | Real-time market data poller |
| `breakout_monitor.yml` | Market hours | Breakout strategy monitor |
| `backfill_results.yml` | On-demand | Quarterly results backfill |
| `universe_agent.yml` | Weekly | Universe filter agent |
| `keep-alive.yml` | Every 20h | Prevent Vercel cold start |
