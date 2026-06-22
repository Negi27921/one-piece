import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, Shield, ChevronDown, ChevronUp,
  BarChart3, Flame, Trophy, AlertTriangle, Crown, Zap,
  Building2, Banknote, Activity, Search,
} from "lucide-react";

// ── Stock data ───────────────────────────────────────────────────────────────
interface Stock {
  name: string; symbol: string; sector: string;
  price: number; change: number; ath: number; athDistance: number;
  consolidationMonths: number; breakout: boolean;
  rsAboveZero: boolean; rsValue: number;
  volumeRatio: number; avgVolume: number; todayVolume: number;
  salesCagr5y: number; profitCagr5y: number; roce: number; de: number; cfoRatio: number;
  opm: number; orderBookRatio: number; promoterHolding: number;
  invalidation: number; marketCap: number;
  growth: string; risk: string; business: string;
  cashCycle: number; interestCoverage: number; fixedAssetTurnover: number;
  // Chartink conditions
  ema20AboveEma50: boolean; closeAboveEma50: boolean;
  rs65dPositive: boolean; close95pctOf252dHigh: boolean;
}

const STOCKS: Stock[] = [
  {
    name: "Samvardhana Motherson Intl", symbol: "MOTHERSON", sector: "Auto ancillary",
    price: 148.54, change: 3.58, ath: 149.2, athDistance: 0.4,
    consolidationMonths: 9, breakout: true,
    rsAboveZero: true, rsValue: 1.28,
    volumeRatio: 2.8, avgVolume: 12500000, todayVolume: 35000000,
    salesCagr5y: 18.7, profitCagr5y: 28.5, roce: 16, de: 0.47, cfoRatio: 52,
    opm: 8.5, orderBookRatio: 7.0, promoterHolding: 62.8,
    invalidation: 134, marketCap: 102000,
    growth: "FY30: ₹10L Cr revenue (36% CAGR), ROCE target 40%, order book 9L Cr (7x rev)",
    risk: "Europe/NA demand weakness, copper price volatility, borrowings ₹10,250 Cr",
    business: "India's largest auto ancillary — wiring, mirrors, bumpers, modules. 47 acquisitions. 44 countries.",
    cashCycle: 45, interestCoverage: 4.72, fixedAssetTurnover: 3.0,
    ema20AboveEma50: true, closeAboveEma50: true, rs65dPositive: true, close95pctOf252dHigh: true,
  },
  {
    name: "Aegis Logistics", symbol: "AEGIS", sector: "Energy logistics",
    price: 892, change: 2.1, ath: 910, athDistance: 2.0,
    consolidationMonths: 11, breakout: true,
    rsAboveZero: true, rsValue: 1.15,
    volumeRatio: 2.2, avgVolume: 800000, todayVolume: 1760000,
    salesCagr5y: 12.5, profitCagr5y: 22.8, roce: 18.5, de: 0.35, cfoRatio: 58,
    opm: 17, orderBookRatio: 1.2, promoterHolding: 58.6,
    invalidation: 800, marketCap: 31500,
    growth: "₹47,000 Cr capex by 2030. ₹7000/ton margin. 7 major port terminals.",
    risk: "₹47K Cr capex execution risk, crude-linked LPG prices, asset utilization",
    business: "Energy & chemical logistics — LPG sourcing (90% rev) + liquid storage. 7 major Indian ports.",
    cashCycle: 30, interestCoverage: 6.8, fixedAssetTurnover: 2.1,
    ema20AboveEma50: true, closeAboveEma50: true, rs65dPositive: true, close95pctOf252dHigh: true,
  },
  {
    name: "Minda Corporation", symbol: "MINDACORP", sector: "Auto components",
    price: 485, change: 4.2, ath: 490, athDistance: 1.0,
    consolidationMonths: 10, breakout: true,
    rsAboveZero: true, rsValue: 1.35,
    volumeRatio: 3.1, avgVolume: 650000, todayVolume: 2015000,
    salesCagr5y: 15.2, profitCagr5y: 12.5, roce: 14, de: 0.3, cfoRatio: 55,
    opm: 11, orderBookRatio: 1.6, promoterHolding: 70.2,
    invalidation: 460, marketCap: 11200,
    growth: "FY30: 19-20% CAGR. ₹10,000 Cr order book. EV orders growing.",
    risk: "EV transition risk to legacy ICE products, copper pass-through, 2W demand cyclicality",
    business: "Locks, smart keys, die casting, wiring harness, EV components. 2W/3W 48%, CV 28%, 4W 14%.",
    cashCycle: 52, interestCoverage: 8.2, fixedAssetTurnover: 3.5,
    ema20AboveEma50: true, closeAboveEma50: true, rs65dPositive: true, close95pctOf252dHigh: true,
  },
  {
    name: "Net Web Technologies", symbol: "NETWEB", sector: "AI / HPC",
    price: 520, change: 5.8, ath: 525, athDistance: 1.0,
    consolidationMonths: 8, breakout: true,
    rsAboveZero: true, rsValue: 1.52,
    volumeRatio: 3.8, avgVolume: 420000, todayVolume: 1596000,
    salesCagr5y: 55, profitCagr5y: 55, roce: 28, de: 0.12, cfoRatio: 32,
    opm: 13.5, orderBookRatio: 1.1, promoterHolding: 66.9,
    invalidation: 450, marketCap: 5800,
    growth: "35-40% YoY growth. NVIDIA OEM partner. ₹2,400 Cr order book.",
    risk: "Weak cash (32% CFO), borrowings ₹271 Cr from zero, top 5 clients = 65-70% rev",
    business: "HPC supercomputers & AI servers. NVIDIA Grace CPU & GH200. Clients: IITs, ISRO, NMDC.",
    cashCycle: 121, interestCoverage: 12, fixedAssetTurnover: 4.2,
    ema20AboveEma50: true, closeAboveEma50: true, rs65dPositive: true, close95pctOf252dHigh: true,
  },
  {
    name: "ACME Solar Holdings", symbol: "ACME", sector: "Renewable energy",
    price: 328, change: 3.2, ath: 340, athDistance: 3.5,
    consolidationMonths: 6, breakout: true,
    rsAboveZero: true, rsValue: 1.08,
    volumeRatio: 1.9, avgVolume: 350000, todayVolume: 665000,
    salesCagr5y: 8, profitCagr5y: 15, roce: 9, de: 1.2, cfoRatio: 48,
    opm: 55, orderBookRatio: 2.5, promoterHolding: 56.4,
    invalidation: 295, marketCap: 9500,
    growth: "10GW solar + 15GWh BESS. Battery EBITDA 75-80%. ₹12,475 Cr capex.",
    risk: "Heavy funding (75:25 D:E), land acquisition delays, transmission bottlenecks",
    business: "Utility-scale solar/wind + battery storage. 25-year PPAs with govt offtakers.",
    cashCycle: 38, interestCoverage: 2.8, fixedAssetTurnover: 0.4,
    ema20AboveEma50: true, closeAboveEma50: true, rs65dPositive: true, close95pctOf252dHigh: true,
  },
  {
    name: "Dixon Technologies", symbol: "DIXON", sector: "Electronics EMS",
    price: 18500, change: 2.8, ath: 19200, athDistance: 3.6,
    consolidationMonths: 4, breakout: false,
    rsAboveZero: true, rsValue: 1.42,
    volumeRatio: 1.8, avgVolume: 320000, todayVolume: 576000,
    salesCagr5y: 42, profitCagr5y: 38, roce: 24, de: 0.15, cfoRatio: 45,
    opm: 4.5, orderBookRatio: 1.8, promoterHolding: 34.2,
    invalidation: 16500, marketCap: 110000,
    growth: "PLI scheme, Samsung/Apple contracts, IT hardware expansion",
    risk: "Thin margins (4.5% OPM), customer concentration, tech obsolescence",
    business: "India's largest EMS — TVs, washing machines, smartphones, IT hardware, lighting.",
    cashCycle: 58, interestCoverage: 15, fixedAssetTurnover: 5.5,
    ema20AboveEma50: true, closeAboveEma50: true, rs65dPositive: true, close95pctOf252dHigh: true,
  },
  {
    name: "Jupiter Wagons", symbol: "JWL", sector: "Railways",
    price: 540, change: 5.2, ath: 555, athDistance: 2.7,
    consolidationMonths: 7, breakout: false,
    rsAboveZero: true, rsValue: 1.65,
    volumeRatio: 3.5, avgVolume: 950000, todayVolume: 3325000,
    salesCagr5y: 38, profitCagr5y: 52, roce: 19, de: 0.22, cfoRatio: 42,
    opm: 14, orderBookRatio: 4.5, promoterHolding: 63.1,
    invalidation: 480, marketCap: 22000,
    growth: "Railway modernization, ₹12,000 Cr order book, container mfg, EV entry",
    risk: "Govt capex dependency, order lumpiness, new segment execution",
    business: "Railway wagons, containers, brake systems, CV components. Indian Railways modernization.",
    cashCycle: 68, interestCoverage: 9.5, fixedAssetTurnover: 2.8,
    ema20AboveEma50: true, closeAboveEma50: true, rs65dPositive: true, close95pctOf252dHigh: true,
  },
  {
    name: "Kaynes Technology", symbol: "KAYNES", sector: "Electronics / Defence",
    price: 5800, change: 4.5, ath: 6100, athDistance: 4.9,
    consolidationMonths: 5, breakout: false,
    rsAboveZero: true, rsValue: 1.18,
    volumeRatio: 2.4, avgVolume: 180000, todayVolume: 432000,
    salesCagr5y: 48, profitCagr5y: 62, roce: 15, de: 0.25, cfoRatio: 38,
    opm: 16, orderBookRatio: 3.2, promoterHolding: 61.5,
    invalidation: 5200, marketCap: 33000,
    growth: "Defence/space electronics, IoT, EV chargers, ₹5,000+ Cr order book",
    risk: "Execution scaling, working capital stretch, govt order dependency",
    business: "End-to-end electronics mfg — PCB, box build, OSAT. Defence, aerospace, auto, medical.",
    cashCycle: 95, interestCoverage: 7, fixedAssetTurnover: 2.2,
    ema20AboveEma50: true, closeAboveEma50: true, rs65dPositive: true, close95pctOf252dHigh: false,
  },
  {
    name: "Praj Industries", symbol: "PRAJIND", sector: "Bioenergy",
    price: 780, change: 1.5, ath: 815, athDistance: 4.3,
    consolidationMonths: 12, breakout: false,
    rsAboveZero: true, rsValue: 0.92,
    volumeRatio: 1.6, avgVolume: 380000, todayVolume: 608000,
    salesCagr5y: 22, profitCagr5y: 28, roce: 32, de: 0.02, cfoRatio: 68,
    opm: 14.5, orderBookRatio: 1.4, promoterHolding: 36.8,
    invalidation: 700, marketCap: 14200,
    growth: "Bioenergy/CBG/SAF theme, zero-debt, global ethanol tech leader",
    risk: "Govt ethanol policy dependency, fixed-price contract margin pressure",
    business: "Global bioenergy — ethanol plants, CBG, sustainable aviation fuel. Water treatment & brewery.",
    cashCycle: 35, interestCoverage: 120, fixedAssetTurnover: 3.8,
    ema20AboveEma50: true, closeAboveEma50: true, rs65dPositive: true, close95pctOf252dHigh: true,
  },
  {
    name: "Tata Motors", symbol: "TATAMOTORS", sector: "Automobile",
    price: 745, change: 1.2, ath: 1080, athDistance: 31,
    consolidationMonths: 14, breakout: false,
    rsAboveZero: false, rsValue: -0.5,
    volumeRatio: 1.1, avgVolume: 18000000, todayVolume: 19800000,
    salesCagr5y: 20, profitCagr5y: 45, roce: 22, de: 0.6, cfoRatio: 65,
    opm: 12, orderBookRatio: 0.5, promoterHolding: 46.4,
    invalidation: 620, marketCap: 275000,
    growth: "JLR turnaround, EV market leader, commercial vehicle strength",
    risk: "Global luxury slowdown, high capex for EV, FX exposure",
    business: "Full-range auto OEM — Tata + JLR passenger, commercial vehicles, EV. 125+ countries.",
    cashCycle: 25, interestCoverage: 5.5, fixedAssetTurnover: 2.8,
    ema20AboveEma50: false, closeAboveEma50: false, rs65dPositive: false, close95pctOf252dHigh: false,
  },
  {
    name: "Affle India", symbol: "AFFLE", sector: "Adtech / AI",
    price: 1680, change: 3.8, ath: 1720, athDistance: 2.3,
    consolidationMonths: 15, breakout: false,
    rsAboveZero: true, rsValue: 1.28,
    volumeRatio: 2.0, avgVolume: 200000, todayVolume: 400000,
    salesCagr5y: 32, profitCagr5y: 28, roce: 20, de: 0.08, cfoRatio: 60,
    opm: 19, orderBookRatio: 0, promoterHolding: 58.4,
    invalidation: 1500, marketCap: 23000,
    growth: "AI adtech, emerging markets, connected TV, CPCU scaling",
    risk: "Customer concentration in BFSI/ecommerce, acquisition integration",
    business: "Consumer intelligence — AI mobile advertising. CPCU model. India, SE Asia, Africa.",
    cashCycle: 55, interestCoverage: 35, fixedAssetTurnover: 1.8,
    ema20AboveEma50: true, closeAboveEma50: true, rs65dPositive: true, close95pctOf252dHigh: true,
  },
  {
    name: "Cera Sanitaryware", symbol: "CERA", sector: "Building materials",
    price: 9100, change: -0.8, ath: 10500, athDistance: 13.3,
    consolidationMonths: 18, breakout: false,
    rsAboveZero: false, rsValue: -0.3,
    volumeRatio: 0.7, avgVolume: 25000, todayVolume: 17500,
    salesCagr5y: 14, profitCagr5y: 16, roce: 25, de: 0.05, cfoRatio: 72,
    opm: 18, orderBookRatio: 0, promoterHolding: 53.8,
    invalidation: 8200, marketCap: 11800,
    growth: "Premium brand, faucets & tiles expansion, distribution growth",
    risk: "Real estate cyclicality, gas price sensitivity, competition",
    business: "Premium sanitaryware, faucets, tiles. 5000+ dealers. Low debt, high cash gen.",
    cashCycle: 42, interestCoverage: 45, fixedAssetTurnover: 2.0,
    ema20AboveEma50: false, closeAboveEma50: false, rs65dPositive: false, close95pctOf252dHigh: false,
  },
];

