"""AI Hedge Fund — 13 legendary investor agents backed by our Supabase intelligence layer.

Data stack per analysis:
  • dim_company          → company master, market cap, sector, 52w high/low, current price
  • fact_income_statement → revenue, PAT, OPM last 8 quarters
  • fact_balance_sheet   → debt, equity, cash
  • fact_announcements_tagged → news with sentiment (our EarningsPulse pipeline)
  • earnings_results     → recent quarterly results (EarningsPulse OCR)
  • yfinance             → live price, P/E, P/B, ROE, beta (augmentation layer)
  • Price history (yfinance) → RSI-14, 50/200-day MA, momentum signals

LLM: Gemini Flash 2.0 via REST (primary) → Groq Llama 3.3 (fallback)
Consensus: ≥60 % bullish → auto paper-trade at CMP
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import re
from datetime import date, datetime
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

# ── Supabase client (re-uses core config) ─────────────────────────────────────

def _sb():
    from supabase import create_client
    from core.config import settings
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

def _sb_key() -> str:
    return os.getenv("SUPABASE_KEY", "")

def _sb_url() -> str:
    return os.getenv("SUPABASE_URL", "https://ohwgibzmaxfxivenbfhm.supabase.co")


# ── Analyst personas ───────────────────────────────────────────────────────────

ANALYSTS = [
    {"key": "warren_buffett",       "name": "Warren Buffett",       "title": "Oracle of Omaha",
     "style": "Economic moat, consistent ROE>15%, low debt, understandable business, P/E reasonable for quality."},
    {"key": "charlie_munger",       "name": "Charlie Munger",       "title": "The Rational Thinker",
     "style": "Quality franchise, mental models, long-duration compounding, avoid commodity businesses."},
    {"key": "ben_graham",           "name": "Ben Graham",           "title": "Father of Value Investing",
     "style": "Margin of safety, net-net value, P/B<1.5, low P/E vs. earnings, strong balance sheet, minimal debt."},
    {"key": "peter_lynch",          "name": "Peter Lynch",          "title": "GARP Master",
     "style": "PEG<1, invest in what you know, strong earnings growth, avoid over-diversification."},
    {"key": "mohnish_pabrai",       "name": "Mohnish Pabrai",       "title": "Dhandho Investor",
     "style": "Heads-I-win tails-I-don't-lose-much. Concentrated bets in simple, low-risk high-reward Indian businesses."},
    {"key": "rakesh_jhunjhunwala",  "name": "Rakesh Jhunjhunwala",  "title": "The Big Bull",
     "style": "India growth story, domestic consumption, conviction buying on dips, NSE/BSE market dynamics."},
    {"key": "stanley_druckenmiller","name": "Stanley Druckenmiller","title": "Macro Momentum",
     "style": "Price momentum, macro tailwinds, earnings acceleration, ride winners hard, cut losers fast."},
    {"key": "michael_burry",        "name": "Michael Burry",        "title": "Big Short Contrarian",
     "style": "Deep contrarian value, FCF yield, balance sheet hidden gems, mean reversion, market dislocations."},
    {"key": "bill_ackman",          "name": "Bill Ackman",          "title": "The Activist",
     "style": "Strong brands, predictable cash flows, pricing power, unlock hidden value through operational improvement."},
    {"key": "cathie_wood",          "name": "Cathie Wood",          "title": "Queen of Disruption",
     "style": "Disruptive innovation, 5-year TAM expansion, exponential revenue growth, technology adoption curves."},
    {"key": "aswath_damodaran",     "name": "Aswath Damodaran",     "title": "Dean of Valuation",
     "style": "DCF intrinsic value, WACC, terminal value, growth-to-value crossover, price vs. worth."},
    {"key": "technicals",           "name": "Technical Analyst",    "title": "Chart & Momentum",
     "style": "RSI, MACD, 50/200-day MA, price vs. moving averages, volume trends, support/resistance."},
    {"key": "fundamentals",         "name": "Fundamentals Analyst", "title": "Financial Health",
     "style": "Revenue growth trajectory, margin expansion, debt reduction, cash flow quality, capital efficiency."},
    {"key": "one_piece_technical",  "name": "ONE PIECE Technical",  "title": "Structure & Fibonacci",
     "style": "Market structure (Higher High/Higher Low vs Lower Low/Lower High). 9 EMA/20 EMA crossover and support bounce. Break of Structure (BOS) with volume confirmation. Change of Character (CHoCH). Fibonacci retracement/extension levels for exact Target, SL, and CMP positioning."},
    {"key": "govt_policy",          "name": "Policy Catalyst",      "title": "Government & Macro Tailwind",
     "style": "Government policies, Budget allocations, PLI schemes, SEBI/RBI regulations, ministry announcements. Which sectors and stocks benefit directly from policy tailwinds, subsidies, or regulatory changes."},
]


# ── Intelligence gathering ─────────────────────────────────────────────────────

def _safe_float(v, default: float = 0.0) -> float:
    try:
        f = float(v)
        return f if not math.isnan(f) else default
    except Exception:
        return default


FIB_LEVELS = [0.0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1.0, 1.272, 1.618, 2.0, 2.272]
FIB_CHECKED = {0.0, 0.618, 0.705, 0.786, 1.0}   # the key levels (matching user's image selections)
FIB_EXT     = {-0.5, -1.0, -2.0}                 # extension levels above swing high


def _compute_fibonacci(high: float, low: float, cmp: float) -> dict:
    """Compute Fibonacci retracement levels from 52w high/low."""
    if high <= low or high <= 0:
        return {}
    rng = high - low
    levels = {}
    for lvl in FIB_LEVELS:
        levels[lvl] = round(high - lvl * rng, 2)
    for lvl in FIB_EXT:
        levels[lvl] = round(high - lvl * rng, 2)   # negative → above high

    # Which two levels is CMP between?
    sorted_lvls = sorted(levels.keys())
    nearest_support = None
    nearest_resistance = None
    for i, l in enumerate(sorted_lvls):
        price = levels[l]
        if price < cmp and (nearest_support is None or price > levels[nearest_support]):
            nearest_support = l
        if price > cmp and (nearest_resistance is None or price < levels[nearest_resistance]):
            nearest_resistance = l

    pct_retraced = round((high - cmp) / rng * 100, 1) if rng > 0 else 0

    return {
        "levels":             levels,
        "nearest_support_lvl":  nearest_support,
        "nearest_support_price":levels.get(nearest_support, low) if nearest_support is not None else low,
        "nearest_resistance_lvl":  nearest_resistance,
        "nearest_resistance_price":levels.get(nearest_resistance, high) if nearest_resistance is not None else high,
        "pct_retraced":       pct_retraced,
    }


def _detect_structure(closes, highs, lows) -> dict:
    """Detect HH/HL (uptrend) vs LL/LH (downtrend) from recent price series."""
    try:
        n = len(closes)
        if n < 20:
            return {"structure": "SIDEWAYS", "ema9": 0.0, "ema20": 0.0}

        import pandas as pd
        s = pd.Series(closes)
        h = pd.Series(highs)
        l = pd.Series(lows)

        ema9  = float(s.ewm(span=9,  adjust=False).mean().iloc[-1])
        ema20 = float(s.ewm(span=20, adjust=False).mean().iloc[-1])

        # Split into two halves to detect swing direction
        mid = n // 2
        prev_high = float(h.iloc[:mid].max())
        curr_high = float(h.iloc[mid:].max())
        prev_low  = float(l.iloc[:mid].min())
        curr_low  = float(l.iloc[mid:].min())

        hh = curr_high > prev_high
        hl = curr_low  > prev_low
        ll = curr_low  < prev_low
        lh = curr_high < prev_high

        if hh and hl:
            structure = "UPTREND"
        elif ll and lh:
            structure = "DOWNTREND"
        elif hh and ll:
            structure = "EXPANSION"
        else:
            structure = "SIDEWAYS"

        # BOS: did price recently break the mid-period swing high/low with volume?
        recent_close = float(s.iloc[-1])
        bos_bullish = recent_close > prev_high
        bos_bearish = recent_close < prev_low

        return {
            "structure":   structure,
            "ema9":        round(ema9, 2),
            "ema20":       round(ema20, 2),
            "ema9_above_ema20": ema9 > ema20,
            "bos_bullish": bos_bullish,
            "bos_bearish": bos_bearish,
            "prev_swing_high": round(prev_high, 2),
            "prev_swing_low":  round(prev_low, 2),
        }
    except Exception:
        return {"structure": "SIDEWAYS", "ema9": 0.0, "ema20": 0.0}


async def _scrape_govt_policies(symbol: str, sector: str) -> list[str]:
    """Fetch government policy/economic headlines from Yahoo Finance RSS."""
    headlines = []
    queries = [
        f"India government {sector} policy",
        f"India PLI scheme {sector}",
        f"India budget {symbol}",
    ]
    for query in queries[:2]:
        try:
            q = query.replace(" ", "+")
            url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}.NS&region=IN&lang=en-US&type=STORY"
            async with httpx.AsyncClient(timeout=6) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(resp.text)
                for item in root.findall(".//item")[:4]:
                    title = item.findtext("title", "").strip()
                    if title and any(kw in title.lower() for kw in ["govern","policy","minister","budget","scheme","pli","sebi","rbi","plc","alloc"]):
                        headlines.append(title)
            if headlines:
                break
        except Exception:
            pass

    # Fallback: Economic Times RSS
    if not headlines:
        try:
            et_url = "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms"
            async with httpx.AsyncClient(timeout=6) as client:
                resp = await client.get(et_url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(resp.text)
                for item in root.findall(".//item")[:8]:
                    title = item.findtext("title", "").strip()
                    if title:
                        headlines.append(title)
        except Exception:
            pass

    return headlines[:6]


def _fetch_supabase_profile(symbol: str) -> dict:
    """Pull profile from our Supabase tables — pre-materialized, sub-100ms."""
    result: dict = {}
    try:
        sb = _sb()
        clean = symbol.upper().replace(".NS", "").replace(".BO", "")

        # Company master
        r = sb.table("dim_company").select(
            "ticker,company_name,sector,industry,market_cap_inr_cr,"
            "current_price_inr,high_52w_inr,low_52w_inr,prices_as_of"
        ).eq("ticker", clean).limit(1).execute()
        if not r.data:
            r = sb.table("dim_company").select(
                "ticker,company_name,sector,industry,market_cap_inr_cr,"
                "current_price_inr,high_52w_inr,low_52w_inr,prices_as_of"
            ).eq("nse_symbol", clean).limit(1).execute()

        if r.data:
            company = r.data[0]
            result["company"] = {
                "name":    company.get("company_name", clean),
                "sector":  company.get("sector", ""),
                "industry":company.get("industry", ""),
                "mcap_cr": _safe_float(company.get("market_cap_inr_cr")),
                "price":   _safe_float(company.get("current_price_inr")),
                "high_52w":_safe_float(company.get("high_52w_inr")),
                "low_52w": _safe_float(company.get("low_52w_inr")),
            }
            company_id = company.get("company_id") or r.data[0].get("company_id")

            # Income statement — last 8 quarters
            if company_id:
                is_r = sb.table("fact_income_statement").select(
                    "fiscal_year,fiscal_quarter,financials,currency,scale"
                ).eq("company_id", company_id).order("period_end_date", desc=True).limit(8).execute()

                if is_r.data:
                    result["income"] = is_r.data[:8]

            # Recent earnings (EarningsPulse)
            try:
                er = sb.table("earnings_results").select(
                    "ticker,company,quarter,sales_cr,sales_yoy_pct,pat_cr,pat_yoy_pct,"
                    "opm_pct,eps,pulse_rating,pe_ratio"
                ).eq("ticker", clean).order("filed_at", desc=True).limit(4).execute()
                if er.data:
                    result["earnings"] = er.data
            except Exception:
                pass

            # Announcements / news (EarningsPulse tagging)
            try:
                ann_r = sb.table("fact_announcements_tagged").select(
                    "announcement_type,sentiment,summary_header,summary_text,published_date"
                ).eq("ticker", clean).order("published_date", desc=True).limit(8).execute()
                if ann_r.data:
                    result["news"] = ann_r.data
            except Exception:
                pass

    except Exception as e:
        result["_error"] = str(e)

    return result


def _fetch_yfinance_live(symbol: str) -> dict:
    """Get live price, ratios, technicals from yfinance. Supports NSE (.NS), BSE (.BO) and US (plain) tickers."""
    try:
        import yfinance as yf
        import pandas as pd

        raw = symbol.upper()

        # Determine yfinance symbol — try NSE first, then plain (US/global)
        if "." in raw:
            candidates = [raw]
        else:
            candidates = [f"{raw}.NS", f"{raw}.BO", raw]

        tkr = None
        info = {}
        yf_sym = candidates[0]
        for c in candidates:
            try:
                t = yf.Ticker(c)
                i = t.info or {}
                p = i.get("currentPrice") or i.get("regularMarketPrice") or 0
                if _safe_float(p) > 0:
                    tkr, info, yf_sym = t, i, c
                    break
            except Exception:
                continue

        if tkr is None:
            return {"error": f"No price data for {symbol}", "price": 0}

        # Detect currency
        currency = (info.get("currency") or "INR").upper()
        exchange = info.get("exchange", "")
        is_us    = currency in ("USD", "CAD", "EUR", "GBP") or yf_sym == raw

        def _fi(k, d=None):
            v = info.get(k)
            if v is None or (isinstance(v, float) and math.isnan(v)):
                return d
            return v

        price = _safe_float(_fi("currentPrice") or _fi("regularMarketPrice"))
        hist  = tkr.history(period="1y")

        # Technical indicators
        tech: dict = {}
        if hist is not None and len(hist) >= 14:
            closes = hist["Close"]
            vols   = hist["Volume"]

            # RSI-14
            delta = closes.diff()
            gain  = delta.clip(lower=0).rolling(14).mean()
            loss  = (-delta.clip(upper=0)).rolling(14).mean()
            rs    = gain / loss.replace(0, float("nan"))
            rsi   = float(100 - 100 / (1 + rs.iloc[-1])) if not rs.empty else 50.0

            ma50  = float(closes.rolling(50).mean().iloc[-1]) if len(closes) >= 50 else price
            ma200 = float(closes.rolling(200).mean().iloc[-1]) if len(closes) >= 200 else price

            mom_1m  = round((price / float(closes.iloc[-22]) - 1) * 100, 2) if len(closes) >= 22  else 0
            mom_3m  = round((price / float(closes.iloc[-66]) - 1) * 100, 2) if len(closes) >= 66  else 0
            mom_12m = round((price / float(closes.iloc[-252]) - 1) * 100, 2) if len(closes) >= 252 else 0

            avg_vol_10d = float(vols.iloc[-10:].mean()) if len(vols) >= 10 else 0
            avg_vol_30d = float(vols.iloc[-30:].mean()) if len(vols) >= 30 else 0

            # EMA 9 / 20 + market structure detection
            structure = _detect_structure(
                closes.tolist(),
                hist["High"].tolist(),
                hist["Low"].tolist(),
            )

            tech = {
                "rsi_14":       round(rsi, 1),
                "ma50":         round(ma50, 2),
                "ma200":        round(ma200, 2),
                "ema9":         structure.get("ema9", 0.0),
                "ema20":        structure.get("ema20", 0.0),
                "ema9_above_ema20": structure.get("ema9_above_ema20", False),
                "price_vs_ma50":  round((price / ma50 - 1) * 100, 2) if ma50 > 0 else 0,
                "price_vs_ma200": round((price / ma200 - 1) * 100, 2) if ma200 > 0 else 0,
                "mom_1m_pct":   mom_1m,
                "mom_3m_pct":   mom_3m,
                "mom_12m_pct":  mom_12m,
                "vol_ratio_10_30": round(avg_vol_10d / avg_vol_30d, 2) if avg_vol_30d > 0 else 1.0,
                "structure":    structure.get("structure", "SIDEWAYS"),
                "bos_bullish":  structure.get("bos_bullish", False),
                "bos_bearish":  structure.get("bos_bearish", False),
                "prev_swing_high": structure.get("prev_swing_high", 0),
                "prev_swing_low":  structure.get("prev_swing_low", 0),
            }

        return {
            "price":         price,
            "prev_close":    _safe_float(_fi("previousClose", price)),
            "pe":            _safe_float(_fi("trailingPE")),
            "forward_pe":    _safe_float(_fi("forwardPE")),
            "pb":            _safe_float(_fi("priceToBook")),
            "eps":           _safe_float(_fi("trailingEps")),
            "roe":           round(_safe_float(_fi("returnOnEquity")) * 100, 1),
            "roa":           round(_safe_float(_fi("returnOnAssets")) * 100, 1),
            "profit_margin": round(_safe_float(_fi("profitMargins")) * 100, 1),
            "op_margin":     round(_safe_float(_fi("operatingMargins")) * 100, 1),
            "rev_growth":    round(_safe_float(_fi("revenueGrowth")) * 100, 1),
            "earn_growth":   round(_safe_float(_fi("earningsGrowth")) * 100, 1),
            "debt_to_equity":_safe_float(_fi("debtToEquity")),
            "current_ratio": _safe_float(_fi("currentRatio")),
            "div_yield":     round(_safe_float(_fi("dividendYield")) * 100, 2),
            "beta":          _safe_float(_fi("beta")),
            "sector":        _fi("sector", ""),
            "industry":      _fi("industry", ""),
            "technicals":    tech,
            # Enrich with yfinance company info (used for US stocks where Supabase has nothing)
            "company_name":  _fi("longName") or _fi("shortName") or symbol,
            "high_52w":      _safe_float(_fi("fiftyTwoWeekHigh")),
            "low_52w":       _safe_float(_fi("fiftyTwoWeekLow")),
            "mcap":          _safe_float(_fi("marketCap")),
            "currency":      currency,
            "exchange":      exchange,
            "is_us":         is_us,
        }
    except Exception as e:
        return {"error": str(e), "price": 0}


async def _scrape_news_headlines(symbol: str, company_name: str) -> list[str]:
    """Fetch latest news from Yahoo Finance RSS — free, no API key needed."""
    headlines = []
    first_name = company_name.split()[0] if company_name else symbol
    for query in (symbol, f"{symbol}.NS", first_name):
        try:
            url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={query}&region=IN&lang=en-US"
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(resp.text)
                for item in root.findall(".//item")[:6]:
                    title = item.findtext("title", "").strip()
                    if title:
                        headlines.append(title)
            if headlines:
                break
        except Exception:
            pass
    return headlines[:6]


def _build_context(symbol: str, profile: dict, live: dict, news: list[str], govt_news: list[str] | None = None) -> str:
    """Build a rich, structured text context for the LLM agents."""
    company = profile.get("company", {})
    name    = company.get("name", symbol)
    sector  = company.get("sector") or live.get("sector", "N/A")
    industry= company.get("industry") or live.get("industry", "N/A")
    mcap_cr = company.get("mcap_cr") or 0
    price   = live.get("price") or company.get("price") or 0

    tech = live.get("technicals", {})

    currency  = live.get("currency", "INR")
    curr_sym  = "$" if currency in ("USD", "CAD", "EUR", "GBP") else "₹"
    is_us     = live.get("is_us", False)
    mcap_label = f"{curr_sym}{mcap_cr:,.0f} Cr" if not is_us else f"${live.get('mcap',0)/1e9:.2f}B"

    lines = [
        f"═══ {name} ({symbol}) ═══",
        f"Sector: {sector}  |  Industry: {industry}",
        f"Market Cap: {mcap_label}  |  Currency: {currency}  |  Exchange: {live.get('exchange','NSE')}",
        "",
        "── PRICE & MOMENTUM ──",
        f"CMP: {curr_sym}{price:,.2f}  |  52W High: {curr_sym}{company.get('high_52w', live.get('high_52w',0)):,.2f}  |  52W Low: {curr_sym}{company.get('low_52w', live.get('low_52w',0)):,.2f}",
        f"1M Return: {tech.get('mom_1m_pct', 0):+.1f}%  |  3M: {tech.get('mom_3m_pct', 0):+.1f}%  |  12M: {tech.get('mom_12m_pct', 0):+.1f}%",
        "",
        "── VALUATION ──",
        f"P/E: {live.get('pe', 0):.1f}  |  Fwd P/E: {live.get('forward_pe', 0):.1f}  |  P/B: {live.get('pb', 0):.2f}",
        f"EPS (TTM): ₹{live.get('eps', 0):.2f}  |  Beta: {live.get('beta', 0):.2f}  |  Div Yield: {live.get('div_yield', 0):.2f}%",
        "",
        "── QUALITY & GROWTH ──",
        f"ROE: {live.get('roe', 0):.1f}%  |  ROA: {live.get('roa', 0):.1f}%  |  D/E: {live.get('debt_to_equity', 0):.2f}",
        f"Profit Margin: {live.get('profit_margin', 0):.1f}%  |  Op Margin: {live.get('op_margin', 0):.1f}%",
        f"Revenue Growth: {live.get('rev_growth', 0):+.1f}%  |  Earnings Growth: {live.get('earn_growth', 0):+.1f}%",
        "",
        "── TECHNICALS ──",
        f"RSI-14: {tech.get('rsi_14', 50):.1f}  |  50D MA: ₹{tech.get('ma50', 0):,.2f}  |  200D MA: ₹{tech.get('ma200', 0):,.2f}",
        f"Price vs 50D MA: {tech.get('price_vs_ma50', 0):+.1f}%  |  vs 200D MA: {tech.get('price_vs_ma200', 0):+.1f}%",
        f"Volume ratio (10D/30D avg): {tech.get('vol_ratio_10_30', 1.0):.2f}",
    ]

    # ONE PIECE Technical Structure
    high_52w = company.get("high_52w", 0)
    low_52w  = company.get("low_52w", 0)
    if high_52w > 0 and low_52w > 0 and price > 0:
        fib = _compute_fibonacci(high_52w, low_52w, price)
        struct = tech.get("structure", "SIDEWAYS")
        ema9   = tech.get("ema9", 0)
        ema20  = tech.get("ema20", 0)
        bos_b  = tech.get("bos_bullish", False)
        bos_e  = tech.get("bos_bearish", False)
        ps_high= tech.get("prev_swing_high", 0)
        ps_low = tech.get("prev_swing_low", 0)
        trend_label = "Higher High Higher Low (HH/HL)" if struct == "UPTREND" else \
                      "Lower Low Lower High (LL/LH)" if struct == "DOWNTREND" else \
                      f"{struct}"
        bos_note = ("Bullish BOS — price broke above ₹" + f"{ps_high:,.2f}" if bos_b else
                    "Bearish BOS — price broke below ₹" + f"{ps_low:,.2f}" if bos_e else "No recent BOS")
        lines += [
            "",
            "── ONE PIECE TECHNICAL STRUCTURE ──",
            f"Structure: {trend_label}",
            f"EMA-9: ₹{ema9:,.2f}  |  EMA-20: ₹{ema20:,.2f}  |  EMA-9 {'>' if tech.get('ema9_above_ema20') else '<'} EMA-20 ({'Bullish' if tech.get('ema9_above_ema20') else 'Bearish'})",
            f"Break of Structure: {bos_note}",
            f"Volume Ratio (10D/30D): {tech.get('vol_ratio_10_30', 1.0):.2f}x {'(HIGH — confirms BOS)' if tech.get('vol_ratio_10_30', 1) > 1.3 else ''}",
            "",
            "── FIBONACCI LEVELS (52W High: ₹{:.2f}, 52W Low: ₹{:.2f}) ──".format(high_52w, low_52w),
        ]
        lvls = fib.get("levels", {})
        pct  = fib.get("pct_retraced", 0)
        checked_label = {0.0:"52W High [0%]", 0.618:"Golden Ratio [61.8%]",
                         0.705:"Deep Retr. [70.5%]", 0.786:"Strong Support [78.6%]",
                         1.0:"52W Low [100%]", -0.5:"Extension [+50%]",
                         -1.0:"Extension [+100%]", -2.0:"Extension [+200%]"}
        for lvl in [0.0, 0.618, 0.705, 0.786, 1.0, -0.5, -1.0, -2.0]:
            if lvl in lvls:
                tag = "  ◄ CMP IS HERE" if abs(lvls[lvl] - price) < (high_52w - low_52w) * 0.05 else ""
                lines.append(f"  FIB {lvl:+.3f} = ₹{lvls[lvl]:,.2f}  {checked_label.get(lvl,'')}{tag}")
        ns_lvl   = fib.get("nearest_support_lvl")
        ns_price = fib.get("nearest_support_price", 0)
        nr_lvl   = fib.get("nearest_resistance_lvl")
        nr_price = fib.get("nearest_resistance_price", 0)
        lines += [
            f"CMP ₹{price:,.2f} — {pct:.1f}% retraced from 52W High",
            f"Nearest FIB Support   : ₹{ns_price:,.2f} (FIB {ns_lvl})  [{((ns_price - price)/price*100):+.1f}% from CMP]" if ns_lvl else "",
            f"Nearest FIB Resistance: ₹{nr_price:,.2f} (FIB {nr_lvl})  [{((nr_price - price)/price*100):+.1f}% from CMP]" if nr_lvl else "",
        ]
        lines = [l for l in lines if l != ""]

    # Earnings data (EarningsPulse)
    earnings_rows = profile.get("earnings", [])
    if earnings_rows:
        lines += ["", "── RECENT EARNINGS (EarningsPulse) ──"]
        for e in earnings_rows[:3]:
            lines.append(
                f"  {e.get('quarter','?')}: Sales ₹{e.get('sales_cr',0):.0f}Cr ({e.get('sales_yoy_pct',0):+.1f}% YoY) | "
                f"PAT ₹{e.get('pat_cr',0):.0f}Cr ({e.get('pat_yoy_pct',0):+.1f}% YoY) | "
                f"OPM {e.get('opm_pct',0):.1f}% | Rating: {e.get('pulse_rating','?')}"
            )

    # Announcements / news (tagged with sentiment)
    ann_rows = profile.get("news", [])
    if ann_rows:
        lines += ["", "── RECENT NEWS & ANNOUNCEMENTS (tagged) ──"]
        for a in ann_rows[:5]:
            sentiment = (a.get("sentiment") or "neutral").upper()
            hdr       = a.get("summary_header") or a.get("announcement_type", "")
            summary   = a.get("summary_text", "")[:120]
            dt        = str(a.get("published_date", ""))[:10]
            lines.append(f"  [{dt}] [{sentiment}] {hdr}: {summary}")

    # Live headlines
    if news:
        lines += ["", "── LATEST HEADLINES ──"]
        for h in news[:5]:
            lines.append(f"  • {h}")

    # Government policy headlines
    if govt_news:
        lines += ["", "── GOVERNMENT POLICY & MACRO ──"]
        for h in govt_news[:5]:
            lines.append(f"  [POLICY] {h}")

    return "\n".join(lines)


# ── LLM helpers ────────────────────────────────────────────────────────────────

async def _call_gemini(prompt: str) -> str:
    # Strip handles env vars pasted with trailing newline
    api_key = ((os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")) or "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={api_key}"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 700},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=body)
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


async def _call_groq(prompt: str) -> str:
    # Strip handles env vars pasted with trailing newline — was causing "Illegal header value"
    api_key = (os.getenv("GROQ_API_KEY", "") or "").strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not configured")
    import random
    for attempt in range(4):
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                    "max_tokens": 700,
                },
            )
            if resp.status_code == 429:
                retry_after = float(resp.headers.get("retry-after", 2 + attempt * 3))
                await asyncio.sleep(retry_after + random.uniform(0, 1))
                continue
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
    raise RuntimeError("Groq rate limited after retries")


async def _llm(prompt: str) -> str:
    """Try Gemini first (faster), fallback to Groq."""
    gemini_key = ((os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")) or "").strip()
    if gemini_key:
        try:
            return await _call_gemini(prompt)
        except Exception:
            pass  # fall through to Groq
    return await _call_groq(prompt)


AGENT_PROMPT = """You are {name} ({title}).
Your investment style: {style}

