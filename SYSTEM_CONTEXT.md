# One Piece Quant — System Context

> Complete reference for all working components. Updated 2026-05-29.
> This file exists so future sessions never lose context.

---

## Live URLs

| Service | URL |
|---------|-----|
| **Dashboard** | https://luffy-labs.vercel.app |
| **API** | https://onepiece-labs.vercel.app |
| **GitHub** | https://github.com/Negi27921/one-piece |
| **Telegram webhook** | https://onepiece-labs.vercel.app/api/telegram |

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + Python 3.11, Vercel serverless |
| Provider layer | `core/` — abstract interfaces + env-var registry |
| Database | Supabase (PostgreSQL cloud) |
| Local cache | DuckDB (`data/db/iqf.duckdb`) |
| Frontend | React 19 + Vite 5 + TypeScript + Tailwind + Framer Motion |
| State | TanStack Query v5 (server) + Zustand (UI) |
| Charts | Recharts + TradingView lightweight-charts |
| Icons | Lucide |
| Brokers | Kite (primary, when set) → Dhan → Shoonya (SmartOrderRouter) |
| LLM (chat) | Groq Llama 3.3 70B → Gemini → OpenRouter cascade |
| LLM (agent) | Groq Llama 3.3 70B |
| LLM (results) | NVIDIA NIM DeepSeek R1 (structured PDF extraction) |
| LLM (watchlist AI) | DeepSeek R1 via watchlist router |
| Fundamentals | StockInsights.ai (SI.ai) — filings, announcements, income statements |
| Email | Resend API |
| Notifications | Telegram Bot API |
| Scheduling | GitHub Actions cron (13 workflows) |

---

## Directory Structure

```
one-piece/
│
├── core/
│   ├── config.py                 # Unified Settings from env vars
│   ├── market_data.py            # Unified price-fetch API
│   └── providers/
│       ├── base.py               # Abstract interfaces (ABCs)
│       ├── registry.py           # @lru_cache singletons
│       ├── market/               # yfinance (default), nse, mock
│       ├── ai/                   # groq, gemini, openrouter, nvidia (NIM), chain, mock
│       ├── cache/                # memory (default), supabase, redis
│       ├── notifications/        # telegram, email, multi
│       └── stockinsights/        # SI.ai async client (rate-limited, dead-letter)
│
├── api/
│   ├── main.py                   # Local dev (DuckDB + WebSocket)
│   ├── cloud_main.py             # Vercel entry point (14 routers)
│   ├── universe.py               # Canonical universe (dim_company, ≥₹1000 Cr)
│   └── routers/
│       ├── screener.py           # L1 + L2 provider cache
│       ├── chat.py               # Uses core.market_data (fast_info only, <1s)
│       ├── portfolio.py          # Uses core.market_data.get_prices_bulk()
│       ├── journal.py            # Uses core.market_data.get_prices_bulk()
│       ├── settings.py           # /env + /system-info endpoints
│       ├── earnings.py           # earnings_results table (OCR pipeline)
│       ├── profile.py            # NEO stock profile (pre-materialized, <200ms)
│       └── watchlist.py          # Watchlist CRUD + DeepSeek R1 analysis
│
├── execution/
│   └── brokers/
│       ├── kite.py               # Zerodha Kite Connect (primary)
│       ├── dhan.py               # Dhan (fallback)
│       └── shoonya.py            # Shoonya (final fallback)
│   └── router.py                 # SmartOrderRouter: Kite → Dhan → Shoonya
│
├── scripts/
│   ├── neo_poller.py             # NEO master poller (6 concurrent SI.ai + NSE streams)
│   ├── si_realtime_poller.py     # SI.ai filings + announcements poller
│   ├── results_pipeline.py       # BSE PDF → DeepSeek R1 → Telegram
│   ├── screener_scraper.py       # Screener.in fundamentals bulk scraper
│   ├── si_universe_seed.py       # Seeds dim_company from SI.ai
│   ├── update_fii_dii.py         # Backfills FII/DII flows
│   └── migrations/               # 001–025 Supabase DDL files
│
└── dashboard/src/
    ├── App.tsx                   # Route-level lazy loading (9 pages)
    ├── api/
    │   ├── earnings-queries.ts   # useLatestEarnings, useEarningsStats, useEarningsQuarters
    │   ├── watchlist-queries.ts  # Watchlist CRUD + useAnalyseStock (DeepSeek R1)
    │   └── settings-queries.ts   # useSystemInfo hook
    ├── components/
    │   ├── charts/ChartDrawer.tsx  # TradingView OHLCV + AI analysis drawer
    │   ├── layout/Sidebar.tsx      # Navigation sidebar
    │   └── ui/ChatBot.tsx          # Extracted AI chat component
    └── pages/
        ├── EarningsPulse.tsx     # Live earnings (OCR pipeline)
        └── Watchlist.tsx         # User watchlists + AI stock analysis
```

