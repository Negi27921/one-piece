import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { api } from "@/api/client";

// ── Types ──────────────────────────────────────────────────────────────────────

interface UniverseTicker { ticker: string; name: string; sector: string; mcap_cr: number }
interface AgentSignal { analyst: string; name: string; title: string; signal: "bullish"|"bearish"|"neutral"; confidence: number; reasoning: string; error: string|null; type?: string }
interface Consensus { verdict: string; bullish_pct: number; bearish_pct: number; neutral_pct: number; avg_confidence: number }
interface AnalystMeta { key: string; name: string; title: string; style?: string }

const SIG_COLOR = { bullish:"#22c55e", bearish:"#ef4444", neutral:"#94a3b8" } as const;
const SIG_BG    = { bullish:"rgba(34,197,94,0.08)", bearish:"rgba(239,68,68,0.08)", neutral:"rgba(148,163,184,0.06)" } as const;
const SIG_ICON  = { bullish:"▲", bearish:"▼", neutral:"—" } as const;
const VERDICT_COLOR: Record<string,string> = {
  "STRONG BUY":"#22c55e","BUY":"#4ade80","HOLD":"#94a3b8","SELL":"#f87171","STRONG SELL":"#ef4444"
};

// ── Neural Orbit CSS ───────────────────────────────────────────────────────────

const ORBIT_CSS = `
@keyframes hf-orbit-cw {
  from { transform: rotate(var(--a)) translateX(var(--r)) rotate(calc(-1*var(--a))); }
  to   { transform: rotate(calc(var(--a)+360deg)) translateX(var(--r)) rotate(calc(-1*(var(--a)+360deg))); }
}
@keyframes hf-orbit-ccw {
  from { transform: rotate(var(--a)) translateX(var(--r)) rotate(calc(-1*var(--a))); }
  to   { transform: rotate(calc(var(--a)-360deg)) translateX(var(--r)) rotate(calc(-1*(var(--a)-360deg))); }
}
@keyframes hf-pulse-ring { 0%,100%{ opacity:.06; transform:scale(1); } 50%{ opacity:.22; transform:scale(1.04); } }
@keyframes hf-core-idle  { 0%,100%{ box-shadow:0 0 18px #a855f740,0 0 50px #a855f718; } 50%{ box-shadow:0 0 32px #a855f755,0 0 80px #a855f728; } }
@keyframes hf-core-fire  { 0%,100%{ box-shadow:0 0 48px #a855f7cc,0 0 120px #a855f760,0 0 200px #a855f730; } 50%{ box-shadow:0 0 80px #a855f7ff,0 0 160px #a855f7aa,0 0 300px #a855f750; } }
@keyframes hf-spin       { to{ transform:rotate(360deg); } }
@keyframes hf-spin-r     { to{ transform:rotate(-360deg); } }
@keyframes hf-dot-pulse  { 0%,100%{ opacity:.25; transform:scale(0.9); } 50%{ opacity:1; transform:scale(1.3); } }
@keyframes hf-active-chip{ 0%,100%{ box-shadow:0 0 0 0 rgba(168,85,247,0); } 50%{ box-shadow:0 0 8px 3px rgba(168,85,247,0.55); } }
@keyframes hf-synapse    { 0%{ opacity:0; transform:scaleX(0); } 20%{ opacity:1; } 80%{ opacity:1; transform:scaleX(1); } 100%{ opacity:0; transform:scaleX(1); } }
@keyframes hf-neuron-fire{ 0%{ opacity:0; transform:scale(0.5); } 30%{ opacity:1; transform:scale(1.4); } 70%{ opacity:1; transform:scale(1); } 100%{ opacity:0; transform:scale(1); } }
`;

// ── Synapse lines (neural network connections) ─────────────────────────────────

