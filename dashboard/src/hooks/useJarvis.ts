/**
 * useJarvis — WebSocket voice pipeline hook.
 *
 * Manages mic capture → PCM16 streaming → JARVIS WebSocket → audio playback.
 * Falls back to text-only mode (no mic permission / no WS) gracefully.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export type JarvisState = "offline" | "idle" | "listening" | "processing" | "speaking";

export interface JarvisMessage {
  role: "user" | "jarvis";
  text: string;
  ts: number;
}

interface UseJarvisOptions {
  wsUrl?: string;
  autoConnect?: boolean;
}

const JARVIS_WS = import.meta.env.VITE_JARVIS_WS_URL ?? "ws://localhost:8765/ws";

export function useJarvis({ wsUrl = JARVIS_WS, autoConnect = false }: UseJarvisOptions = {}) {
  const [state, setState] = useState<JarvisState>("offline");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [messages, setMessages] = useState<JarvisMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const navigate = useNavigate();

  // ── Audio playback queue ───────────────────────────────────────────────────

  const playNextChunk = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;

    const ctx = audioCtxRef.current ?? new AudioContext({ sampleRate: 24000 });
    audioCtxRef.current = ctx;

    if (ctx.state === "suspended") await ctx.resume();

    const mp3Buffer = audioQueueRef.current.shift()!;
    try {
      const decoded = await ctx.decodeAudioData(mp3Buffer);
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.onended = () => {
        isPlayingRef.current = false;
        playNextChunk();
      };
      source.start();
    } catch {
      isPlayingRef.current = false;
      playNextChunk();
    }
  }, []);

  const enqueueAudio = useCallback(
    (base64mp3: string) => {
      const binary = atob(base64mp3);
      const buf = new ArrayBuffer(binary.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
      audioQueueRef.current.push(buf);
      playNextChunk();
    },
    [playNextChunk],
  );

  // ── WebSocket ──────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setState("idle");
    };

    ws.onclose = () => {
      setIsConnected(false);
      setState("offline");
      wsRef.current = null;
    };

    ws.onerror = () => {
      setIsConnected(false);
      setState("offline");
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data !== "string") return;
      try {
        const msg = JSON.parse(evt.data);

        switch (msg.type) {
          case "state":
            setState(msg.state as JarvisState);
            break;

          case "transcript":
            setTranscript(msg.text ?? "");
            if (msg.final && msg.text) {
              setMessages((prev) => [
                ...prev,
                { role: "user", text: msg.text, ts: Date.now() },
              ]);
            }
            break;

          case "response":
            setResponse(msg.text ?? "");
            setMessages((prev) => [
              ...prev,
              { role: "jarvis", text: msg.text, ts: Date.now() },
            ]);
            // Navigate if JARVIS requests it
            if (msg.nav) {
              setTimeout(() => navigate(`/${msg.nav === "market" ? "" : msg.nav}`), 800);
            }
            break;

          case "audio":
            if (msg.data) enqueueAudio(msg.data);
            break;

          case "greeting":
            setMessages([{ role: "jarvis", text: msg.text, ts: Date.now() }]);
            break;
        }
      } catch {
        /* ignore malformed messages */
      }
    };
  }, [wsUrl, enqueueAudio, navigate]);

  const disconnect = useCallback(() => {
    stopMic();
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
    setState("offline");
  }, []); // eslint-disable-line

  // ── Mic capture ────────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);

      // ScriptProcessorNode: captures raw PCM float32, converts to PCM16
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
        }
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(pcm16.buffer);
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      setIsMicActive(true);
      setState("listening");
    } catch (err) {
      console.warn("Mic access denied, falling back to text mode:", err);
    }
  }, []);

  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setIsMicActive(false);

    // Flush VAD
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop" }));
    }
  }, []);

  // ── Text fallback ──────────────────────────────────────────────────────────

  const sendText = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "text", text }));
      }
    },
    [],
  );

  // ── Toggle push-to-talk ────────────────────────────────────────────────────

  const toggleListen = useCallback(() => {
    if (!isConnected) {
      connect();
      return;
    }
    if (isMicActive) {
      stopMic();
    } else {
      startMic();
    }
  }, [isConnected, isMicActive, connect, startMic, stopMic]);

  // ── Space-bar shortcut ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Space (when not in an input) toggles voice
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        toggleListen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleListen]);

  // ── Auto-connect ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (autoConnect) connect();
  }, [autoConnect, connect]);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(
    () => () => {
      stopMic();
      wsRef.current?.close();
      audioCtxRef.current?.close();
    },
    [stopMic],
  );

  return {
    state,
    transcript,
    response,
    messages,
    isConnected,
    isMicActive,
    connect,
    disconnect,
    toggleListen,
    sendText,
  };
}