---

## Provider System (core/)

Switch any provider by setting env var — no code changes:

| Env Var | Default | Options |
|---------|---------|---------|
| `MARKET_PROVIDER` | `yfinance` | `yfinance` \| `nse` \| `kite` \| `mock` |
| `AI_PROVIDER` | `groq` | `groq` \| `gemini` \| `openrouter` \| `nvidia` \| `mock` |
| `AI_FALLBACK_CHAIN` | `groq,gemini,openrouter` | comma-separated list |
| `CACHE_PROVIDER` | `memory` | `memory` \| `supabase` \| `redis` |
| `NOTIFY_PROVIDER` | `telegram` | `telegram` \| `email` \| `both` |

**Critical:** Set `CACHE_PROVIDER=supabase` on Vercel so screener results survive cold starts (run migration 002 first).

---

## Supabase Tables

### Core tables
| Table | Purpose |
|-------|---------|
| `paper_trades` | Auto paper trading activity |
| `strategy_notes` | Agent insights per strategy |
| `journal_trades` | Manual live trading journal |
| `app_config` | Kill switch state + agent config (migration 001) |
| `cache_entries` | L2 cache for CACHE_PROVIDER=supabase (migration 002) |
| `signals` | Normalized signal history (migration 003) |
| `watchlists` | User watchlist metadata (migration 006) |
| `watchlist_items` | Tickers in each watchlist (migration 006) |
| `quarterly_results` | Legacy quarterly results table |
| `earnings_results` | EarningsPulse OCR pipeline output (migration 025) |
| `trades` | Live/paper order log |
| `daily_pnl` | Daily portfolio performance |
| `monthly_reports` | Monthly P&L summaries |

### NEO pipeline tables (migrations 017–023)
| Table | Purpose |
|-------|---------|
| `dim_company` | Canonical stock universe (all NSE/BSE stocks with fundamentals) |
| `fact_income_statement` | Quarterly revenue, EBITDA, PAT |
| `fact_balance_sheet` | Assets, liabilities, equity |
| `fact_cash_flow` | Operating/investing/financing cash flows |
| `fact_results_calendar` | Upcoming + historical earnings dates |
| `fact_filings` | BSE/NSE regulatory filings (SI.ai sourced) |
| `fact_announcements_tagged` | Corporate announcements with AI topic tags |
| `fact_technicals` | Daily OHLCV + EMA/RSI/ATR indicators |
| `fact_screener_fundamentals` | Screener.in bulk data (P/E, ROCE, ROE, etc.) |
| `fact_market_realtime` | Live price state (refreshed every 5–15 min) |
| `fact_market_events` | Event bus for AI agent reactions + alerts |
| `job_run` | Async job queue (LLM thesis, data quality checks) |
| `data_quality_log` | Per-field quality audit trail |
| `si_dlq` | Dead-letter queue for failed SI.ai calls |

### Supabase credentials
- URL: `https://ohwgibzmaxfxivenbfhm.supabase.co`
- Anon key: in `.env` as `SUPABASE_KEY`
- Service role key: in `.env` as `SUPABASE_SERVICE_KEY` (earnings pipeline needs this)
- Use service role key or SQL Editor for seeding/DDL

---

## Screener Cache Architecture

L1 (in-process dict, 6h TTL) → L2 (provider, 24h TTL) → background scan

L2 provider determined by `CACHE_PROVIDER`:
- `memory` — same as L1, lost on cold start
- `supabase` — `cache_entries` table, survives restarts
- `redis` — Upstash/Redis, distributed

Cache keys: `"screener:{strategy}:{universe}"`

---

## SmartOrderRouter Priority

1. `KiteBroker` — if `KITE_API_KEY` + `KITE_ACCESS_TOKEN` set
2. `DhanBroker` — if `DHAN_CLIENT_ID` + `DHAN_ACCESS_TOKEN` set
3. `ShoonyaBroker` — always available (paper mode if no live creds)

