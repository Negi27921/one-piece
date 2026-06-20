/**
 * useFriday — One Piece AI assistant (replaces JARVIS).
 *
 * Based on the Friday AI repo (github.com/negi27921010/friday.git).
 * Browser-native pipeline: SpeechRecognition → /api/friday/chat → SpeechSynthesis
 * Multi-turn conversation history. Action-capable (navigation, stock analysis).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";

export type FridayState = "offline" | "idle" | "listening" | "processing" | "speaking";

export interface FridayMessage {
  role: "user" | "friday";
  text: string;
  ts: number;
  action?: string;
  route?: string;
}

interface UseFridayOptions {
  autoConnect?: boolean;
}

const ROUTE_MAP: Record<string, string> = {
  "portfolio": "/portfolio",
  "screener": "/screener",
  "hedge-fund": "/hedge-fund",
  "watchlist": "/watchlist",
  "earnings-pulse": "/earnings-pulse",
  "journal": "/journal",
  "market": "/",
  "": "/",
};

export function useFriday({ autoConnect = false }: UseFridayOptions = {}) {
  const [state, setState]         = useState<FridayState>("offline");
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages]   = useState<FridayMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [wakeWordActive, setWakeWordActive] = useState(false);

  const recognitionRef     = useRef<any>(null);
  const wakeWordSRRef      = useRef<any>(null);
  const wakeWordActiveRef  = useRef(false);
  const isMicActiveRef     = useRef(false);
  const isProcessingRef    = useRef(false);
  const historyRef         = useRef<Array<{ role: string; content: string }>>([]);
  const navigate = useNavigate();

  useEffect(() => { isMicActiveRef.current = isMicActive; }, [isMicActive]);

  // ── Browser capability check ──────────────────────────────────────────────

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const ok = !!(SR && typeof window.speechSynthesis !== "undefined");
    setIsConnected(ok);
    setState(ok ? "idle" : "offline");
  }, []);

  // ── LLM processing ────────────────────────────────────────────────────────

  const processCommand = useCallback(async (text: string) => {
    if (!text.trim() || isProcessingRef.current) return;
    isProcessingRef.current = true;
    setState("processing");
    setTranscript("");

    const userMsg: FridayMessage = { role: "user", text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    // Maintain conversation history (last 6 turns)
    historyRef.current = [...historyRef.current.slice(-10), { role: "user", content: text }];

    try {
      const result = await api.post<{ response: string; action?: string; route?: string }>(
        "/friday/chat",
        { message: text, history: historyRef.current.slice(-6) },
      );

      const reply  = result.response ?? "Sorry, I couldn't process that.";
      const action = result.action ?? null;
      const route  = result.route  ?? null;

      historyRef.current = [...historyRef.current, { role: "assistant", content: reply }];

      const fridayMsg: FridayMessage = { role: "friday", text: reply, ts: Date.now(), action: action ?? undefined, route: route ?? undefined };
      setMessages(prev => [...prev, fridayMsg]);

      // Navigate if action says so
      if (action === "navigate" && route !== null && route !== undefined) {
        const path = ROUTE_MAP[route] ?? `/${route}`;
        setTimeout(() => navigate(path), 600);
      }

      // TTS
      setState("speaking");
      const synth = window.speechSynthesis;
      if (synth) {
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(reply.slice(0, 500));
        utterance.rate  = 1.05;
        utterance.pitch = 0.88;
        utterance.volume = 1.0;

        const setVoice = () => {
          const voices = synth.getVoices();
          const preferred =
            voices.find(v => v.name.includes("Google UK English Male")) ??
            voices.find(v => v.name.includes("Google") && v.lang.startsWith("en")) ??
            voices.find(v => v.lang.startsWith("en"));
          if (preferred) utterance.voice = preferred;
        };

        if (synth.getVoices().length > 0) setVoice();
        else synth.onvoiceschanged = setVoice;

        utterance.onend  = () => { setState("idle"); isProcessingRef.current = false; };
        utterance.onerror = () => { setState("idle"); isProcessingRef.current = false; };
        synth.speak(utterance);
      } else {
        setState("idle");
        isProcessingRef.current = false;
      }
    } catch (err) {
      const errMsg = "Intelligence layer unreachable. Check network and try again.";
      setMessages(prev => [...prev, { role: "friday", text: errMsg, ts: Date.now() }]);
      setState("idle");
      isProcessingRef.current = false;
    }
  }, [navigate]);

  // ── Mic ───────────────────────────────────────────────────────────────────

  const stopMic = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    isMicActiveRef.current = false;
    setIsMicActive(false);
    setState(s => (s === "listening" ? "idle" : s));
  }, []);

  const startMic = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || isMicActiveRef.current || isProcessingRef.current) return;
    window.speechSynthesis?.cancel();

    const recognition = new SR();
    recognition.continuous    = false;
    recognition.interimResults = true;
    recognition.lang           = "en-IN";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = "", final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t; else interim += t;
      }
      setTranscript(final || interim);
      if (final) {
        recognitionRef.current = null;
        isMicActiveRef.current = false;
        setIsMicActive(false);
        processCommand(final);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        isMicActiveRef.current = false;
        setIsMicActive(false);
        setState(s => (s === "listening" ? "idle" : s));
      }
    };

    recognition.onerror = (e: any) => {
      recognitionRef.current = null;
      isMicActiveRef.current = false;
      setIsMicActive(false);
      setState(s => (s === "listening" ? "idle" : s));
      console.warn("Friday STT error:", e.error);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      isMicActiveRef.current = true;
      setIsMicActive(true);
      setState("listening");
    } catch (err) { console.warn("Cannot start STT:", err); }
  }, [processCommand]);

  // ── Text fallback ─────────────────────────────────────────────────────────

  const sendText = useCallback((text: string) => {
    if (!text.trim()) return;
    window.speechSynthesis?.cancel();
    stopMic();
    processCommand(text);
  }, [processCommand, stopMic]);

  // ── Toggle ────────────────────────────────────────────────────────────────

  const toggleListen = useCallback(() => {
    if (state === "processing" || state === "speaking") {
      window.speechSynthesis?.cancel();
      setState("idle");
      isProcessingRef.current = false;
      return;
    }
    if (isMicActive) stopMic(); else startMic();
  }, [state, isMicActive, startMic, stopMic]);

  // ── Wake word detection ───────────────────────────────────────────────────

  const stopWakeWord = useCallback(() => {
    wakeWordActiveRef.current = false;
    setWakeWordActive(false);
    if (wakeWordSRRef.current) {
      const sr = wakeWordSRRef.current;
      wakeWordSRRef.current = null;
      try { sr.stop(); } catch {}
    }
  }, []);

  const startWakeWord = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || isMicActiveRef.current || wakeWordSRRef.current || isProcessingRef.current) return;

    const recognition = new SR();
    recognition.continuous     = true;
    recognition.interimResults = true;
    recognition.lang           = "en-US";

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.toLowerCase().trim();
        if (text.includes("friday") || text.includes("hey friday")) {
          stopWakeWord();
          startMic();
          return;
        }
      }
    };

    recognition.onend = () => {
      if (wakeWordActiveRef.current && wakeWordSRRef.current === recognition) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === "aborted") return;
      if (e.error === "not-allowed") {
        wakeWordActiveRef.current = false;
        wakeWordSRRef.current = null;
        setWakeWordActive(false);
      }
    };

    try {
      recognition.start();
      wakeWordSRRef.current    = recognition;
      wakeWordActiveRef.current = true;
      setWakeWordActive(true);
    } catch {}
  }, [stopWakeWord, startMic]);

  // Auto wake word
  useEffect(() => {
    if (!isConnected) return;
    const t = setTimeout(startWakeWord, 1500);
    return () => clearTimeout(t);
  }, [isConnected, startWakeWord]);

  useEffect(() => {
    if (state === "idle" && !isMicActive) {
      const t = setTimeout(startWakeWord, 1200);
      return () => clearTimeout(t);
    }
  }, [state, isMicActive, startWakeWord]);

  // Space key shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) { e.preventDefault(); toggleListen(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleListen]);

  useEffect(() => {
    if (autoConnect) {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const ok = !!(SR && typeof window.speechSynthesis !== "undefined");
      setIsConnected(ok);
      if (ok) setState("idle");
    }
  }, [autoConnect]);

  // Cleanup
  useEffect(() => () => {
    stopMic();
    stopWakeWord();
    window.speechSynthesis?.cancel();
  }, [stopMic, stopWakeWord]);

  return {
    state, transcript, messages, isConnected, isMicActive, wakeWordActive,
    toggleListen, sendText, startWakeWord, stopWakeWord,
  };
}