// ── Scoring ──────────────────────────────────────────────────────────────────
function computeConviction(s: Stock): number {
  let score = 0;
  if (s.breakout) score += 15; else if (s.athDistance <= 5) score += 10;
  if (s.rsAboveZero) score += 10;
  if (s.rsValue > 1) score += 5;
  if (s.volumeRatio >= 2) score += 5; else if (s.volumeRatio >= 1.5) score += 3;
  if (s.consolidationMonths >= 6) score += 5;
  if (s.ema20AboveEma50) score += 3;
  if (s.closeAboveEma50) score += 3;
  if (s.rs65dPositive) score += 2;
  if (s.close95pctOf252dHigh) score += 2;
  if (s.salesCagr5y >= 20) score += 8; else if (s.salesCagr5y >= 10) score += 5;
  if (s.roce >= 20) score += 8; else if (s.roce >= 12) score += 5;
  if (s.de <= 0.5) score += 6; else if (s.de <= 1) score += 3;
  if (s.cfoRatio >= 50) score += 8; else if (s.cfoRatio >= 35) score += 4;
  if (s.orderBookRatio >= 2) score += 6; else if (s.orderBookRatio >= 1) score += 3;
  if (s.opm >= 15) score += 4; else if (s.opm >= 10) score += 2;
  if (s.promoterHolding < 40) score -= 5;
  if (s.cashCycle > 100) score -= 5;
  if (s.interestCoverage < 3) score -= 5;
  if (s.de > 1.5) score -= 5;
  return Math.max(0, Math.min(100, score));
}