---

## Screener Strategies

| Strategy | Key Conditions | SL | Hold |
|----------|---------------|-----|------|
| **VCP** | 4-wave contraction, tight base, vol dry-up, EMA stack | 4% | 15d |
| **IPO Base** | First consolidation ≤120d data, tight range, vol dry-up | 6% | 20d |
| **Rocket Base** | 60%+ in 90d, ≤20% correction, vol contracting | 10% | 10d |
| **Breakout** | Within 3% of 52W high, 1.8× vol surge, range expansion | 8% | 10d |
| **RSI Reversal** | RSI recovered from <33, positive divergence, vol surge | 6% | 7d |
| **Golden Cross** | EMA20 crossed EMA50 ≤10 bars ago, SMA200 slope up | 8% | 20d |
| **Multibagger** | 12 conditions: tech DNA + fundamental proxies | 15% | 30d |

---

## Scheduled Jobs

| Time (IST) | Days | Script |
|-----------|------|--------|
| 9:30 AM | Mon–Fri | `paper_trader.py --open` |
| 10:30 AM | Mon–Fri | `multibagger_alert.py` |
| 2:00 PM | Mon–Fri | `multibagger_alert.py` |
| 3:15 PM | Mon–Fri | `paper_trader.py --check` |
| Every 20 min | Mon–Fri | `results_pipeline.py` (BSE earnings PDF) |
| 10:00 PM | Mon–Fri | `daily_report.py` (incl. strategy_agent) |
| 1st of month | Always | `monthly_report.py` |
| Biweekly | Mon–Fri | `screener_refresh.py` (full NSE) |

---

## Environment Variables

### Required
```
SUPABASE_URL, SUPABASE_KEY
GROQ_API_KEY (or GEMINI_API_KEY or OPENROUTER_API_KEY)
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
RESEND_API_KEY, REPORT_EMAIL
```

### Provider selection (all optional)
```
MARKET_PROVIDER=yfinance
AI_PROVIDER=groq
AI_FALLBACK_CHAIN=groq,gemini,openrouter
CACHE_PROVIDER=memory           # → supabase recommended on Vercel
NOTIFY_PROVIDER=telegram
```

### Broker credentials (all optional)
```
KITE_API_KEY, KITE_API_SECRET, KITE_ACCESS_TOKEN
DHAN_CLIENT_ID, DHAN_ACCESS_TOKEN
UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
```

### NEO pipeline (optional)
```
SI_API_KEY                      # StockInsights.ai (fundamentals, filings)
NVIDIA_API_KEY                  # NVIDIA NIM DeepSeek R1 (results pipeline)
SUPABASE_SERVICE_KEY            # Service role key (earnings pipeline DDL)
```

### Feature flags
```
ENABLE_PAPER_TRADING=true
ENABLE_LIVE_TRADING=false
DEPLOYMENT_MODE=cloud
```

---

## GitHub Secrets Status (as of 2026-05-29)

```
SUPABASE_URL ✅
SUPABASE_KEY ✅
RESEND_API_KEY ✅
REPORT_EMAIL ✅
TELEGRAM_BOT_TOKEN ✅
TELEGRAM_CHAT_ID ✅
GROQ_API_KEY ✅
GEMINI_API_KEY → add for fallback + OCR pipeline
OPENROUTER_API_KEY → add for fallback
NVIDIA_API_KEY → add for results_pipeline.py (DeepSeek R1)
SI_API_KEY → add for NEO data pipeline (StockInsights.ai)
KITE_API_KEY → add when ready for live Zerodha integration
SUPABASE_SERVICE_KEY → add for earnings pipeline (needs service role)
```

---

## API Endpoints (full list)

### Screener
```
GET  /api/screener/results?strategy=vcp&universe=nifty500&min_confidence=70
POST /api/screener/scan?strategy=multibagger
GET  /api/screener/status
POST /api/screener/prewarm
```

### Market
```
GET /api/market/status, /indices, /global-indices, /fii-dii, /fii-dii/today
GET /api/market/fii-dii/sectors, /movers, /sectors, /filings
GET /api/market/corporate-actions, /advances-declines, /results-calendar
GET /api/market/quarterly-results, /history/{ticker}, /quote
```