Analyse the following Indian stock and give your verdict.

{context}

TODAY: {today}

Respond ONLY with a JSON object — no markdown fences, no extra text:
{{"signal": "bullish" or "bearish" or "neutral", "confidence": <integer 0-100>, "reasoning": "<2-3 sentence expert opinion>"}}
"""


async def _run_agent(analyst: dict, context_str: str) -> dict:
    prompt = AGENT_PROMPT.format(
        name=analyst["name"],
        title=analyst["title"],
        style=analyst["style"],
        context=context_str,
        today=date.today().isoformat(),
    )
    try:
        text = await _llm(prompt)
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        # Find the first JSON object
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            text = m.group(0)
        parsed = json.loads(text)
        return {
            "analyst":    analyst["key"],
            "name":       analyst["name"],
            "title":      analyst["title"],
            "signal":     str(parsed.get("signal", "neutral")).lower(),
            "confidence": max(0, min(100, int(parsed.get("confidence", 50)))),
            "reasoning":  str(parsed.get("reasoning", "")),
            "error":      None,
        }
    except Exception as e:
        return {
            "analyst":   analyst["key"],
            "name":      analyst["name"],
            "title":     analyst["title"],
            "signal":    "neutral",
            "confidence": 0,
            "reasoning": "",
            "error":     str(e)[:200],
        }


# ── Consensus + paper trade ────────────────────────────────────────────────────

def _consensus(signals: list[dict]) -> dict:
    valid = [s for s in signals if not s["error"]]
    if not valid:
        return {"verdict": "HOLD", "bullish_pct": 0, "bearish_pct": 0, "neutral_pct": 0, "avg_confidence": 0}

    counts = {"bullish": 0, "bearish": 0, "neutral": 0}
    total_conf = 0
    for s in valid:
        counts[s["signal"]] = counts.get(s["signal"], 0) + 1
        total_conf += s["confidence"]

    n   = len(valid)
    bp  = round(counts["bullish"] / n * 100)
    ep  = round(counts["bearish"] / n * 100)
    np_ = round(counts["neutral"] / n * 100)
    ac  = round(total_conf / n)

    if   bp >= 75: verdict = "STRONG BUY"
    elif bp >= 60: verdict = "BUY"
    elif ep >= 75: verdict = "STRONG SELL"
    elif ep >= 60: verdict = "SELL"
    else:          verdict = "HOLD"

    return {"verdict": verdict, "bullish_pct": bp, "bearish_pct": ep, "neutral_pct": np_, "avg_confidence": ac}


def _place_paper_trade(symbol: str, price: float, consensus: dict, agent_count: int) -> Optional[str]:
    if "BUY" not in consensus["verdict"]:
        return None
    try:
        from data.storage import supabase_db as sdb
        rows = sdb.insert("paper_trades", {
            "ticker":     symbol,
            "entry_price": price,
            "entry_date":  date.today().isoformat(),
            "shares":      1,
            "strategy":    f"hedge_fund ({agent_count} agents)",
            "status":      "OPEN",
            "notes": (
                f"AI Hedge Fund | {consensus['verdict']} | "
                f"{consensus['bullish_pct']}% bullish | "
                f"avg conf {consensus['avg_confidence']}%"
            ),
        })
        return str(rows[0]["id"]) if rows else None
    except Exception as e:
        return f"error:{e}"


# ── Request / Response ─────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    ticker: str
    selected_analysts: Optional[list[str]] = None


class AnalyzeResponse(BaseModel):
    ticker: str
    company_name: str
    price: float
    signals: list[dict]
    consensus: dict
    paper_trade_id: Optional[str] = None
    data_snapshot: dict


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    """
    Run analyst agents on a ticker.
    Uses: Supabase (dim_company, earnings_results, announcements)
          + yfinance (live price, ratios, technicals)
          + Yahoo Finance RSS (news headlines)
          + Gemini Flash 2.0 / Groq Llama (LLM)
    """
    symbol = req.ticker.upper().replace(".NS", "").replace(".BO", "").strip()

    analysts = ANALYSTS
    if req.selected_analysts:
        analysts = [a for a in ANALYSTS if a["key"] in req.selected_analysts]
    if not analysts:
        raise HTTPException(400, "No valid analysts selected.")

    # Gather data concurrently
    profile_task  = asyncio.to_thread(_fetch_supabase_profile, symbol)
    live_task     = asyncio.to_thread(_fetch_yfinance_live, symbol)

    profile, live = await asyncio.gather(profile_task, live_task)

    # Get price — prefer live yfinance, fall back to Supabase dim_company
    price = live.get("price") or profile.get("company", {}).get("price") or 0.0
    if price <= 0:
        raise HTTPException(
            404,
            f"No price data found for {symbol}. "
            "Use a valid NSE ticker (e.g. RELIANCE, TCS) or US ticker (e.g. AAPL, RXRX, NVDA)."
        )

    # For US/global stocks not in Supabase, build company dict from yfinance
    if not profile.get("company") and live.get("company_name"):
        mcap_usd = live.get("mcap", 0)
        profile["company"] = {
            "name":     live.get("company_name", symbol),
            "sector":   live.get("sector", ""),
            "industry": live.get("industry", ""),
            "mcap_cr":  round(mcap_usd / 1e7, 0) if mcap_usd else 0,  # USD → approx INR Cr
            "price":    price,
            "high_52w": live.get("high_52w", 0),
            "low_52w":  live.get("low_52w", 0),
        }

    company_name = profile.get("company", {}).get("name", symbol)

    # Scrape live news + government policy headlines in parallel
    sector = profile.get("company", {}).get("sector") or live.get("sector", "")
    news_task, policy_task = await asyncio.gather(
        _scrape_news_headlines(symbol, company_name),
        _scrape_govt_policies(symbol, sector),
    )
    news_headlines = news_task
    govt_headlines = policy_task

    # Build unified context string for all agents
    context_str = _build_context(symbol, profile, live, news_headlines, govt_headlines)

    # Run all agents concurrently (semaphore=3 keeps us within Groq free-tier rate limits)
    sem = asyncio.Semaphore(3)

    async def _rate_limited(analyst: dict) -> dict:
        async with sem:
            return await _run_agent(analyst, context_str)

    signals = list(await asyncio.gather(*[_rate_limited(a) for a in analysts]))

    consensus     = _consensus(signals)
    paper_trade_id = await asyncio.to_thread(_place_paper_trade, symbol, price, consensus, len(signals))

    return AnalyzeResponse(
        ticker=symbol,
        company_name=company_name,
        price=price,
        signals=signals,
        consensus=consensus,
        paper_trade_id=paper_trade_id,
        data_snapshot={
            "sector":       profile.get("company", {}).get("sector") or live.get("sector", ""),
            "industry":     profile.get("company", {}).get("industry") or live.get("industry", ""),
            "mcap_cr":      profile.get("company", {}).get("mcap_cr", 0),
            "pe":           live.get("pe", 0),
            "pb":           live.get("pb", 0),
            "roe":          live.get("roe", 0),
            "debt_to_equity": live.get("debt_to_equity", 0),
            "profit_margin":  live.get("profit_margin", 0),
            "rev_growth":   live.get("rev_growth", 0),
            "rsi_14":       live.get("technicals", {}).get("rsi_14", 50),
            "ma50":         live.get("technicals", {}).get("ma50", 0),
            "ma200":        live.get("technicals", {}).get("ma200", 0),
            "beta":         live.get("beta", 0),
            "high_52w":     profile.get("company", {}).get("high_52w") or live.get("high_52w", 0),
            "low_52w":      profile.get("company", {}).get("low_52w")  or live.get("low_52w",  0),
            "currency":     live.get("currency", "INR"),
            "earnings_count": len(profile.get("earnings", [])),
            "news_count":   len(news_headlines) + len(profile.get("news", [])),
            "context_chars":len(context_str),
        },
    )


@router.post("/analyze/stream")
async def analyze_stream(req: AnalyzeRequest):
    """SSE endpoint — yields each agent result as it completes, then consensus."""
    symbol = req.ticker.upper().replace(".NS", "").replace(".BO", "").strip()
    analysts = ANALYSTS
    if req.selected_analysts:
        analysts = [a for a in ANALYSTS if a["key"] in req.selected_analysts]
    if not analysts:
        raise HTTPException(400, "No valid analysts selected.")

    async def event_stream():
        try:
            # Phase 1: gather data
            yield f"data: {json.dumps({'type':'status','msg':'Gathering intelligence…'})}\n\n"

            profile_task = asyncio.to_thread(_fetch_supabase_profile, symbol)
            live_task    = asyncio.to_thread(_fetch_yfinance_live, symbol)
            profile, live = await asyncio.gather(profile_task, live_task)

            price = live.get("price") or profile.get("company", {}).get("price") or 0.0
            if price <= 0:
                yield f"data: {json.dumps({'type':'error','msg':f'No price data for {symbol}. Use a valid NSE ticker (RELIANCE, TCS) or US ticker (AAPL, RXRX, NVDA).'})}\n\n"
                return

            # Build company dict from yfinance for US/global stocks not in Supabase
            if not profile.get("company") and live.get("company_name"):
                mcap_usd = live.get("mcap", 0)
                profile["company"] = {
                    "name":     live.get("company_name", symbol),
                    "sector":   live.get("sector", ""),
                    "industry": live.get("industry", ""),
                    "mcap_cr":  round(mcap_usd / 1e7, 0) if mcap_usd else 0,
                    "price":    price,
                    "high_52w": live.get("high_52w", 0),
                    "low_52w":  live.get("low_52w", 0),
                }

            company_name = profile.get("company", {}).get("name", symbol)
            sector = profile.get("company", {}).get("sector") or live.get("sector", "")

            news_task, policy_task = await asyncio.gather(
                _scrape_news_headlines(symbol, company_name),
                _scrape_govt_policies(symbol, sector),
            )
            context_str = _build_context(symbol, profile, live, news_task, policy_task)

            # Snapshot for frontend
            high_52w = profile.get("company", {}).get("high_52w") or live.get("high_52w", 0)
            low_52w  = profile.get("company", {}).get("low_52w")  or live.get("low_52w",  0)
            fib_data = _compute_fibonacci(high_52w, low_52w, price)
            tech     = live.get("technicals", {})

            currency = live.get("currency", "INR")
            yield f"data: {json.dumps({'type':'data_ready','ticker':symbol,'company_name':company_name,'price':price,'currency':currency,'sector':sector,'fib':fib_data,'structure':tech.get('structure','SIDEWAYS'),'ema9':tech.get('ema9',0),'ema20':tech.get('ema20',0)})}\n\n"

            # Phase 2: run agents with semaphore, yield results as they complete
            queue: asyncio.Queue = asyncio.Queue()
            sem = asyncio.Semaphore(3)

            async def _worker(analyst: dict):
                await queue.put({"type": "thinking", "analyst": analyst["key"],
                                  "name": analyst["name"], "title": analyst["title"]})
                async with sem:
                    result = await _run_agent(analyst, context_str)
                await queue.put({"type": "agent_result", **result})

            tasks = [asyncio.create_task(_worker(a)) for a in analysts]

            received = 0
            target   = len(analysts) * 2  # thinking + result per agent
            results  = []

            while received < target:
                event = await asyncio.wait_for(queue.get(), timeout=90)
                yield f"data: {json.dumps(event)}\n\n"
                received += 1
                if event["type"] == "agent_result":
                    results.append(event)

            await asyncio.gather(*tasks)

            # Phase 3: consensus
            consensus      = _consensus(results)
            paper_trade_id = await asyncio.to_thread(_place_paper_trade, symbol, price, consensus, len(results))
            yield f"data: {json.dumps({'type':'consensus','consensus':consensus,'paper_trade_id':paper_trade_id,'ticker':symbol,'company_name':company_name,'price':price})}\n\n"
            yield f"data: {json.dumps({'type':'done'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type':'error','msg':str(e)[:200]})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/analysts")
async def list_analysts():
    return [{"key": a["key"], "name": a["name"], "title": a["title"], "style": a["style"]} for a in ANALYSTS]


@router.get("/universe")
async def stock_universe(q: str = "", limit: int = 100):
    """
    Return the canonical stock universe from dim_company (≥1000 Cr market cap).
    Supports ?q= for autocomplete search.
    Falls back to hardcoded Nifty 50 list if Supabase is unavailable.
    """
    try:
        from api.universe import get_canonical_universe
        rows = get_canonical_universe()
        universe = [
            {
                "ticker":  r.get("ticker", ""),
                "name":    r.get("company_name", r.get("ticker", "")),
                "sector":  r.get("sector", ""),
                "mcap_cr": _safe_float(r.get("market_cap_inr_cr")),
            }
            for r in rows
            if r.get("ticker")
        ]
        if q:
            q_lower = q.lower()
            universe = [
                s for s in universe
                if q_lower in s["ticker"].lower() or q_lower in s["name"].lower()
            ]
        return {"tickers": universe[:limit], "total": len(universe)}
    except Exception:
        # Fallback Nifty 50
        fallback = [
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
            "HINDUNILVR", "ITC", "BAJFINANCE", "KOTAKBANK", "LT",
            "MARUTI", "WIPRO", "AXISBANK", "ASIANPAINT", "SUNPHARMA",
            "TITAN", "NESTLEIND", "ULTRACEMCO", "BAJAJFINSV", "HCLTECH",
            "SBIN", "NTPC", "POWERGRID", "COALINDIA", "ONGC",
            "ADANIENT", "TATAMOTORS", "M&M", "JSWSTEEL", "TATASTEEL",
        ]
        if q:
            fallback = [t for t in fallback if q.upper() in t]
        return {"tickers": [{"ticker": t, "name": t, "sector": "", "mcap_cr": 0} for t in fallback[:limit]], "total": len(fallback)}