const confColor = (v: number) => v >= 70 ? "var(--green)" : v >= 45 ? "var(--amber)" : "var(--text-3)";
const confLabel = (v: number) => v >= 80 ? "Very high" : v >= 65 ? "High" : v >= 45 ? "Moderate" : v >= 25 ? "Low" : "Very low";
const numC = (v: number) => v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--text-3)";

// ── Council ──────────────────────────────────────────────────────────────────
interface CouncilRating {
  name: string; role: string; color: string; icon: React.ReactNode;
  score: number; comment: string; action?: string;
}

function rateCouncil(s: Stock): CouncilRating[] {
  const ratings: CouncilRating[] = [];

  let cs = 0;
  if (s.breakout) cs += 30; else if (s.athDistance <= 5) cs += 20;
  if (s.rsAboveZero) cs += 25; else cs -= 10;
  if (s.rsValue > 1.2) cs += 10; else if (s.rsValue > 0) cs += 5;
  cs += Math.min(15, s.volumeRatio * 5);
  if (s.consolidationMonths >= 12) cs += 15; else if (s.consolidationMonths >= 6) cs += 10;
  if (s.ema20AboveEma50) cs += 5; if (s.closeAboveEma50) cs += 5;
  ratings.push({
    name: "The Chartist", role: "Technical", color: "#6c5ce7",
    icon: <Activity style={{ width: 14, height: 14 }} />,
    score: Math.min(100, Math.max(0, cs)),
    comment: s.breakout
      ? `ATH breakout after ${s.consolidationMonths}mo consolidation. RS ${s.rsValue.toFixed(2)}. Vol ${s.volumeRatio.toFixed(1)}x avg.`
      : s.athDistance <= 5
        ? `${s.athDistance.toFixed(1)}% from ATH — near breakout. RS ${s.rsAboveZero ? "positive" : "negative"}. Vol ${s.volumeRatio.toFixed(1)}x.`
        : `No breakout. ${s.athDistance.toFixed(1)}% from ATH. RS weak.`,
  });

  let fs = 0;
  if (s.salesCagr5y >= 25) fs += 25; else if (s.salesCagr5y >= 15) fs += 18; else if (s.salesCagr5y >= 10) fs += 10;
  if (s.profitCagr5y >= 30) fs += 20; else if (s.profitCagr5y >= 15) fs += 12;
  if (s.roce >= 20) fs += 20; else if (s.roce >= 12) fs += 12;
  if (s.orderBookRatio >= 3) fs += 15; else if (s.orderBookRatio >= 1) fs += 8;
  if (s.opm >= 15) fs += 10; else if (s.opm >= 10) fs += 5;
  fs += 10;
  ratings.push({
    name: "Fundamentalist", role: "Business", color: "#00cec9",
    icon: <Building2 style={{ width: 14, height: 14 }} />,
    score: Math.min(100, Math.max(0, fs)),
    comment: `Sales CAGR ${s.salesCagr5y}%, Profit CAGR ${s.profitCagr5y}%. ROCE ${s.roce}%. OPM ${s.opm}%. ${s.orderBookRatio > 0 ? `Order book ${s.orderBookRatio}x rev.` : ""} ${s.growth}`,
  });

  let cfs = 0;
  if (s.cfoRatio >= 60) cfs += 30; else if (s.cfoRatio >= 45) cfs += 20; else if (s.cfoRatio >= 30) cfs += 10;
  if (s.de <= 0.2) cfs += 25; else if (s.de <= 0.5) cfs += 18; else if (s.de <= 1) cfs += 10;
  if (s.interestCoverage >= 10) cfs += 20; else if (s.interestCoverage >= 4) cfs += 12; else cfs += 3;
  if (s.cashCycle <= 45) cfs += 15; else if (s.cashCycle <= 80) cfs += 8;
  cfs += 10;
  ratings.push({
    name: "Cash Flow King", role: "Financial", color: "#00d68f",
    icon: <Banknote style={{ width: 14, height: 14 }} />,
    score: Math.min(100, Math.max(0, cfs)),
    comment: `CFO/OP: ${s.cfoRatio}%. D/E: ${s.de}x. Interest coverage: ${s.interestCoverage}x. Cash cycle: ${s.cashCycle}d. ${s.cfoRatio < 40 ? "Weak cash realization." : "Cash gen healthy."}`,
  });

  let rs = 80;
  if (s.de > 1.5) rs -= 20; else if (s.de > 1) rs -= 10;
  if (s.cfoRatio < 35) rs -= 15;
  if (s.cashCycle > 100) rs -= 15;
  if (s.promoterHolding < 40) rs -= 15; else if (s.promoterHolding < 50) rs -= 8;
  if (s.interestCoverage < 3) rs -= 15;
  ratings.push({
    name: "Risk Sentinel", role: "Risk", color: "#ff6b6b",
    icon: <Shield style={{ width: 14, height: 14 }} />,
    score: Math.min(100, Math.max(0, rs)),
    comment: `Promoter: ${s.promoterHolding}%. ${s.risk}. Invalidation: ₹${s.invalidation}.`,
  });

  const avg = ratings.reduce((a, r) => a + r.score, 0) / 4;
  let al = avg;
  if (s.breakout && s.rsAboveZero && s.volumeRatio >= 2) al += 10;
  if (s.athDistance <= 2 && s.rsAboveZero) al += 5;
  let action: string;
  if (al >= 75) { action = "Strong buy"; }
  else if (al >= 60) { action = "Buy"; }
  else if (al >= 45) { action = "Accumulate"; }
  else if (al >= 30) { action = "Hold"; }
  else { action = "Avoid"; }
  ratings.push({
    name: "The Allocator", role: "Portfolio", color: "#f9ca24",
    icon: <Crown style={{ width: 14, height: 14 }} />,
    score: Math.min(100, Math.max(0, Math.round(al))),
    comment: `Council: ${action}. Conviction ${Math.round(al)}/100.`,
    action,
  });
  return ratings;
}

