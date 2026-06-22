"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice accessibility hook — browser-native Web Speech API only.
 *
 * Why this matters for this project specifically: a large share of
 * citizens filing civic complaints are elderly or have low literacy,
 * and some are blind or low-vision. A text-only form with no voice path
 * excludes exactly the population most likely to be failed by every
 * other channel already (the digital-divide problem documented in the
 * research). Two directions, both free and built into the browser:
 *
 *   1. Speech-to-text (SpeechRecognition): citizen taps a mic icon and
 *      speaks their complaint in Hindi or English instead of typing.
 *   2. Text-to-speech (SpeechSynthesis): any on-screen text — form
 *      labels, the NLP preview result, tracking status — can be read
 *      aloud, which helps low-literacy users and is a meaningful (if
 *      partial) accessibility aid for blind users navigating with a
 *      screen reader already, by giving an additional explicit "read
 *      this aloud" control rather than relying solely on the OS screen
 *      reader picking up dynamic content correctly.
 *
 * No external API, no per-request cost, no network dependency beyond
 * what the browser already ships with. Coverage varies by browser —
 * Chrome/Edge on Android and desktop support both directions well;
 * Safari/iOS support is comparatively weaker for SpeechRecognition.
 * Where the API isn't available, isSupported is false and the calling
 * component should hide the controls rather than show a button that
 * silently fails.
 */

type SpeechLang = "en" | "hi";

const RECOGNITION_LANG: Record<SpeechLang, string> = {
  en: "en-IN",
  hi: "hi-IN",
};

const SYNTHESIS_LANG: Record<SpeechLang, string> = {
  en: "en-IN",
  hi: "hi-IN",
};

export function useVoiceInput(lang: SpeechLang, onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(Boolean(SpeechRecognition));
  }, []);

  const start = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = RECOGNITION_LANG[lang];
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      onResult(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [lang, onResult]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { listening, isSupported, start, stop };
}

export function useVoiceOutput() {
  const [speaking, setSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  const speak = useCallback((text: string, lang: SpeechLang) => {
    if (!("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel(); // stop anything already speaking
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = SYNTHESIS_LANG[lang];
    utterance.rate = 0.95; // slightly slower than default — better for elderly/low-literacy listeners
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { speaking, isSupported, speak, stop };
}