### Portfolio / Journal / Risk / Strategies
```
GET/POST/PUT/DELETE /api/portfolio/* (positions, equity-curve, pnl-calendar, paper-trades, live)
GET/POST/PUT/DELETE /api/journal/* (trades, summary, prices, positions, pnl-calendar)
GET /api/risk/metrics, /risk/limits
GET /api/strategies/performance, /signals, /allocation
GET /api/trades/orders, /fills, /stats
```

### Earnings (NEW)
```
GET /api/earnings/results           # Paginated earnings cards (latest first)
GET /api/earnings/stats             # Aggregate stats by rating
GET /api/earnings/quarters          # Available quarters
```

### Watchlists (NEW)
```
GET/POST /api/watchlists
GET/POST/DELETE /api/watchlists/{id}/items
POST /api/watchlists/{id}/analyse   # DeepSeek R1 AI analysis
```

### Profile (NEW — NEO)
```
GET /api/profile/{symbol}           # Hydrated stock profile (<200ms, pre-materialized)
```

### Settings
```
GET  /api/settings/providers
POST /api/settings/providers/probe
GET  /api/settings/brokers
GET  /api/settings/alerts
POST /api/settings/alerts/test-telegram
GET  /api/settings/env
GET  /api/settings/system-info      # full credential status
GET  /api/settings/agent-config
PUT  /api/settings/agent-config
```

### System + Chat
```
GET  /api/system/health, /kill-switch/status, /audit-log
POST /api/chat/message
POST /api/telegram
GET  /health
WS   /ws  (local only)
```

---

## Frontend Pages

| Route | Page | Key Features |
|-------|------|-------------|
| `/` | Market Terminal | Indices, FII/DII bars, sector heatmap, movers, BSE filings, AI chat |
| `/screener` | Screener | 7 strategies × 2 universes, confidence badges, background scan |
| `/portfolio` | Portfolio | HOLDINGS \| P&L \| TRADES \| LIVE tabs |
| `/risk` | Risk | Drawdown chart, VaR, Sharpe, kill switch, sector limits |
| `/journal` | Trading Journal | Add/exit/delete manual trades; cost-basis NAV |
| `/results` | Earnings Results | Quarterly rated cards (Excellent→Weak), mini sparklines |
| `/watchlist` | Watchlist | Watchlists with ChartDrawer + DeepSeek R1 stock analysis |
| `/earnings-pulse` | EarningsPulse | Live earnings from OCR pipeline — Sales, OPM, PAT QoQ/YoY |
| `/settings` | Settings | Agent config · System Providers panel · LLM · Brokers · Alerts · Risk |

All pages lazy-loaded via `React.lazy()` + `Suspense`. First paint ~80 KB.

---

## Key Design Decisions

1. **Provider abstraction** — All external deps abstracted. Swap by changing env vars.
2. **L2 cache** — Screener results go through `get_cache()`, not hardcoded Supabase. `CACHE_PROVIDER=supabase` recommended on Vercel.
3. **fast_info only** — `ticker.info` banned from all API paths (3–10s). All context uses `fast_info` (<1s).
4. **Route-level lazy loading** — 9 pages split into separate chunks; first paint ~80 KB.
5. **SmartOrderRouter** — Auto-selects best available broker from credentials.
6. **Fixed ₹25,000 paper trades** — Simplifies strategy comparison.
7. **Hermes-style agent loop** — Groq function-calling analyses 30d paper trades nightly.
8. **Matrix/space terminal theme** — #020407 bg, #00ff87 primary, glassmorphism cards, JetBrains Mono.
9. **Dual-channel failure alerts** — Email fails → Telegram; Telegram fails → email.
10. **Vercel 10s budget** — Every endpoint has been profiled to fit.
11. **NEO pre-materialized profiles** — `GET /api/profile/{symbol}` never makes external calls. All data is pre-populated by the NEO poller and results pipeline. p95 target <200ms.
12. **Deterministic ratings** — EarningsPulse ratings (Excellent→Weak) are computed from metric thresholds, not AI opinion. Avoids hallucination in high-stakes financial output.
13. **Canonical universe** — `api/universe.py` is the single import point for stock universe filtering. All modules use `UNIVERSE_MIN_MCAP_CR = 1000` from there.

---

## Documentation Files

- `README.md` — Full project guide with API reference, setup, env vars
- `ARCHITECTURE.md` — Deep technical architecture (flows, provider layer, NEO pipeline, bundle chunks)
- `SYSTEM_CONTEXT.md` — This file: operational reference for future sessions