// ── Filters state ────────────────────────────────────────────────────────────
interface Filters {
  breakout: boolean; nearAth: boolean; rsPositive: boolean; highVol: boolean;
  ema20gt50: boolean; closeGtEma50: boolean; rs65d: boolean; close95: boolean;
  minPrice: number; minVol: number; minConsol: number;
  minSalesCagr: number; minRoce: number; maxDe: number; minCfo: number;
}

const DEFAULT_FILTERS: Filters = {
  breakout: true, nearAth: true, rsPositive: true, highVol: false,
  ema20gt50: true, closeGtEma50: true, rs65d: true, close95: true,
  minPrice: 20, minVol: 50000, minConsol: 3,
  minSalesCagr: 10, minRoce: 10, maxDe: 1.5, minCfo: 30,
};

// ── Components ───────────────────────────────────────────────────────────────
function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
      color, background: bg, border: `1px solid ${color}33`,
      display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer", padding: "5px 0" }}>
      <span style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "var(--font-body)" }}>{label}</span>
      <div onClick={onChange} style={{
        width: 36, height: 20, borderRadius: 10, position: "relative", cursor: "pointer",
        background: checked ? "var(--accent)" : "var(--surface-3)",
        border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
        transition: "all 150ms",
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: 7, position: "absolute", top: 2,
          left: checked ? 19 : 2, background: checked ? "#fff" : "var(--text-3)",
          transition: "all 150ms",
        }} />
      </div>
    </label>
  );
}

