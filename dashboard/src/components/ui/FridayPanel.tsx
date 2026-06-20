/**
 * FRIDAY UI — One Piece AI assistant (replaces JARVIS).
 *
 * FridayHeaderBtn  — small "F" icon in header, click to open panel
 * FridayPanel      — sliding chat panel with voice + text
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFridayContext } from "@/contexts/FridayContext";
import type { FridayState } from "@/hooks/useFriday";

export const STATE_COLOR: Record<FridayState, string> = {
  offline:    "#475569",
  idle:       "#00d4ff",
  listening:  "#00ff87",
  processing: "#a855f7",
  speaking:   "#f59e0b",
};

const STATE_LABEL: Record<FridayState, string> = {
  offline:    "OFFLINE",
  idle:       "READY",
  listening:  "LISTENING",
  processing: "THINKING",
  speaking:   "SPEAKING",
};

// ── Waveform ──────────────────────────────────────────────────────────────────

function WaveformCanvas({ active, color }: { active: boolean; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const barsRef   = useRef<number[]>(Array.from({ length: 18 }, () => Math.random() * 0.3 + 0.1));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width, h = canvas.height;
      const n = barsRef.current.length;
      const barW = (w / n) * 0.52;

      barsRef.current = barsRef.current.map(v =>
        active ? v * 0.65 + (Math.random() * 0.9 + 0.1) * 0.35 : v * 0.85 + 0.06 * 0.15
      );

      barsRef.current.forEach((v, i) => {
        const x = (i / n) * w + (w / n) * 0.24;
        const bh = v * h * 0.85;
        const y  = (h - bh) / 2;
        const alpha = active ? 0.7 + v * 0.3 : 0.25;
        ctx.fillStyle = color.replace(")", `,${alpha})`).replace("rgb", "rgba");
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, 2);
        ctx.fill();
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, color]);

  return <canvas ref={canvasRef} width={120} height={28} style={{ display:"block" }} />;
}

// ── Header button ─────────────────────────────────────────────────────────────

export function FridayHeaderBtn() {
  const { state, panelOpen, setPanelOpen, wakeWordActive } = useFridayContext();
  const color = STATE_COLOR[state];
  const isActive = state !== "idle" && state !== "offline";

  return (
    <button
      onClick={() => setPanelOpen(!panelOpen)}
      title={`FRIDAY · ${STATE_LABEL[state]}${wakeWordActive ? " · Wake word ON" : ""}`}
      style={{
        position: "relative",
        width: 34, height: 34,
        borderRadius: "50%",
        border: `1.5px solid ${color}50`,
        background: `radial-gradient(circle at 40% 35%, ${color}22, transparent 70%)`,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        transition: "border-color 0.3s, background 0.3s",
        boxShadow: isActive ? `0 0 12px ${color}60, 0 0 4px ${color}40` : `0 0 6px ${color}20`,
      }}
    >
      {/* F logo */}
      <span style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 13, fontWeight: 900,
        color, letterSpacing: "-0.03em",
        textShadow: `0 0 8px ${color}`,
      }}>F</span>

      {/* Pulse ring when active */}
      {isActive && (
        <motion.div
          style={{ position:"absolute", inset:-4, borderRadius:"50%", border:`1px solid ${color}50` }}
          animate={{ scale:[1, 1.4, 1], opacity:[0.7, 0, 0.7] }}
          transition={{ duration:1.5, repeat:Infinity }}
        />
      )}

      {/* Wake word indicator dot */}
      {wakeWordActive && state === "idle" && (
        <div style={{
          position:"absolute", bottom:1, right:1,
          width:5, height:5, borderRadius:"50%",
          background:"#00ff87",
          boxShadow:"0 0 4px #00ff87",
        }}/>
      )}
    </button>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function FridayPanel() {
  const {
    state, transcript, messages, isConnected, isMicActive,
    toggleListen, sendText, panelOpen, setPanelOpen,
  } = useFridayContext();

  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const color = STATE_COLOR[state];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, transcript]);

  const handleSend = useCallback(() => {
    const t = inputText.trim();
    if (!t) return;
    setInputText("");
    sendText(t);
  }, [inputText, sendText]);

  if (!panelOpen) return null;

  return (
    <AnimatePresence>
      {panelOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={() => setPanelOpen(false)}
            style={{ position:"fixed", inset:0, zIndex:999, background:"rgba(0,0,0,0.3)", backdropFilter:"blur(2px)" }}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity:0, x:320, scale:0.96 }}
            animate={{ opacity:1, x:0,   scale:1 }}
            exit={{ opacity:0, x:320, scale:0.96 }}
            transition={{ type:"spring", damping:26, stiffness:280 }}
            style={{
              position:"fixed", top:56, right:12, zIndex:1000,
              width:340, maxHeight:"calc(100vh - 72px)",
              background:"rgba(8,6,16,0.97)",
              border:`1px solid ${color}28`,
              borderRadius:16,
              display:"flex", flexDirection:"column",
              overflow:"hidden",
              boxShadow:`0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px ${color}10 inset`,
            }}
          >
            {/* Header */}
            <div style={{
              display:"flex", alignItems:"center", gap:10,
              padding:"13px 16px",
              borderBottom:`1px solid ${color}18`,
              background:"rgba(255,255,255,0.025)",
              flexShrink:0,
            }}>
              {/* F logo */}
              <div style={{
                width:32, height:32, borderRadius:"50%",
                border:`1.5px solid ${color}60`,
                background:`radial-gradient(circle at 38% 32%, ${color}25, transparent 70%)`,
                display:"flex", alignItems:"center", justifyContent:"center",
                flexShrink:0,
                boxShadow:`0 0 12px ${color}40`,
              }}>
                <span style={{ fontFamily:"JetBrains Mono,monospace", fontSize:14, fontWeight:900, color, textShadow:`0 0 8px ${color}` }}>F</span>
              </div>

              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:800, letterSpacing:"0.12em", color:"var(--text-1)" }}>FRIDAY</div>
                <div style={{ fontSize:9, letterSpacing:"0.14em", color, fontFamily:"JetBrains Mono,monospace", fontWeight:600 }}>
                  {STATE_LABEL[state]}
                </div>
              </div>

              {/* Waveform when listening/speaking */}
              {(isMicActive || state === "speaking") && (
                <WaveformCanvas active={true} color={color.replace("#","rgb(").replace(/^#(..)(..)(..)$/, (_,r,g,b)=>`rgb(${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)})`)} />
              )}

              <button onClick={() => setPanelOpen(false)} style={{ background:"none", border:"none", color:"var(--text-4)", cursor:"pointer", fontSize:16, padding:"0 4px", lineHeight:1 }}>✕</button>
            </div>

            {/* Messages */}
            <div style={{ flex:1, overflowY:"auto", padding:"12px 16px", display:"flex", flexDirection:"column", gap:8, minHeight:0 }}>
              {messages.length === 0 && (
                <div style={{ textAlign:"center", padding:"20px 0", color:"var(--text-4)" }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>ⓕ</div>
                  <div style={{ fontSize:11, fontFamily:"JetBrains Mono,monospace", letterSpacing:"0.1em" }}>
                    {isConnected ? "Say \"Hey Friday\" or click the mic" : "Speech API not available in this browser"}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => {
                const isUser = msg.role === "user";
                return (
                  <motion.div key={i} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.2 }}
                    style={{ display:"flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth:"85%", padding:"9px 13px", borderRadius: isUser ? "12px 12px 3px 12px" : "3px 12px 12px 12px",
                      background: isUser ? `linear-gradient(135deg, rgba(100,70,220,0.4), rgba(60,40,160,0.4))` : "rgba(255,255,255,0.06)",
                      border: isUser ? "1px solid rgba(120,80,240,0.35)" : `1px solid ${color}18`,
                      fontSize:12.5, lineHeight:1.55, color:"var(--text-1)",
                    }}>
                      {msg.text}
                      {msg.route && (
                        <div style={{ marginTop:5, fontSize:9, fontFamily:"JetBrains Mono,monospace", color, letterSpacing:"0.1em" }}>
                          → /{msg.route}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/* Live transcript */}
              {transcript && (
                <motion.div animate={{ opacity:[0.5,1,0.5] }} transition={{ duration:0.9, repeat:Infinity }}
                  style={{ alignSelf:"flex-end", fontSize:11, color:"var(--text-3)", fontStyle:"italic", fontFamily:"var(--font-mono)", padding:"4px 0" }}>
                  {transcript}…
                </motion.div>
              )}

              {/* Thinking indicator */}
              {state === "processing" && (
                <div style={{ display:"flex", gap:4, padding:"4px 0" }}>
                  {[0,1,2].map(d => (
                    <motion.div key={d} animate={{ y:[0,-4,0] }} transition={{ duration:0.5, delay:d*0.12, repeat:Infinity }}
                      style={{ width:5, height:5, borderRadius:"50%", background:color }}/>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef}/>
            </div>

            {/* Input */}
            <div style={{ padding:"10px 12px", borderTop:`1px solid ${color}15`, background:"rgba(255,255,255,0.02)", flexShrink:0, display:"flex", gap:8, alignItems:"center" }}>
              {/* Mic button */}
              <motion.button
                onClick={toggleListen}
                disabled={!isConnected}
                whileHover={{ scale:1.05 }} whileTap={{ scale:0.92 }}
                style={{
                  width:36, height:36, borderRadius:"50%", flexShrink:0,
                  background: isMicActive ? `${color}25` : state === "processing" || state === "speaking" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
                  border: `1.5px solid ${isMicActive ? color : state === "processing" || state === "speaking" ? "#f8717150" : color+"28"}`,
                  cursor: isConnected ? "pointer" : "not-allowed",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:14,
                  boxShadow: isMicActive ? `0 0 10px ${color}50` : "none",
                }}
              >
                {state === "processing" || state === "speaking" ? "⏹" : isMicActive ? "⏺" : "🎤"}
              </motion.button>

              <input
                ref={inputRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
                placeholder="Type a command…"
                disabled={!isConnected}
                style={{
                  flex:1, background:"transparent", border:"none", outline:"none",
                  color:"var(--text-1)", fontFamily:"var(--font-mono)", fontSize:12.5,
                  padding:"6px 4px",
                }}
              />

              {inputText && (
                <motion.button onClick={handleSend} whileHover={{ scale:1.05 }} whileTap={{ scale:0.92 }}
                  style={{ background:`linear-gradient(135deg, ${color}40, ${color}20)`, border:`1px solid ${color}50`, borderRadius:8, padding:"5px 10px", color, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  ↵
                </motion.button>
              )}
            </div>

            {/* Hint */}
            <div style={{ padding:"6px 16px 10px", fontSize:9, color:"var(--text-4)", letterSpacing:"0.1em", fontFamily:"JetBrains Mono,monospace", textAlign:"center" }}>
              Say "Hey Friday" to wake · Space to toggle mic
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
