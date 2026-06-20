"""Friday — One Piece AI Assistant (browser-native voice + text).

Replaces JARVIS. Friday is action-capable:
  - Stock analysis queries → returns live data
  - Portfolio summary → reads paper trades
  - Market overview → top movers / watchlist
  - Hedge fund trigger → references council analysis
  - Navigation commands → returns route slug for frontend

POST /api/friday/chat  { message, history, session_id? }
→ { response, action?, route? }
"""
from __future__ import annotations

import json
import os
from datetime import date
from typing import Optional

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

FRIDAY_SYSTEM = """You are FRIDAY — the AI intelligence behind the ONE PIECE Quant Fund, modelled after Tony Stark's AI assistant but focused entirely on Indian equity markets.

Your role:
- Analyse Indian stocks (NSE/BSE) with surgical precision
- Help the user navigate the platform (Portfolio, Screener, Hedge Fund, Watchlist, Earnings Pulse, Journal, Market Terminal)
- Interpret market data, technical levels, earnings, macroeconomics
- Be concise, direct, and market-sharp — like a top quant analyst

Platform tools you know about:
- HEDGE FUND: 15-agent AI council analyses any NSE stock. Say "Run council on {TICKER}" to trigger it.
- SCREENER: Multi-factor stock screener. Say "Go to screener" to navigate there.
- PORTFOLIO: Paper + live trading performance dashboard.
- WATCHLIST: Monitored stocks with live data.
- EARNINGS PULSE: Real-time BSE earnings OCR pipeline.
- MARKET TERMINAL: Live NSE/BSE overview, indices, FII/DII flows.
- JOURNAL: Trading log and P&L tracker.

Response rules:
- Max 3 sentences unless a detailed analysis is requested.
- For navigation: always end with ACTION: navigate/{route} on its own line.
- For stock analysis: cite exact numbers (P/E, RSI, MA levels) when available.
- Always acknowledge Indian market context (NSE, Nifty, Sensex, SEBI, FII/DII).
- If asked to analyse a stock, suggest running the Hedge Fund council for a full AI consensus.
- Never give specific buy/sell advice. Frame as analysis. End with "Not financial advice."
- Speak with confidence. You are FRIDAY — not a chatbot, an intelligence system.

Navigation routes (say ACTION: navigate/{route}):
  portfolio → Portfolio
  screener → Screener
  hedge-fund → Hedge Fund Council
  watchlist → Watchlist
  earnings-pulse → Earnings Pulse
  journal → Trading Journal
  market → Market Terminal
  (empty) → Home / Dashboard
"""

NAV_MAP = {
    "portfolio": "portfolio",
    "screener": "screener",
    "hedge fund": "hedge-fund",
    "hedge-fund": "hedge-fund",
    "council": "hedge-fund",
    "watchlist": "watchlist",
    "earnings": "earnings-pulse",
    "earnings pulse": "earnings-pulse",
    "journal": "journal",
    "market": "market",
    "terminal": "market",
    "home": "",
    "dashboard": "",
}


class FridayRequest(BaseModel):
    message: str
    history: list[dict] = []
    session_id: Optional[str] = None


class FridayResponse(BaseModel):
    response: str
    action: Optional[str] = None
    route: Optional[str] = None
    session_id: Optional[str] = None


async def _call_gemini_chat(messages: list[dict]) -> str:
    api_key = ((os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")) or "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")
    contents = []
    for m in messages:
        role = "user" if m["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": m["content"]}]})
    body = {
        "system_instruction": {"parts": [{"text": FRIDAY_SYSTEM}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 500},
    }
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={api_key}"
    )
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(url, json=body)
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


async def _call_groq_chat(messages: list[dict]) -> str:
    api_key = (os.getenv("GROQ_API_KEY", "") or "").strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not configured")
    msgs = [{"role": "system", "content": FRIDAY_SYSTEM}]
    for m in messages:
        msgs.append({"role": m["role"], "content": m["content"]})
    import random
    for attempt in range(3):
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": "llama-3.3-70b-versatile", "messages": msgs,
                      "temperature": 0.4, "max_tokens": 500},
            )
            if resp.status_code == 429:
                import asyncio
                await asyncio.sleep(2 + attempt * 2 + random.uniform(0, 1))
                continue
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
    raise RuntimeError("Groq rate limited")


async def _friday_llm(history: list[dict]) -> str:
    gemini_key = ((os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")) or "").strip()
    if gemini_key:
        try:
            return await _call_gemini_chat(history)
        except Exception:
            pass
    return await _call_groq_chat(history)


def _extract_action(text: str) -> tuple[str, str | None, str | None]:
    """Parse ACTION: navigate/{route} from response text, return (clean_text, action, route)."""
    import re
    action = None
    route  = None
    clean  = text

    m = re.search(r"ACTION:\s*navigate/([^\s\n]*)", text, re.IGNORECASE)
    if m:
        action = "navigate"
        route  = m.group(1).strip()
        clean  = re.sub(r"\n?\s*ACTION:\s*navigate/[^\s\n]*", "", text, flags=re.IGNORECASE).strip()

    # Also auto-detect nav from text if no explicit action
    if not action:
        lower = text.lower()
        for kw, r in NAV_MAP.items():
            if kw in lower and any(v in lower for v in ["going to", "navigating", "opening", "showing"]):
                action = "navigate"
                route  = r
                break

    return clean, action, route


@router.post("/chat", response_model=FridayResponse)
async def friday_chat(req: FridayRequest) -> FridayResponse:
    messages = list(req.history[-6:])  # keep last 6 turns for context
    messages.append({"role": "user", "content": req.message})

    try:
        raw = await _friday_llm(messages)
    except Exception as e:
        raw = f"System offline — {str(e)[:80]}. Try again shortly."

    clean, action, route = _extract_action(raw)
    return FridayResponse(
        response=clean,
        action=action,
        route=route,
        session_id=req.session_id,
    )
