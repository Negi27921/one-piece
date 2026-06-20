/**
 * JARVIS UI — browser-native, no WebSocket.
 *
 *  JarvisHeaderBtn  arc-reactor icon in the header — click to listen
 *  JarvisPanel      sliding chat/voice panel anchored below the header
 *  JarvisOrb        kept as no-op for backward compat
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useJarvisContext } from "@/contexts/JarvisContext";
import type { JarvisState } from "@/hooks/useJarvis";

export const STATE_COLOR: Record<JarvisState, string> = {
  offline:    "#475569", // browser doesn't support speech APIs
  idle:       "#00d4ff",
  listening:  "#00ff87",
  processing: "#a855f7",
  speaking:   "#f59e0b",
};

const STATE_LABEL: Record<JarvisState, string> = {
  offline:    "UNAVAILABLE",
  idle:       "READY",
  listening:  "LISTENING",
  processing: "THINKING",
  speaking:   "SPEAKING",
};

// ── Waveform canvas ────────────────────────────────────────────────────────────

function WaveformCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const barsRef   = useRef<number[]>(Array.from({ length: 20 }, () => Math.random() * 0.3 + 0.1));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width, h = canvas.height;
      const barCount = barsRef.current.length;
      const barW = (w / barCount) * 0.55;
      const gap  = (w / barCount) * 0.45;

      barsRef.current = barsRef.current.map(v =>
        active
          ? v * 0.7 + (Math.random() * 0.85 + 0.15) * 0.3
          : v * 0.95 + 0.05 * (Math.random() * 0.15 + 0.05),
      );

      barsRef.current.forEach((v, i) => {
        const x = i * (barW + gap) + gap / 2;
        const barH = v * h;
        const y = (h - barH) / 2;
        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, active ? "rgba(245,158,11,0.9)" : "rgba(0,212,255,0.4)");
        grad.addColorStop(1, active ? "rgba(245,158,11,0.2)" : "rgba(0,212,255,0.05)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barW / 2);
        ctx.fill();
      });
      rafRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      width={64} height={22}
      style={{ opacity: active ? 1 : 0.3, transition: "opacity 0.3s" }}
    />
  );
}

// ── Arc reactor SVG ────────────────────────────────────────────────────────────

function ArcReactorIcon({ color, size = 20, spinning = false }: { color: string; size?: number; spinning?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" style={{ display: "block" }}>
      <circle cx="14" cy="14" r="12" stroke={color} strokeWidth="1"   strokeOpacity="0.5" />
      <circle cx="14" cy="14" r="8"  stroke={color} strokeWidth="1.5" strokeOpacity="0.8" />
      {[0, 120, 240].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <motion.polygon
            key={i}
            points={[
              [14 + 8 * Math.cos(rad),       14 + 8 * Math.sin(rad)],
              [14 + 4 * Math.cos(rad + 0.7), 14 + 4 * Math.sin(rad + 0.7)],
              [14 + 4 * Math.cos(rad - 0.7), 14 + 4 * Math.sin(rad - 0.7)],
            ].map(([x, y]) => `${x},${y}`).join(" ")}
            fill={color}
            fillOpacity="0.85"
            animate={spinning ? { rotate: 360 } : { rotate: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "14px 14px" }}
          />
        );
      })}
      <motion.circle
        cx="14" cy="14" r="3" fill={color}
        animate={{ opacity: [1, 0.4, 1] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      />
    </svg>
  );
}

// ── Header button ──────────────────────────────────────────────────────────────

export function JarvisHeaderBtn() {
  const { state, isMicActive, wakeWordActive, toggleListen, panelOpen, setPanelOpen } = useJarvisContext();
  const color    = STATE_COLOR[state];
  const isActive = state === "listening" || state === "processing" || state === "speaking";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {/* Wake-word pulse dot */}
      {wakeWordActive && !isMicActive && (
        <motion.div
          title='Wake word active — say "Hey JARVIS"'
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "#00d4ff", boxShadow: "0 0 4px #00d4ff",
          }}
        />
      )}

      {/* Arc reactor — click = toggle listening */}
      <motion.button
        onClick={toggleListen}
        onContextMenu={e => { e.preventDefault(); setPanelOpen(!panelOpen); }}
        title={
          state === "offline"    ? "JARVIS unavailable (browser speech not supported)" :
          state === "listening"  ? "JARVIS is listening — click to stop" :
          state === "processing" ? "JARVIS is thinking — click to cancel" :
          state === "speaking"   ? "JARVIS is speaking — click to stop" :
          'Click to speak · right-click to open panel · say "Hey JARVIS"'
        }
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        animate={{
          boxShadow: isActive
            ? [`0 0 8px ${color}55`, `0 0 18px ${color}99`, `0 0 8px ${color}55`]
            : "0 0 0 transparent",
        }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 32, height: 32, borderRadius: "50%",
          background: `radial-gradient(circle at 35% 35%, ${color}20, rgba(2,4,7,0.9) 70%)`,
          border: `1.5px solid ${color}45`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: state === "offline" ? "not-allowed" : "pointer", position: "relative",
        }}
      >
        <ArcReactorIcon color={color} size={18} spinning={state === "processing"} />
        {isMicActive && (
          <motion.div
            animate={{ opacity: [1, 0.2, 1], scale: [1, 1.5, 1] }}
            transition={{ duration: 0.55, repeat: Infinity }}
            style={{
              position: "absolute", bottom: 2, right: 2,
              width: 5, height: 5, borderRadius: "50%",
              background: "#00ff87", boxShadow: "0 0 4px #00ff87",
            }}
          />
        )}
      </motion.button>

      {/* JARVIS label */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        style={{
          background: panelOpen ? `${color}15` : "transparent",
          border: `1px solid ${panelOpen ? color + "35" : "transparent"}`,
          borderRadius: 5,
          padding: "2px 7px",
          cursor: "pointer",
          color,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = color + "50"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = panelOpen ? color + "35" : "transparent"; }}
      >
        JARVIS
      </button>
    </div>
  );
}