function SynapseCanvas({ agents, activeIdx }: { agents: AnalystMeta[]; activeIdx: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const progressRef = useRef(0);

  const getPositions = useCallback((w: number, h: number) => {
    const cx = w / 2, cy = h / 2;
    const n = agents.length;
    return agents.map((_, i) => {
      const ring   = i < 8 ? 0 : 1;
      const count  = ring === 0 ? 8 : n - 8;
      const idx    = ring === 0 ? i : i - 8;
      const r      = ring === 0 ? 130 : 185;
      const a      = (idx / count) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
  }, [agents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    const positions = getPositions(W, H);
    const cx = W / 2, cy = H / 2;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);

      // Draw base connections (faint neural mesh)
      positions.forEach((p, i) => {
        positions.forEach((q, j) => {
          if (j <= i) return;
          const dx = p.x - q.x, dy = p.y - q.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > 200) return;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(168,85,247,${0.04 * (1 - dist/200)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        });
      });

      // Draw center spokes
      positions.forEach((p, i) => {
        const alpha = activeIdx !== null && i === activeIdx ? 0.4 : 0.06;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = `rgba(168,85,247,${alpha})`;
        ctx.lineWidth = activeIdx !== null && i === activeIdx ? 1.5 : 0.5;
        ctx.stroke();
      });

      // Firing synapse animation when active
      if (activeIdx !== null) {
        const p = positions[activeIdx];
        if (p) {
          progressRef.current = (progressRef.current + 0.025) % 1;
          const prog = progressRef.current;

          // Signal traveling from center to active agent
          const sx = cx + (p.x - cx) * prog;
          const sy = cy + (p.y - cy) * prog;
          const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
          gradient.addColorStop(0, "rgba(168,85,247,0.9)");
          gradient.addColorStop(0.5, "rgba(96,165,250,0.5)");
          gradient.addColorStop(1, "rgba(168,85,247,0)");
          ctx.beginPath();
          ctx.arc(sx, sy, 8, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();

          // Ripple at active node
          const ripple = (Math.sin(t * 0.005) + 1) / 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12 + ripple * 8, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(168,85,247,${0.6 - ripple * 0.3})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [activeIdx, agents, getPositions]);

  return (
    <canvas
      ref={canvasRef}
      width={440}
      height={440}
      style={{
        position: "absolute",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}

// ── 3-D Council Chamber ───────────────────────────────────────────────────────

function CouncilChamber({ analysts, isPending, ticker, activeAgent }: {
  analysts: AnalystMeta[];
  isPending: boolean;
  ticker: string;
  activeAgent: string | null;
}) {
  const inner = analysts.slice(0, 8);
  const outer = analysts.slice(8);
  const activeIdx = activeAgent ? analysts.findIndex(a => a.key === activeAgent) : null;

  return (
    <div style={{
      position: "relative", height: 460,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      <style>{ORBIT_CSS}</style>

      {/* Neural network canvas */}
      <SynapseCanvas agents={analysts} activeIdx={activeIdx !== -1 ? activeIdx : null} />

      {/* Radial glow */}
      <div style={{
        position:"absolute", inset:0, zIndex:0,
        background: isPending
          ? "radial-gradient(ellipse 55% 50% at 50% 50%, rgba(168,85,247,0.15) 0%, rgba(96,165,250,0.06) 45%, transparent 70%)"
          : "radial-gradient(ellipse 50% 45% at 50% 50%, rgba(168,85,247,0.07) 0%, transparent 65%)",
        transition: "background 0.8s ease",
        pointerEvents:"none",
      }}/>

      {/* Orbit rings */}
      {[85, 135, 190, 220].map((r,i) => (
        <div key={r} style={{
          position:"absolute", width:r*2, height:r*2, borderRadius:"50%", zIndex:2,
          border:`1px solid rgba(168,85,247,${0.10-i*0.02})`,
          animation:`hf-pulse-ring ${3.5+i*0.8}s ease-in-out ${i*0.4}s infinite`,
        }}/>
      ))}

      {/* Inner ring agents (CW) */}
      <div style={{ position:"absolute", width:260, height:260, zIndex:4 }}>
        {inner.map((a, i) => {
          const isActive = a.key === activeAgent;
          return (
            <div key={a.key} style={{
              position:"absolute", top:"50%", left:"50%",
              marginTop:-14, marginLeft:-50,
              "--a": `${(i / inner.length) * 360}deg`,
              "--r": "130px",
              animation:`hf-orbit-cw ${22 + i * 0.4}s linear ${i * 0.15}s infinite`,
            } as any}>
              <div title={`${a.name} — ${a.title}\n${a.style ?? ""}`}>
                <OrbitChip name={a.name} active={isPending} firing={isActive} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Outer ring agents (CCW) */}
      <div style={{ position:"absolute", width:370, height:370, zIndex:4 }}>
        {outer.map((a, i) => {
          const isActive = a.key === activeAgent;
          return (
            <div key={a.key} style={{
              position:"absolute", top:"50%", left:"50%",
              marginTop:-14, marginLeft:-50,
              "--a": `${(i / outer.length) * 360 + 20}deg`,
              "--r": "185px",
              animation:`hf-orbit-ccw ${30 + i * 0.6}s linear ${i * 0.2}s infinite`,
            } as any}>
              <div title={`${a.name} — ${a.title}\n${a.style ?? ""}`}>
                <OrbitChip name={a.name} active={isPending} firing={isActive} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Core */}
      <div style={{
        position:"relative", zIndex:10,
        width:104, height:104, borderRadius:"50%",
        background:"radial-gradient(circle at 38% 32%, rgba(168,85,247,0.35), rgba(96,165,250,0.12) 55%, transparent)",
        border:`1.5px solid rgba(168,85,247,${isPending ? 0.75 : 0.4})`,
        display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        animation: isPending ? "hf-core-fire 1.6s ease-in-out infinite" : "hf-core-idle 3s ease-in-out infinite",
        transition: "border-color 0.6s ease",
      }}>
        <div style={{ position:"absolute", inset:7, borderRadius:"50%", border:"1px solid rgba(168,85,247,0.5)", borderTop:"2px solid rgba(168,85,247,0.95)", animation:"hf-spin 2.2s linear infinite" }}/>
        <div style={{ position:"absolute", inset:18, borderRadius:"50%", border:"1px solid rgba(96,165,250,0.35)", borderRight:"2px solid rgba(96,165,250,0.85)", animation:"hf-spin-r 3.8s linear infinite" }}/>
        <div style={{ fontFamily:"JetBrains Mono,monospace", fontSize:7, fontWeight:800, letterSpacing:"0.18em", color: isPending ? "rgba(168,85,247,0.95)" : "rgba(168,85,247,0.6)", textAlign:"center", lineHeight:1.35, zIndex:1 }}>
          {isPending ? <><span style={{fontSize:10,color:"rgba(96,165,250,0.95)"}}>⟳</span><br/>ANALYSING</> : <>AI<br/><span style={{fontSize:9,color:"rgba(96,165,250,0.7)"}}>∑</span><br/>COUNCIL</>}
        </div>
      </div>

      {/* Ticker label */}
      {isPending && (
        <motion.div
          initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }}
          style={{ position:"absolute", top:14, fontFamily:"JetBrains Mono,monospace", fontSize:9.5, fontWeight:800, letterSpacing:"0.2em", color:"rgba(168,85,247,0.7)", zIndex:10 }}
        >
          COUNCIL ACTIVE · {ticker}
        </motion.div>
      )}

      {/* Scrolling name ticker */}
      <div style={{ position:"absolute", bottom:10, left:0, right:0, overflow:"hidden", whiteSpace:"nowrap", fontFamily:"JetBrains Mono,monospace", fontSize:7, color:"rgba(168,85,247,0.3)", letterSpacing:"0.18em", zIndex:10 }}>
        <motion.span animate={{ x:[0, "-50%"] }} transition={{ duration:20, repeat:Infinity, ease:"linear" }} style={{ display:"inline-block" }}>
          {Array(2).fill("BUFFETT · MUNGER · GRAHAM · LYNCH · JHUNJHUNWALA · BURRY · DRUCKENMILLER · PABRAI · ACKMAN · DAMODARAN · WOOD · TECHNICAL · FUNDAMENTALS · ONE PIECE · POLICY CATALYST · ").join("")}
        </motion.span>
      </div>
    </div>
  );
}

function OrbitChip({ name, active, firing }: { name: string; active: boolean; firing: boolean }) {
  return (
    <div style={{
      display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px",
      background: firing ? "rgba(168,85,247,0.25)" : active ? "rgba(168,85,247,0.12)" : "rgba(168,85,247,0.05)",
      border:`1px solid rgba(168,85,247,${firing ? 0.75 : active ? 0.35 : 0.18})`,
      borderRadius:6,
      fontFamily:"JetBrains Mono,monospace", fontSize:7.5, fontWeight:700,
      color: firing ? "#e9d5ff" : active ? "rgba(210,190,255,0.85)" : "rgba(180,165,220,0.55)",
      whiteSpace:"nowrap", transition:"all 0.25s",
      animation: firing ? "hf-active-chip 0.7s ease-in-out infinite" : "none",
      boxShadow: firing ? "0 0 10px rgba(168,85,247,0.5)" : "none",
    }}>
      <div style={{
        width:4, height:4, borderRadius:"50%",
        background: firing ? "#c084fc" : active ? "#a855f7" : "rgba(168,85,247,0.35)",
        animation: (firing || active) ? `hf-dot-pulse ${1.0 + Math.random() * 0.6}s ease-in-out infinite` : "none",
        flexShrink:0,
      }}/>
      {name.split(" ").slice(0,2).join(" ")}
    </div>
  );
}

// ── Live deliberation log ──────────────────────────────────────────────────────

function DeliberationLog({ events }: {
  events: Array<{ type: string; name?: string; signal?: string; confidence?: number; reasoning?: string; error?: string | null }>
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div style={{
      borderTop:"1px solid rgba(168,85,247,0.1)",
      padding:"12px 20px 8px",
      maxHeight:180, overflowY:"auto",
    }}>
      <div style={{ fontSize:8.5, fontWeight:800, letterSpacing:"0.16em", color:"rgba(168,85,247,0.45)", marginBottom:6 }}>
        COUNCIL DELIBERATION
      </div>
      {events.map((ev, i) => {
        if (ev.type === "thinking") {
          return (
            <motion.div key={i} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.22 }}
              style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, fontFamily:"JetBrains Mono,monospace", fontSize:9.5, color:"rgba(200,185,255,0.65)" }}>
              <motion.span animate={{ opacity:[0.4,1,0.4] }} transition={{ duration:0.8, repeat:Infinity }} style={{ color:"rgba(168,85,247,0.6)", fontWeight:700 }}>›</motion.span>
              {ev.name} is deliberating…
              <motion.span animate={{ opacity:[0,1,0] }} transition={{ duration:0.7, repeat:Infinity }} style={{ color:"#a855f7", marginLeft:2 }}>▌</motion.span>
            </motion.div>
          );
        }
        if (ev.type === "agent_result") {
          const sig = ev.error ? "neutral" : (ev.signal ?? "neutral") as "bullish"|"bearish"|"neutral";
          const color = SIG_COLOR[sig];
          return (
            <motion.div key={i} initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.2 }}
              style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:4, fontFamily:"JetBrains Mono,monospace", fontSize:9.5 }}>
              <span style={{ color: color, fontWeight:700, flexShrink:0, marginTop:1 }}>
                {ev.error ? "✗" : sig === "bullish" ? "▲" : sig === "bearish" ? "▼" : "—"}
              </span>
              <span style={{ color:"rgba(200,185,255,0.7)", fontWeight:700, flexShrink:0 }}>{ev.name}</span>
              {!ev.error && ev.reasoning && (
                <span style={{ color:"rgba(160,145,205,0.55)", fontSize:8.5, lineHeight:1.4 }}>
                  — {ev.reasoning.slice(0, 90)}{ev.reasoning.length > 90 ? "…" : ""}
                </span>
              )}
              {ev.error && <span style={{ color:"#f87171", fontSize:8.5 }}>error</span>}
            </motion.div>
          );
        }
        return null;
      })}
      <div ref={bottomRef}/>
    </div>
  );
}

// ── Signal bar ────────────────────────────────────────────────────────────────

function SignalBar({ pct, color, label }: { pct:number; color:string; label:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:11 }}>
      <span style={{ fontFamily:"var(--font-mono)", color:"var(--text-3)", width:60, flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, height:6, background:"var(--surface-2)", borderRadius:3, overflow:"hidden" }}>
        <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.9, ease:"easeOut" }}
          style={{ height:"100%", background:color, borderRadius:3 }}/>
      </div>
      <span style={{ fontFamily:"var(--font-mono)", fontWeight:700, color, width:34, textAlign:"right" }}>{pct}%</span>
    </div>
  );
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentCard({ signal, index, style: agentStyle }: { signal:AgentSignal; index:number; style?:string }) {
  const [expanded, setExpanded] = useState(false);
  const sig   = signal.error ? "neutral" : signal.signal;
  const color = SIG_COLOR[sig];
  const isFib = signal.analyst === "one_piece_technical";
  const isPolicy = signal.analyst === "govt_policy";

  return (
    <motion.div
      initial={{ opacity:0, rotateY:80, scale:0.92 }}
      animate={{ opacity:1, rotateY:0, scale:1 }}
      transition={{ delay:index*0.04, duration:0.4, ease:[0.16,1,0.3,1] }}
      style={{ perspective:700 }}
      onClick={() => setExpanded(v => !v)}
    >
      <div style={{
        background: isFib ? "rgba(96,165,250,0.07)" : isPolicy ? "rgba(251,191,36,0.07)" : SIG_BG[sig],
        border:`1px solid ${isFib ? "rgba(96,165,250,0.3)" : isPolicy ? "rgba(251,191,36,0.3)" : color+"22"}`,
        borderRadius:10, padding:"12px 14px", cursor:"pointer",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:28, height:28, borderRadius:"50%",
            background:`${isFib ? "rgba(96,165,250" : isPolicy ? "rgba(251,191,36" : color.replace("#","rgba(")+","}15)`,
            border:`1.5px solid ${isFib ? "rgba(96,165,250,0.45)" : isPolicy ? "rgba(251,191,36,0.45)" : color+"40"}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:11, color: isFib ? "#60a5fa" : isPolicy ? "#fbbf24" : color,
            fontWeight:800, flexShrink:0,
          }}>
            {signal.error ? "!" : isFib ? "⊿" : isPolicy ? "⚑" : SIG_ICON[sig]}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"var(--text-1)", letterSpacing:"-0.01em" }}>{signal.name}</div>
            <div style={{ fontSize:10, color:"var(--text-4)", marginTop:1 }}>{signal.title}</div>
            {agentStyle && (
              <div style={{ fontSize:9, color:"var(--text-4)", marginTop:3, lineHeight:1.4, opacity:0.7, fontStyle:"italic" }}>
                {agentStyle}
              </div>
            )}
          </div>
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color: isFib ? "#60a5fa" : isPolicy ? "#fbbf24" : color }}>
              {signal.error ? "ERR" : `${signal.confidence}%`}
            </div>
            <div style={{ fontSize:9, color:"var(--text-4)", textTransform:"uppercase", letterSpacing:"0.08em" }}>
              {signal.error ? "error" : sig}
            </div>
          </div>
        </div>
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.2 }} style={{ overflow:"hidden" }}>
              <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${color}18`, fontSize:12, lineHeight:1.65, color:"var(--text-2)" }}>
                {signal.error ? <span style={{ color:"#ef4444" }}>Error: {signal.error}</span> : signal.reasoning || "No reasoning provided."}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Consensus card ────────────────────────────────────────────────────────────

function ConsensusCard({ consensus, ticker, company_name, price, paperTradeId }: {
  consensus:Consensus; ticker:string; company_name:string; price:number; paperTradeId:string|null;
}) {
  const vc = VERDICT_COLOR[consensus.verdict] ?? "#94a3b8";
  const traded = paperTradeId && !String(paperTradeId).startsWith("error:");
  return (
    <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ duration:0.4, ease:[0.16,1,0.3,1] }}
      style={{ background:`linear-gradient(135deg, ${vc}08, rgba(2,4,7,0.6))`, border:`1.5px solid ${vc}30`, borderRadius:14, padding:"20px 24px", marginBottom:24 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.14em", color:"var(--text-4)", marginBottom:4 }}>AI CONSENSUS · {ticker}</div>
          <div style={{ fontSize:28, fontWeight:800, color:vc, fontFamily:"var(--font-heading)", letterSpacing:"-0.02em" }}>{consensus.verdict}</div>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-3)", marginTop:2 }}>{company_name} · ₹{price.toLocaleString("en-IN",{minimumFractionDigits:2})}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:36, fontWeight:800, fontFamily:"var(--font-mono)", color:vc, letterSpacing:"-0.02em" }}>{consensus.avg_confidence}%</div>
          <div style={{ fontSize:9, color:"var(--text-4)", letterSpacing:"0.1em" }}>AVG CONFIDENCE</div>
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
        <SignalBar pct={consensus.bullish_pct} color="#22c55e" label="Bullish" />
        <SignalBar pct={consensus.bearish_pct} color="#ef4444" label="Bearish" />
        <SignalBar pct={consensus.neutral_pct} color="#64748b" label="Neutral" />
      </div>
      {traded && (
        <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:8 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 6px #22c55e" }}/>
          <span style={{ fontSize:11, color:"#22c55e", fontFamily:"var(--font-mono)", fontWeight:700 }}>PAPER TRADE PLACED · CMP ₹{price.toLocaleString("en-IN",{minimumFractionDigits:2})}</span>
          <span style={{ fontSize:10, color:"var(--text-4)", marginLeft:"auto" }}>ID {String(paperTradeId).slice(0,8)}</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const QUICK_TICKERS = ["RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","BAJFINANCE","MARUTI","WIPRO","AXISBANK","LT","HINDUNILVR","ITC","SUNPHARMA","TITAN","NESTLEIND"];

type StreamEvent = AgentSignal & { type: string };

export function HedgeFundPage() {
  const [ticker, setTicker]                   = useState("RELIANCE");
  const [inputVal, setInputVal]               = useState("RELIANCE");
  const [selectedAnalysts, setSelectedAnalysts] = useState<string[]>([]);
  const [showDropdown, setShowDropdown]       = useState(false);
  const [debouncedInput, setDebouncedInput]   = useState("");
  const inputRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Streaming state
  const [isStreaming, setIsStreaming]   = useState(false);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [completedSignals, setCompletedSignals] = useState<AgentSignal[]>([]);
  const [consensus, setConsensus]       = useState<Consensus | null>(null);
  const [resultMeta, setResultMeta]     = useState<{ ticker:string; company_name:string; price:number; paper_trade_id:string|null } | null>(null);
  const [activeAgent, setActiveAgent]   = useState<string | null>(null);
  const [streamError, setStreamError]   = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedInput(inputVal), 280);
    return () => clearTimeout(t);
  }, [inputVal]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!inputRef.current?.contains(e.target as Node) && !dropdownRef.current?.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: analysts = [] } = useQuery({
    queryKey: ["hedge-fund-analysts"],
    queryFn:  () => api.get<AnalystMeta[]>("/hedge-fund/analysts"),
    staleTime: Infinity,
  });

  const { data: universeData } = useQuery({
    queryKey: ["hedge-fund-universe"],
    queryFn:  () => api.get<{ tickers: UniverseTicker[]; total: number }>("/hedge-fund/universe?limit=20"),
  });

  const { data: suggestions } = useQuery({
    queryKey: ["hedge-fund-search", debouncedInput],
    queryFn:  () => api.get<{ tickers: UniverseTicker[] }>(`/hedge-fund/universe?q=${encodeURIComponent(debouncedInput)}&limit=8`),
    enabled:  debouncedInput.length >= 2 && showDropdown,
  });

  // ── SSE streaming ─────────────────────────────────────────────────────────

  const startStream = useCallback(async (sym: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsStreaming(true);
    setStreamEvents([]);
    setCompletedSignals([]);
    setConsensus(null);
    setResultMeta(null);
    setActiveAgent(null);
    setStreamError(null);

    try {
      const BASE = (window as any).__API_BASE__ || "";
      const res = await fetch(`${BASE}/api/hedge-fund/analyze/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: sym, selected_analysts: selectedAnalysts }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error(`API ${res.status}`);

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf      = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            const ev = JSON.parse(raw);
            if (ev.type === "thinking") {
              setActiveAgent(ev.analyst);
              setStreamEvents(prev => [...prev, ev]);
            } else if (ev.type === "agent_result") {
              setActiveAgent(null);
              setStreamEvents(prev => [...prev, ev]);
              setCompletedSignals(prev => [...prev, ev as AgentSignal]);
            } else if (ev.type === "consensus") {
              setConsensus(ev.consensus);
              setResultMeta({ ticker: ev.ticker, company_name: ev.company_name, price: ev.price, paper_trade_id: ev.paper_trade_id });
            } else if (ev.type === "error") {
              setStreamError(ev.msg ?? "Analysis failed");
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setStreamError(e?.message ?? "Stream error");
      }
    } finally {
      setIsStreaming(false);
      setActiveAgent(null);
    }
  }, [selectedAnalysts]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRun = useCallback((t?: string) => {
    const sym = (t ?? inputVal).trim().toUpperCase().replace(/\.NS$|\.BO$/i,"");
    if (!sym) return;
    setTicker(sym); setInputVal(sym); setShowDropdown(false);
    startStream(sym);
  }, [inputVal, startStream]);

  const selectSuggestion = useCallback((s: UniverseTicker) => {
    setInputVal(s.ticker); setShowDropdown(false); setTicker(s.ticker);
    startStream(s.ticker);
  }, [startStream]);

  const toggleAnalyst = useCallback((key: string) => {
    setSelectedAnalysts(prev => prev.includes(key) ? prev.filter(k => k!==key) : [...prev,key]);
  }, []);

  const quickPicks = universeData?.tickers.slice(0,18) ?? QUICK_TICKERS.map(t=>({ticker:t,name:"",sector:"",mcap_cr:0}));
  const dropdownItems = suggestions?.tickers ?? [];

  return (
    <div style={{ minHeight:"100%", background:"var(--bg)" }}>
      <Header title="Hedge Fund" subtitle="AI · 15 LEGENDARY INVESTORS" />

      <div style={{ padding:"20px 24px 40px", maxWidth:1000, margin:"0 auto" }}>

        {/* ── 3D Council Chamber ── */}
        <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5 }}
          style={{ background:"var(--surface)", border:"1px solid rgba(168,85,247,0.2)", borderRadius:16, overflow:"hidden", marginBottom:20 }}>
          {analysts.length > 0
            ? <CouncilChamber analysts={analysts} isPending={isStreaming} ticker={ticker} activeAgent={activeAgent}/>
            : (
              <div style={{ height:320, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <div style={{ width:48, height:48, borderRadius:"50%", border:"2px solid rgba(168,85,247,0.3)", borderTop:"2px solid rgba(168,85,247,0.9)", animation:"hf-spin 1.5s linear infinite" }}/>
              </div>
            )
          }
          {/* Live deliberation log */}
          <DeliberationLog events={streamEvents} />
        </motion.div>

        {/* ── Search + run ── */}
        <div style={{ background:"var(--surface)", border:"1.5px solid rgba(167,139,250,0.25)", borderRadius:14, padding:"18px 20px", marginBottom:20, boxShadow:"0 0 0 1px rgba(167,139,250,0.06) inset" }}>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:"0.12em", color:"rgba(167,139,250,0.7)", marginBottom:14 }}>
            ∑ ANALYSE A STOCK — 15-AGENT COUNCIL
          </div>

          <div style={{ display:"flex", gap:10, marginBottom:14 }}>
            <div style={{ flex:1, position:"relative" }}>
              <input
                ref={inputRef}
                value={inputVal}
                onChange={e => { setInputVal(e.target.value.toUpperCase()); setShowDropdown(true); }}
                onKeyDown={e => { if (e.key==="Enter") handleRun(); if (e.key==="Escape") setShowDropdown(false); }}
                onFocus={() => { if (inputVal.length >= 2) setShowDropdown(true); }}
                placeholder="NSE ticker — RELIANCE, TCS, INFY, HDFCBANK…"
                style={{ width:"100%", boxSizing:"border-box", background:"rgba(20,12,40,0.7)", border:"1.5px solid rgba(167,139,250,0.4)", borderRadius:10, padding:"11px 16px", color:"var(--text-1)", fontFamily:"var(--font-mono)", fontSize:14, fontWeight:600, outline:"none", transition:"border-color 0.15s" }}
                onFocusCapture={e => (e.target.style.borderColor="rgba(167,139,250,0.75)")}
                onBlurCapture={e  => (e.target.style.borderColor="rgba(167,139,250,0.4)")}
              />
              <AnimatePresence>
                {showDropdown && dropdownItems.length > 0 && (
                  <motion.div ref={dropdownRef} initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-4 }} transition={{ duration:0.12 }}
                    style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:200, background:"var(--surface)", border:"1px solid rgba(167,139,250,0.3)", borderRadius:10, overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }}>
                    {dropdownItems.map(s => (
                      <button key={s.ticker} onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
                        style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"9px 14px", background:"transparent", border:"none", borderBottom:"1px solid var(--border)", cursor:"pointer", textAlign:"left" }}
                        onMouseEnter={e => (e.currentTarget.style.background="var(--surface-2)")}
                        onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
                        <span style={{ fontFamily:"var(--font-mono)", fontWeight:700, fontSize:13, color:"var(--accent)", width:100, flexShrink:0 }}>{s.ticker}</span>
                        <span style={{ fontSize:12, color:"var(--text-2)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</span>
                        <span style={{ fontSize:10, color:"var(--text-4)", flexShrink:0, background:"var(--surface-2)", padding:"2px 6px", borderRadius:4 }}>{s.sector}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.button onClick={() => isStreaming ? abortRef.current?.abort() : handleRun()} whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
              style={{ padding:"11px 28px", flexShrink:0, minWidth:168, background: isStreaming ? "rgba(239,68,68,0.15)" : "linear-gradient(135deg, #a78bfa, #60a5fa)", border: isStreaming ? "1px solid rgba(239,68,68,0.4)" : "none", borderRadius:10, color: isStreaming ? "#f87171" : "#fff", fontWeight:700, fontSize:13, cursor:"pointer", boxShadow: isStreaming ? "none" : "0 4px 20px rgba(167,139,250,0.3)" }}>
              {isStreaming
                ? <span style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center" }}>
                    <motion.span animate={{ rotate:360 }} transition={{ duration:1, repeat:Infinity, ease:"linear" }} style={{ display:"inline-block" }}>⟳</motion.span>
                    Stop
                  </span>
                : `Run ${analysts.length || 15} Agents ∑`}
            </motion.button>
          </div>

          {/* Quick picks */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {quickPicks.map(item => (
              <button key={item.ticker} onClick={() => handleRun(item.ticker)} title={item.name || item.ticker}
                style={{ padding:"4px 12px", background: ticker===item.ticker && consensus ? "rgba(167,139,250,0.18)" : "rgba(20,12,40,0.6)", border:`1px solid ${ticker===item.ticker && consensus ? "rgba(167,139,250,0.55)" : "rgba(167,139,250,0.18)"}`, borderRadius:6, color: ticker===item.ticker && consensus ? "var(--accent)" : "rgba(200,185,255,0.5)", fontFamily:"var(--font-mono)", fontSize:11, fontWeight:600, cursor:"pointer", transition:"all 0.12s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor="rgba(167,139,250,0.5)"; (e.currentTarget as HTMLButtonElement).style.color="var(--accent)"; }}
                onMouseLeave={e => { if (!(ticker===item.ticker && consensus)) { (e.currentTarget as HTMLButtonElement).style.borderColor="rgba(167,139,250,0.18)"; (e.currentTarget as HTMLButtonElement).style.color="rgba(200,185,255,0.5)"; } }}>
                {item.ticker}
              </button>
            ))}
          </div>

          {/* Agent filter toggles */}
          {analysts.length > 0 && (
            <div style={{ marginTop:12, display:"flex", flexWrap:"wrap", gap:5 }}>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.12em", color:"var(--text-4)", alignSelf:"center", marginRight:4 }}>FILTER AGENTS:</span>
              {analysts.map(a => {
                const on = selectedAnalysts.length === 0 || selectedAnalysts.includes(a.key);
                return (
                  <button key={a.key} onClick={() => toggleAnalyst(a.key)} title={`${a.name} — ${a.title}\n${a.style ?? ""}`}
                    style={{ padding:"2px 8px", borderRadius:4, fontSize:9, fontWeight:600, fontFamily:"var(--font-mono)", cursor:"pointer", border:`1px solid ${on ? "rgba(167,139,250,0.35)" : "rgba(167,139,250,0.12)"}`, background: on ? "rgba(167,139,250,0.12)" : "transparent", color: on ? "var(--accent)" : "var(--text-4)", transition:"all 0.12s" }}>
                    {a.name.split(" ")[0]}
                  </button>
                );
              })}
              {selectedAnalysts.length > 0 && (
                <button onClick={() => setSelectedAnalysts([])} style={{ padding:"2px 8px", borderRadius:4, fontSize:9, fontWeight:700, cursor:"pointer", border:"1px solid rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.08)", color:"#f87171" }}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {streamError && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:10, padding:"12px 16px", marginBottom:20 }}>
            <span style={{ color:"#f87171", fontSize:13, fontFamily:"var(--font-mono)" }}>⚠ {streamError}</span>
          </motion.div>
        )}

        {/* ── Consensus ── */}
        {consensus && resultMeta && (
          <ConsensusCard consensus={consensus} ticker={resultMeta.ticker} company_name={resultMeta.company_name} price={resultMeta.price} paperTradeId={resultMeta.paper_trade_id} />
        )}

        {/* ── In-progress count ── */}
        {isStreaming && completedSignals.length > 0 && (
          <div style={{ marginBottom:16, fontSize:10, fontFamily:"var(--font-mono)", color:"rgba(168,85,247,0.6)", letterSpacing:"0.1em" }}>
            {completedSignals.length} / {analysts.length || 15} AGENTS REPORTED
          </div>
        )}

        {/* ── Agent cards ── */}
        {completedSignals.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:10 }}>
            {completedSignals.map((sig, i) => (
              <AgentCard key={sig.analyst} signal={sig} index={i} style={analysts.find(a => a.key === sig.analyst)?.style} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