function RangeSlider({ value, min, max, step, label, display, onChange }: {
  value: number; min: number; max: number; step: number; label: string; display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--font-mono)" }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer", height: 4 }} />
    </div>
  );
}

function RatingBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "var(--green)" : value >= 40 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: "var(--text-3)", width: 150, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.round(value)}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "var(--font-mono)", width: 28, textAlign: "right" }}>
        {Math.round(value)}
      </span>
    </div>
  );
}

// ── Expandable stock card ────────────────────────────────────────────────────
function StockCard({ s, index }: { s: Stock & { _conviction: number }; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const conv = s._conviction;
  const cc = confColor(conv);
  const ratings = useMemo(() => expanded ? rateCouncil(s) : [], [expanded, s]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.5), duration: 0.2 }}
      style={{
        background: "var(--surface)", border: `1px solid var(--border)`,
        borderRadius: 14, overflow: "hidden", marginBottom: 10,
        borderLeft: s.breakout ? "3px solid var(--green)" : s.athDistance <= 5 ? "3px solid #f9ca24" : "3px solid var(--border)",
      }}
    >
      {/* Header row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "grid", gridTemplateColumns: "1.6fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.8fr 32px",
          alignItems: "center", padding: "12px 16px", cursor: "pointer",
          transition: "background 100ms",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--card-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        {/* Name */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 700, color: "var(--text-1)" }}>{s.symbol}</span>
            {s.breakout && <Badge color="var(--green)" bg="rgba(39,174,96,0.1)"><Trophy style={{ width: 9, height: 9 }} /> ATH</Badge>}
            {!s.breakout && s.athDistance <= 5 && <Badge color="#f9ca24" bg="rgba(249,202,36,0.1)"><Flame style={{ width: 9, height: 9 }} /> {s.athDistance.toFixed(1)}%</Badge>}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{s.sector} · ₹{(s.marketCap / 1000).toFixed(0)}K Cr</div>
        </div>

        {/* Price */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>₹{s.price.toLocaleString()}</div>
          <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: numC(s.change) }}>{s.change >= 0 ? "+" : ""}{s.change}%</div>
        </div>

        {/* RS */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {s.rsAboveZero ? <TrendingUp style={{ width: 12, height: 12, color: "var(--green)" }} /> : <TrendingDown style={{ width: 12, height: 12, color: "var(--red)" }} />}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: s.rsAboveZero ? "var(--green)" : "var(--red)" }}>
            {s.rsValue > 0 ? "+" : ""}{s.rsValue.toFixed(2)}
          </span>
        </div>

        {/* Volume */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 50, height: 5, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3,
                width: `${Math.min(100, s.volumeRatio / 5 * 100)}%`,
                background: s.volumeRatio >= 3 ? "var(--green)" : s.volumeRatio >= 2 ? "var(--amber)" : "var(--text-4)",
              }} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: s.volumeRatio >= 2 ? "var(--green)" : "var(--text-3)" }}>
              {s.volumeRatio.toFixed(1)}x
            </span>
          </div>
        </div>

        {/* ROCE */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: s.roce >= 20 ? "var(--green)" : s.roce >= 12 ? "var(--amber)" : "var(--text-3)" }}>
          {s.roce}%
        </div>

        {/* D/E */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: s.de <= 0.5 ? "var(--green)" : s.de <= 1 ? "var(--amber)" : "var(--red)" }}>
          {s.de}x
        </div>

        {/* Conviction */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 50, height: 5, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, width: `${conv}%`, background: cc, transition: "width 400ms" }} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: cc }}>{conv}</span>
          </div>
          <div style={{ fontSize: 9, color: cc, fontWeight: 600, marginTop: 2 }}>{confLabel(conv)}</div>
        </div>

        <div style={{ color: "var(--text-4)" }}>
          {expanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
        </div>
      </div>

      {/* Signals row */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "0 16px 10px" }}>
        {s.ema20AboveEma50 && <Badge color="#a29bfe" bg="rgba(162,155,254,0.1)">EMA 20&gt;50</Badge>}
        {s.closeAboveEma50 && <Badge color="#54a0ff" bg="rgba(84,160,255,0.1)">Close&gt;EMA50</Badge>}
        {s.rs65dPositive && <Badge color="#00cec9" bg="rgba(0,206,201,0.1)">RS+ 65D</Badge>}
        {s.close95pctOf252dHigh && <Badge color="#f9ca24" bg="rgba(249,202,36,0.1)">≥95% of 252D high</Badge>}
        <Badge color="var(--red)" bg="rgba(255,107,107,0.08)">
          <AlertTriangle style={{ width: 9, height: 9 }} /> SL ₹{s.invalidation}
        </Badge>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "16px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
              {/* Business */}
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 14 }}>
                <span style={{ fontWeight: 700, color: "var(--text-1)" }}>Business: </span>{s.business}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 14 }}>
                <span style={{ fontWeight: 700, color: "var(--green)" }}>Growth: </span>{s.growth}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 16 }}>
                <span style={{ fontWeight: 700, color: "var(--red)" }}>Risk: </span>{s.risk}
              </div>

              {/* Metrics grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginBottom: 16 }}>
                {[
                  { l: "5Y Sales CAGR", v: `${s.salesCagr5y}%`, c: s.salesCagr5y >= 20 ? "var(--green)" : "var(--text-1)" },
                  { l: "5Y Profit CAGR", v: `${s.profitCagr5y}%`, c: s.profitCagr5y >= 25 ? "var(--green)" : "var(--text-1)" },
                  { l: "OPM", v: `${s.opm}%`, c: "var(--text-1)" },
                  { l: "Order Book", v: s.orderBookRatio > 0 ? `${s.orderBookRatio}x rev` : "N/A", c: s.orderBookRatio >= 2 ? "var(--green)" : "var(--text-1)" },
                  { l: "CFO/OP", v: `${s.cfoRatio}%`, c: s.cfoRatio >= 50 ? "var(--green)" : s.cfoRatio >= 35 ? "var(--amber)" : "var(--red)" },
                  { l: "Cash Cycle", v: `${s.cashCycle}d`, c: s.cashCycle > 100 ? "var(--red)" : "var(--text-1)" },
                  { l: "Int. Coverage", v: `${s.interestCoverage}x`, c: s.interestCoverage >= 5 ? "var(--green)" : "var(--text-1)" },
                  { l: "Promoter", v: `${s.promoterHolding}%`, c: s.promoterHolding < 50 ? "var(--amber)" : "var(--text-1)" },
                ].map(m => (
                  <div key={m.l} style={{ background: "var(--surface-3)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, color: "var(--text-4)", letterSpacing: "0.06em", marginBottom: 3 }}>{m.l}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: m.c, fontFamily: "var(--font-mono)" }}>{m.v}</div>
                  </div>
                ))}
              </div>

              {/* Council */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <Crown style={{ width: 14, height: 14, color: "#f9ca24" }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-1)", letterSpacing: "0.06em" }}>HEDGE FUND COUNCIL</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
                  {ratings.map(r => (
                    <div key={r.name} style={{ background: "var(--surface-3)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                      <div style={{ color: r.color, marginBottom: 4 }}>{r.icon}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-2)" }}>{r.name}</div>
                      <div style={{ fontSize: 8, color: "var(--text-4)", marginBottom: 4 }}>{r.role}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: confColor(r.score), fontFamily: "var(--font-mono)" }}>{r.score}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: confColor(r.score), marginTop: 2 }}>
                        {r.action || (r.score >= 70 ? "BULLISH" : r.score >= 45 ? "NEUTRAL" : "BEARISH")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Parameter bars */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", marginBottom: 10 }}>PARAMETER BREAKDOWN</div>
                {[
                  { l: "ATH breakout / near ATH", v: s.breakout ? 100 : Math.max(0, 100 - s.athDistance * 5) },
                  { l: "Relative strength", v: s.rsAboveZero ? Math.min(100, 50 + s.rsValue * 30) : Math.max(0, 30 + s.rsValue * 20) },
                  { l: "Volume conviction", v: Math.min(100, s.volumeRatio * 25) },
                  { l: "EMA structure", v: (s.ema20AboveEma50 ? 50 : 0) + (s.closeAboveEma50 ? 50 : 0) },
                  { l: "Sales growth", v: Math.min(100, s.salesCagr5y * 2) },
                  { l: "ROCE", v: Math.min(100, s.roce * 3) },
                  { l: "Cash flow quality", v: s.cfoRatio },
                  { l: "Balance sheet", v: Math.max(0, 100 - s.de * 50) },
                  { l: "Promoter confidence", v: Math.min(100, s.promoterHolding * 1.3) },
                ].map(p => <RatingBar key={p.l} label={p.l} value={p.v} />)}
              </div>

              {/* Council commentary */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", marginBottom: 8 }}>COUNCIL COMMENTARY</div>
                {ratings.map(r => (
                  <div key={r.name} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ color: r.color }}>{r.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{r.name}</span>
                      <span style={{ fontSize: 9, color: "var(--text-4)" }}>{r.role}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>{r.comment}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function TechnoFundaScreener() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<string>("conviction");
  const [search, setSearch] = useState("");
  const f = filters;

  const results = useMemo(() => {
    let list = STOCKS.filter(s => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.symbol.toLowerCase().includes(search.toLowerCase())) return false;
      if (f.breakout && !f.nearAth && !s.breakout) return false;
      if (!f.breakout && f.nearAth && s.athDistance > 5) return false;
      if (f.breakout && f.nearAth && !s.breakout && s.athDistance > 5) return false;
      if (f.rsPositive && !s.rsAboveZero) return false;
      if (f.highVol && s.volumeRatio < 2) return false;
      if (f.ema20gt50 && !s.ema20AboveEma50) return false;
      if (f.closeGtEma50 && !s.closeAboveEma50) return false;
      if (f.rs65d && !s.rs65dPositive) return false;
      if (f.close95 && !s.close95pctOf252dHigh) return false;
      if (s.price < f.minPrice) return false;
      if (s.todayVolume < f.minVol) return false;
      if (s.consolidationMonths < f.minConsol) return false;
      if (s.salesCagr5y < f.minSalesCagr) return false;
      if (s.roce < f.minRoce) return false;
      if (s.de > f.maxDe) return false;
      if (s.cfoRatio < f.minCfo) return false;
      return true;
    }).map(s => ({ ...s, _conviction: computeConviction(s) }));

    list.sort((a, b) => {
      switch (sortBy) {
        case "rs": return b.rsValue - a.rsValue;
        case "volume": return b.volumeRatio - a.volumeRatio;
        case "ath": return a.athDistance - b.athDistance;
        case "sales": return b.salesCagr5y - a.salesCagr5y;
        default: return b._conviction - a._conviction;
      }
    });
    return list;
  }, [filters, sortBy, search]);

  const breakouts = results.filter(s => s.breakout).length;
  const nearAths = results.filter(s => !s.breakout && s.athDistance <= 5).length;
  const rsPos = results.filter(s => s.rsAboveZero).length;

  const set = (key: keyof Filters, val: boolean | number) => setFilters(p => ({ ...p, [key]: val }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
      {/* Filter panel */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Chartink conditions */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Zap style={{ width: 14, height: 14, color: "#00cec9" }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-2)", letterSpacing: "0.08em" }}>CHARTINK CONDITIONS</span>
          </div>
          <Toggle checked={f.close95} onChange={() => set("close95", !f.close95)} label="Close ≥ 95% of 252D high" />
          <Toggle checked={f.rs65d} onChange={() => set("rs65d", !f.rs65d)} label="Close / 65D ago > 1 (RS+)" />
          <Toggle checked={f.ema20gt50} onChange={() => set("ema20gt50", !f.ema20gt50)} label="EMA(20) > EMA(50)" />
          <Toggle checked={f.closeGtEma50} onChange={() => set("closeGtEma50", !f.closeGtEma50)} label="Close > EMA(50)" />
          <RangeSlider value={f.minPrice} min={1} max={500} step={1} label="Min price" display={`₹${f.minPrice}`}
            onChange={v => set("minPrice", v)} />
          <RangeSlider value={f.minVol} min={10000} max={5000000} step={10000} label="Min volume"
            display={f.minVol >= 1000000 ? `${(f.minVol / 1000000).toFixed(1)}M` : `${(f.minVol / 1000).toFixed(0)}K`}
            onChange={v => set("minVol", v)} />
        </div>

        {/* Technical filters */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <BarChart3 style={{ width: 14, height: 14, color: "var(--accent)" }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-2)", letterSpacing: "0.08em" }}>TECHNICAL FILTERS</span>
          </div>
          <Toggle checked={f.breakout} onChange={() => set("breakout", !f.breakout)} label="ATH breakout" />
          <Toggle checked={f.nearAth} onChange={() => set("nearAth", !f.nearAth)} label="Near ATH (within 5%)" />
          <Toggle checked={f.rsPositive} onChange={() => set("rsPositive", !f.rsPositive)} label="RS above zero" />
          <Toggle checked={f.highVol} onChange={() => set("highVol", !f.highVol)} label="High volume (>2x avg)" />
          <RangeSlider value={f.minConsol} min={1} max={36} step={1} label="Min consolidation" display={`${f.minConsol}mo`}
            onChange={v => set("minConsol", v)} />
        </div>

        {/* Fundamental filters */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Building2 style={{ width: 14, height: 14, color: "#00cec9" }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-2)", letterSpacing: "0.08em" }}>FUNDAMENTAL FILTERS</span>
          </div>
          <RangeSlider value={f.minSalesCagr} min={0} max={60} step={1} label="Min 5Y sales CAGR" display={`${f.minSalesCagr}%`}
            onChange={v => set("minSalesCagr", v)} />
          <RangeSlider value={f.minRoce} min={0} max={50} step={1} label="Min ROCE" display={`${f.minRoce}%`}
            onChange={v => set("minRoce", v)} />
          <RangeSlider value={f.maxDe} min={0} max={3} step={0.1} label="Max debt/equity" display={`${f.maxDe.toFixed(1)}x`}
            onChange={v => set("maxDe", v)} />
          <RangeSlider value={f.minCfo} min={0} max={100} step={5} label="Min CFO/OP ratio" display={`${f.minCfo}%`}
            onChange={v => set("minCfo", v)} />
        </div>
      </div>

      {/* Results */}
      <div>
        {/* Quick stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
          {[
            { l: "ATH breakouts", v: breakouts, c: "var(--green)" },
            { l: "Near ATH", v: nearAths, c: "#f9ca24" },
            { l: "RS positive", v: rsPos, c: "#00cec9" },
            { l: "Total matches", v: results.length, c: "var(--accent)" },
          ].map((s, i) => (
            <motion.div key={s.l} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
              <motion.div key={s.v} initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                style={{ fontSize: 22, fontWeight: 800, color: s.c, fontFamily: "var(--font-mono)" }}>{s.v}</motion.div>
              <div style={{ fontSize: 9, color: "var(--text-4)", letterSpacing: "0.08em", marginTop: 2 }}>{s.l}</div>
            </motion.div>
          ))}
        </div>

        {/* Search + sort */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search style={{ width: 14, height: 14, position: "absolute", left: 10, top: 9, color: "var(--text-4)" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol or name..."
              style={{
                width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
                padding: "8px 10px 8px 30px", color: "var(--text-1)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none",
              }} />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
              padding: "8px 10px", color: "var(--text-1)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", cursor: "pointer",
            }}>
            <option value="conviction">Conviction score</option>
            <option value="rs">Relative strength</option>
            <option value="volume">Volume ratio</option>
            <option value="ath">Distance from ATH</option>
            <option value="sales">Sales growth</option>
          </select>
        </div>

        {/* Table header */}
        <div style={{
          display: "grid", gridTemplateColumns: "1.6fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.8fr 32px",
          padding: "8px 16px", fontSize: 9, fontWeight: 700, color: "var(--text-4)",
          letterSpacing: "0.08em", fontFamily: "var(--font-body)",
        }}>
          <div>STOCK</div><div>PRICE</div><div>RS</div><div>VOLUME</div><div>ROCE</div><div>D/E</div><div>CONVICTION</div><div></div>
        </div>

        {/* Stock cards */}
        {results.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-4)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>No stocks match filters</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Try relaxing some criteria</div>
          </div>
        ) : (
          results.map((s, i) => <StockCard key={s.symbol} s={s} index={i} />)
        )}

        <div style={{ padding: "12px 0", textAlign: "center", fontSize: 10, color: "var(--text-4)" }}>
          Not financial advice. Educational purpose only. Investment in securities market are subject to market risks.
        </div>
      </div>
    </div>
  );
}