// ── Sliding panel ──────────────────────────────────────────────────────────────

export function JarvisPanel() {
  const {
    state, transcript, messages, isMicActive, wakeWordActive,
    toggleListen, sendText, panelOpen, setPanelOpen,
  } = useJarvisContext();

  const [localInput, setLocalInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const color = STATE_COLOR[state];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const t = localInput.trim();
    if (!t) return;
    sendText(t);
    setLocalInput("");
  }, [localInput, sendText]);

  return (
    <AnimatePresence>
      {panelOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "fixed",
            top: 88,
            right: 16,
            width: 380,
            zIndex: 9999,
            background: "rgba(2, 4, 7, 0.97)",
            border: `1px solid ${color}28`,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: `0 0 40px ${color}15, 0 24px 64px rgba(0,0,0,0.65)`,
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Panel header */}
          <div style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${color}15`,
            display: "flex", alignItems: "center", gap: 10,
            background: `linear-gradient(135deg, ${color}06, transparent)`,
          }}>
            {/* Mic toggle orb */}
            <motion.button
              onClick={toggleListen}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              animate={{
                boxShadow: state === "listening" || state === "processing" || state === "speaking"
                  ? [`0 0 6px ${color}50`, `0 0 14px ${color}80`, `0 0 6px ${color}50`]
                  : "0 0 0 transparent",
              }}
              transition={{ duration: 1, repeat: Infinity }}
              title={isMicActive ? "Stop listening" : "Start listening"}
              style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: `radial-gradient(circle at 35% 35%, ${color}20, rgba(2,4,7,0.9) 70%)`,
                border: `1.5px solid ${color}50`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <ArcReactorIcon color={color} size={14} spinning={state === "processing"} />
            </motion.button>

            <div>
              <div style={{
                fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                letterSpacing: "0.14em", color, fontWeight: 700,
              }}>
                JARVIS · {STATE_LABEL[state]}
              </div>
              <div style={{
                fontFamily: "JetBrains Mono, monospace", fontSize: 8,
                color: color + "66", letterSpacing: "0.1em", marginTop: 1,
              }}>
                {state === "listening"  && "I'm listening…"}
                {state === "processing" && "Analysing your query…"}
                {state === "speaking"   && "Playing response…"}
                {state === "idle"       && (wakeWordActive ? 'say "Hey JARVIS" or click mic' : "click mic or type below")}
                {state === "offline"    && "Speech APIs not supported in this browser"}
              </div>
            </div>

            <div style={{ flex: 1 }} />
            <WaveformCanvas active={state === "speaking"} />

            <button
              onClick={() => setPanelOpen(false)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-4)", fontSize: 18, lineHeight: 1,
                padding: "0 4px", borderRadius: 4, marginLeft: 6,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text-2)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-4)")}
            >
              ×
            </button>
          </div>

          {/* Live transcript */}
          {transcript && (state === "listening" || state === "processing") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                padding: "6px 14px",
                background: `${color}05`,
                borderBottom: `1px solid ${color}10`,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11, color: "var(--text-3)", fontStyle: "italic",
              }}
            >
              "{transcript}"
            </motion.div>
          )}

          {/* Messages */}
          <div style={{
            height: 300, overflowY: "auto",
            padding: "12px 14px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {messages.length === 0 && (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: "100%", gap: 12,
                color: "var(--text-4)", textAlign: "center",
              }}>
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  style={{
                    width: 48, height: 48, borderRadius: "50%",
                    background: `radial-gradient(circle at 35% 35%, ${color}20, transparent 70%)`,
                    border: `1px solid ${color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <ArcReactorIcon color={color} size={24} />
                </motion.div>
                <div style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", lineHeight: 2 }}>
                  <span style={{ color }}>Click the mic</span> or say{" "}
                  <span style={{ color }}>"Hey JARVIS"</span>
                  <br />
                  <span style={{ fontSize: 9, opacity: 0.5 }}>
                    Research stocks · Latest results · Navigate the terminal
                  </span>
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: m.role === "user" ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18 }}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  background: m.role === "user" ? "rgba(0,212,255,0.07)" : `${color}07`,
                  border: `1px solid ${m.role === "user" ? "rgba(0,212,255,0.18)" : color + "1a"}`,
                  borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  padding: "8px 12px",
                }}
              >
                {m.role === "jarvis" && (
                  <div style={{
                    fontFamily: "JetBrains Mono, monospace", fontSize: 8,
                    color, letterSpacing: "0.12em", marginBottom: 4, opacity: 0.6,
                  }}>
                    JARVIS
                  </div>
                )}
                <p style={{
                  margin: 0, fontSize: 13, lineHeight: 1.55,
                  color: m.role === "user" ? "var(--text-2)" : "var(--text-1)",
                }}>
                  {m.text}
                </p>
              </motion.div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Text input */}
          <div style={{
            borderTop: `1px solid ${color}10`,
            padding: "10px 12px",
            display: "flex", gap: 8,
            background: "rgba(0,0,0,0.2)",
          }}>
            <input
              value={localInput}
              onChange={e => setLocalInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask JARVIS anything…"
              style={{
                flex: 1, background: "transparent",
                border: `1px solid ${color}18`, borderRadius: 8,
                padding: "7px 12px", color: "var(--text-1)",
                fontFamily: "JetBrains Mono, monospace", fontSize: 12, outline: "none",
              }}
              onFocus={e  => (e.target.style.borderColor = color + "50")}
              onBlur={e   => (e.target.style.borderColor = color + "18")}
            />
            <motion.button
              onClick={handleSend}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.93 }}
              style={{
                background: `${color}12`, border: `1px solid ${color}28`,
                borderRadius: 8, padding: "7px 14px",
                color, cursor: "pointer", fontSize: 15,
              }}
            >
              ↑
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function JarvisOrb() { return null; }
