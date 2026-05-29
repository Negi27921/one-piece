/**
 * JarvisOrb — animated voice AI button.
 *
 * States:
 *   offline    → dim orb, offline indicator
 *   idle       → slow gentle pulse, arc reactor glow
 *   listening  → bright expanding rings, mic active indicator
 *   processing → spinning orbital constellation dots
 *   speaking   → audio waveform bars + ring oscillation
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useJarvis, type JarvisState } from "@/hooks/useJarvis";

const STATE_COLOR: Record<JarvisState, string> = {
  offline:    "#334155",
  idle:       "#00d4ff",
  listening:  "#00ff87",
  processing: "#a855f7",
  speaking:   "#f59e0b",
};

const STATE_LABEL: Record<JarvisState, string> = {
  offline:    "OFFLINE",
  idle:       "STANDBY",
  listening:  "LISTENING",
  processing: "PROCESSING",
  speaking:   "SPEAKING",
};

// ── Waveform canvas ────────────────────────────────────────────────────────────

function WaveformCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const barsRef = useRef<number[]>(Array.from({ length: 24 }, () => Math.random() * 0.3 + 0.1));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const barCount = barsRef.current.length;
      const barW = (w / barCount) * 0.6;
      const gap = (w / barCount) * 0.4;

      barsRef.current = barsRef.current.map((v) => {
        if (!active) return v * 0.95 + 0.05 * (Math.random() * 0.15 + 0.05);
        const target = Math.random() * 0.85 + 0.15;
        return v * 0.7 + target * 0.3;
      });

      barsRef.current.forEach((v, i) => {
        const x = i * (barW + gap) + gap / 2;
        const barH = v * h;
        const y = (h - barH) / 2;

        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, active ? "rgba(245, 158, 11, 0.9)" : "rgba(0, 212, 255, 0.4)");
        grad.addColorStop(1, active ? "rgba(245, 158, 11, 0.3)" : "rgba(0, 212, 255, 0.1)");
        ctx.fillStyle = grad;

        const radius = barW / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, radius);
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
      width={80}
      height={32}
      style={{ opacity: active ? 1 : 0.4, transition: "opacity 0.3s" }}
    />
  );
}

// ── Orbital dots ──────────────────────────────────────────────────────────────

function OrbitalDots({ active }: { active: boolean }) {
  const dots = [
    { r: 52, size: 3, duration: 2.8, offset: 0 },
    { r: 52, size: 2, duration: 2.8, offset: 120 },
    { r: 52, size: 2, duration: 2.8, offset: 240 },
    { r: 68, size: 2.5, duration: 4.2, offset: 60 },
    { r: 68, size: 2, duration: 4.2, offset: 180 },
    { r: 68, size: 2, duration: 4.2, offset: 300 },
    { r: 84, size: 2, duration: 6.0, offset: 30 },
    { r: 84, size: 1.5, duration: 6.0, offset: 150 },
    { r: 84, size: 1.5, duration: 6.0, offset: 270 },
  ];

  return (
    <svg
      width="200"
      height="200"
      viewBox="0 0 200 200"
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
      {dots.map((d, i) => (
        <motion.circle
          key={i}
          r={d.size}
          fill={active ? STATE_COLOR.processing : "rgba(0, 212, 255, 0.5)"}
          animate={{
            cx: [
              100 + d.r * Math.cos((d.offset * Math.PI) / 180),
              100 + d.r * Math.cos(((d.offset + 180) * Math.PI) / 180),
              100 + d.r * Math.cos(((d.offset + 360) * Math.PI) / 180),
            ],
            cy: [
              100 + d.r * Math.sin((d.offset * Math.PI) / 180),
              100 + d.r * Math.sin(((d.offset + 180) * Math.PI) / 180),
              100 + d.r * Math.sin(((d.offset + 360) * Math.PI) / 180),
            ],
            opacity: active ? [0.9, 0.5, 0.9] : [0.3, 0.1, 0.3],
          }}
          transition={{
            duration: d.duration,
            repeat: Infinity,
            ease: "linear",
            delay: i * 0.1,
          }}
        />
      ))}
    </svg>
  );
}

// ── Main orb ──────────────────────────────────────────────────────────────────

export function JarvisOrb() {
  const {
    state,
    transcript,
    messages,
    isConnected,
    isMicActive,
    connect,
    toggleListen,
    sendText,
  } = useJarvis({ autoConnect: false });

  const [expanded, setExpanded] = useState(false);
  const [textInput, setTextInput] = useState("");
  const color = STATE_COLOR[state];
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleOrbClick = useCallback(() => {
    if (state === "offline") {
      connect();
    } else {
      toggleListen();
    }
  }, [state, connect, toggleListen]);

  const handleTextSend = useCallback(() => {
    const t = textInput.trim();
    if (!t) return;
    if (!isConnected) connect();
    sendText(t);
    setTextInput("");
  }, [textInput, isConnected, connect, sendText]);

  // Ring animation variants per state
  const ringVariants = {
    offline:    { scale: 1, opacity: 0.2 },
    idle:       { scale: [1, 1.04, 1], opacity: [0.3, 0.5, 0.3] },
    listening:  { scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] },
    processing: { scale: [1, 1.08, 1], opacity: [0.5, 0.8, 0.5] },
    speaking:   { scale: [1, 1.12, 1], opacity: [0.6, 0.9, 0.6] },
  };

  const ringDuration: Record<JarvisState, number> = {
    offline: 3, idle: 3, listening: 0.8, processing: 1.2, speaking: 0.9,
  };

  return (
    <>
      {/* ── Floating button ────────────────────────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 12,
          pointerEvents: "none",
        }}
      >
        {/* ── Expanded panel ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              style={{
                pointerEvents: "auto",
                width: 340,
                background: "rgba(2, 4, 7, 0.97)",
                border: `1px solid ${color}30`,
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: `0 0 40px ${color}20, 0 20px 60px rgba(0,0,0,0.6)`,
                backdropFilter: "blur(20px)",
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: `1px solid ${color}20`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: `linear-gradient(135deg, ${color}08, transparent)`,
                }}
              >
                <div
                  style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: color,
                    boxShadow: `0 0 8px ${color}`,
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
                <span style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 11,
                  letterSpacing: "0.15em",
                  color,
                  fontWeight: 600,
                }}>
                  MARK-XXXIX · {STATE_LABEL[state]}
                </span>
                <div style={{ flex: 1 }} />
                <WaveformCanvas active={state === "speaking"} />
              </div>

              {/* Messages */}
              <div
                style={{
                  height: 280,
                  overflowY: "auto",
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {messages.length === 0 && (
                  <div style={{
                    textAlign: "center", color: "var(--text-4)",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11, marginTop: 60,
                  }}>
                    Press the orb or hit Space to activate
                  </div>
                )}

                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: m.role === "user" ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      background: m.role === "user"
                        ? "rgba(0, 212, 255, 0.08)"
                        : `${color}08`,
                      border: `1px solid ${m.role === "user" ? "rgba(0,212,255,0.2)" : color + "20"}`,
                      borderRadius: m.role === "user"
                        ? "12px 12px 2px 12px"
                        : "12px 12px 12px 2px",
                      padding: "8px 12px",
                    }}
                  >
                    {m.role === "jarvis" && (
                      <div style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 9,
                        color,
                        letterSpacing: "0.1em",
                        marginBottom: 4,
                        opacity: 0.7,
                      }}>
                        JARVIS
                      </div>
                    )}
                    <p style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: m.role === "user" ? "var(--text-2)" : "var(--text-1)",
                      fontFamily: "var(--font-sans, system-ui)",
                    }}>
                      {m.text}
                    </p>
                  </motion.div>
                ))}

                {/* Live transcript */}
                {transcript && state === "processing" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    style={{
                      alignSelf: "flex-end",
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 12,
                      color: "var(--text-3)",
                      fontStyle: "italic",
                      padding: "4px 10px",
                    }}
                  >
                    "{transcript}"
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Text input */}
              <div
                style={{
                  borderTop: `1px solid ${color}15`,
                  padding: "10px 12px",
                  display: "flex",
                  gap: 8,
                  background: "rgba(0,0,0,0.3)",
                }}
              >
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleTextSend();
                    }
                  }}
                  placeholder="Type to JARVIS…"
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: `1px solid ${color}20`,
                    borderRadius: 8,
                    padding: "7px 12px",
                    color: "var(--text-1)",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 12,
                    outline: "none",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = color + "60")}
                  onBlur={(e) => (e.target.style.borderColor = color + "20")}
                />
                <button
                  onClick={handleTextSend}
                  style={{
                    background: `${color}15`,
                    border: `1px solid ${color}30`,
                    borderRadius: 8,
                    padding: "7px 12px",
                    color,
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "JetBrains Mono, monospace",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.background = `${color}25`)}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.background = `${color}15`)}
                >
                  →
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main orb button ──────────────────────────────────────────────── */}
        <div
          style={{
            position: "relative",
            width: 72,
            height: 72,
            pointerEvents: "auto",
            cursor: "pointer",
          }}
        >
          {/* Orbital dots — behind the orb */}
          <OrbitalDots active={state === "processing"} />

          {/* Ring 3 — outermost */}
          <motion.div
            animate={state === "listening" || state === "speaking"
              ? { scale: [1.2, 1.5, 1.2], opacity: [0.15, 0.05, 0.15] }
              : { scale: 1.2, opacity: 0.08 }
            }
            transition={{ duration: ringDuration[state], repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute",
              inset: -28,
              borderRadius: "50%",
              border: `1px solid ${color}`,
              pointerEvents: "none",
            }}
          />

          {/* Ring 2 */}
          <motion.div
            animate={ringVariants[state]}
            transition={{
              duration: ringDuration[state] * 0.8,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.15,
            }}
            style={{
              position: "absolute",
              inset: -14,
              borderRadius: "50%",
              border: `1px solid ${color}`,
              pointerEvents: "none",
            }}
          />

          {/* Ring 1 — closest */}
          <motion.div
            animate={ringVariants[state]}
            transition={{
              duration: ringDuration[state] * 0.6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.08,
            }}
            style={{
              position: "absolute",
              inset: -5,
              borderRadius: "50%",
              border: `1.5px solid ${color}`,
              pointerEvents: "none",
            }}
          />

          {/* Core button */}
          <motion.button
            onClick={handleOrbClick}
            onContextMenu={(e) => { e.preventDefault(); setExpanded((v) => !v); }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            animate={{
              boxShadow: state === "idle"
                ? [`0 0 20px ${color}40`, `0 0 35px ${color}60`, `0 0 20px ${color}40`]
                : state === "listening"
                ? [`0 0 30px ${color}80`, `0 0 50px ${color}aa`, `0 0 30px ${color}80`]
                : state === "processing"
                ? [`0 0 25px ${color}60`, `0 0 45px ${color}90`, `0 0 25px ${color}60`]
                : state === "speaking"
                ? [`0 0 28px ${color}70`, `0 0 48px ${color}99`, `0 0 28px ${color}70`]
                : `0 0 10px ${color}20`,
            }}
            transition={{ duration: ringDuration[state], repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: `radial-gradient(circle at 35% 35%, ${color}30, rgba(2,4,7,0.97) 70%)`,
              border: `1.5px solid ${color}60`,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              backdropFilter: "blur(10px)",
            }}
          >
            {/* Arc reactor icon */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              {/* Outer ring */}
              <circle cx="14" cy="14" r="12" stroke={color} strokeWidth="1" strokeOpacity="0.6" />
              {/* Middle ring */}
              <circle cx="14" cy="14" r="8" stroke={color} strokeWidth="1.5" strokeOpacity="0.8" />
              {/* Triangle blades */}
              {[0, 120, 240].map((deg, i) => {
                const rad = (deg * Math.PI) / 180;
                const x1 = 14 + 8 * Math.cos(rad);
                const y1 = 14 + 8 * Math.sin(rad);
                const x2 = 14 + 4 * Math.cos((rad + 0.7));
                const y2 = 14 + 4 * Math.sin((rad + 0.7));
                const x3 = 14 + 4 * Math.cos((rad - 0.7));
                const y3 = 14 + 4 * Math.sin((rad - 0.7));
                return (
                  <motion.polygon
                    key={i}
                    points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`}
                    fill={color}
                    fillOpacity={state === "idle" ? "0.5" : "0.8"}
                    animate={{ rotate: state === "processing" ? 360 : 0 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    style={{ transformOrigin: "14px 14px" }}
                  />
                );
              })}
              {/* Core */}
              <motion.circle
                cx="14" cy="14" r="3"
                fill={color}
                animate={{ r: state === "listening" ? [3, 4, 3] : 3, opacity: state === "offline" ? 0.3 : 1 }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            </svg>

            {/* Mic indicator */}
            {isMicActive && (
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
                style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: "#00ff87",
                  boxShadow: "0 0 6px #00ff87",
                }}
              />
            )}
          </motion.button>

          {/* State label */}
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginTop: 6,
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 8,
              letterSpacing: "0.12em",
              color,
              opacity: 0.7,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              textAlign: "center",
            }}
          >
            {STATE_LABEL[state]}
          </div>
        </div>

        {/* Toggle expand button */}
        <motion.button
          onClick={() => {
            setExpanded((v) => !v);
            if (!isConnected) connect();
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            pointerEvents: "auto",
            background: `${color}10`,
            border: `1px solid ${color}25`,
            borderRadius: 8,
            padding: "4px 10px",
            color,
            cursor: "pointer",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9,
            letterSpacing: "0.1em",
            backdropFilter: "blur(10px)",
            transition: "all 0.2s",
            marginTop: 20,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = `${color}20`)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = `${color}10`)}
        >
          {expanded ? "▼ CLOSE" : "▲ JARVIS"}
        </motion.button>
      </div>

      {/* Global pulse keyframe */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.3); opacity: 0.6; }
        }
      `}</style>
    </>
  );
}
