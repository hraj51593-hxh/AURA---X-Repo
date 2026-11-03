import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionAlternative = {
  transcript: string;
};

type RecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
};

type RecognitionResultList = {
  readonly length: number;
  readonly [index: number]: RecognitionResult;
};

type RecognitionResultEvent = {
  readonly results: RecognitionResultList;
};

type RecognitionErrorEvent = {
  readonly error: string;
  readonly message?: string;
};

type LocalSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type SpeechRecognitionConstructor = new () => LocalSpeechRecognition;

type LocalSpeechVoice = { lang: string; name: string; default?: boolean; localService?: boolean };

type LocalSpeechSynthesisUtterance = {
  text: string;
  lang: string;
  voice?: LocalSpeechVoice | null;
  rate?: number;
  pitch?: number;
  volume?: number;
  onend: ((event: Event) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type SpeechSynthesisUtteranceConstructor = new (
  text?: string
) => LocalSpeechSynthesisUtterance;

type LocalSpeechSynthesis = {
  cancel(): void;
  speak(utterance: LocalSpeechSynthesisUtterance): void;
  getVoices?(): LocalSpeechVoice[];
};

type SpeechBrowserGlobals = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  SpeechSynthesisUtterance?: SpeechSynthesisUtteranceConstructor;
  speechSynthesis?: LocalSpeechSynthesis;
};

type HostedSpeech = (text: string, language: "hi" | "en") => Promise<Blob>;
type HostedTranscription = (audio: Blob) => Promise<string>;
type SpeechCompletion = () => void;
type RecorderSession = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  token: number;
  onFinalTranscript?: (finalText: string) => void;
  transcribeAudio: HostedTranscription;
  shouldTranscribe: boolean;
};

export type AuriVoiceStatus = "idle" | "listening" | "transcribing" | "speaking" | "error";
export type AuriVoiceSource = "device" | "elevenlabs" | null;

export interface UseAuriVoiceReturn {
  recognitionAvailable: boolean;
  recordingFallbackAvailable: boolean;
  voiceInputAvailable: boolean;
  isRecordingFallback: boolean;
  speechAvailable: boolean;
  status: AuriVoiceStatus;
  voiceSource: AuriVoiceSource;
  errorMessage: string | null;
  transcript: string;
  language: string;
  setLanguage: (language: string) => void;
  startListening: (onFinalTranscript?: (finalText: string) => void, transcribeAudio?: HostedTranscription) => void;
  stopListening: () => void;
  finishListening: () => void;
  resetTranscript: () => void;
  speak: (text: string, hostedSpeech?: HostedSpeech, onComplete?: SpeechCompletion) => void;
  stopSpeaking: () => void;
}

const MAX_SPOKEN_TEXT_LENGTH = 4_000;

function getDefaultLanguage(): string {
  if (typeof navigator === "undefined") return "en-IN";
  return navigator.language?.toLowerCase().startsWith("hi") ? "hi-IN" : "en-IN";
}

function getSpeechGlobals(): SpeechBrowserGlobals | null {
  if (typeof window === "undefined") return null;
  return window as unknown as SpeechBrowserGlobals;
}

function getRecognitionErrorMessage(error: string, fallback?: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was denied. Allow microphone access and try again.";
    case "audio-capture":
      return "No microphone is available. Connect or enable a microphone and try again.";
    case "network":
      return "Speech recognition could not connect. Check your connection and try again.";
    case "no-speech":
      return "No speech was detected. Try again when you are ready.";
    case "language-not-supported":
      return "Speech recognition does not support the selected language in this browser.";
    case "aborted":
      return "Speech recognition was interrupted. Try again when you are ready.";
    default:
      return fallback || "Speech recognition failed. Please try again.";
  }
}

/**
 * Provides user-triggered browser dictation and opt-in spoken replies.
 * Transcripts and speech are handled locally by browser APIs; this hook does
 * not record, upload, or submit audio or text.
 */
export function useAuriVoice(): UseAuriVoiceReturn {
  const [recognitionAvailable, setRecognitionAvailable] = useState(false);
  const [recordingFallbackAvailable, setRecordingFallbackAvailable] = useState(false);
  const [isRecordingFallback, setIsRecordingFallback] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [status, setStatus] = useState<AuriVoiceStatus>("idle");
  const [voiceSource, setVoiceSource] = useState<AuriVoiceSource>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [language, setLanguageState] = useState(getDefaultLanguage);

  const recognitionRef = useRef<LocalSpeechRecognition | null>(null);
  const recorderSessionRef = useRef<RecorderSession | null>(null);
  const recorderStopTimerRef = useRef<number | undefined>(undefined);
  const inputTokenRef = useRef(0);
  const utteranceRef = useRef<LocalSpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const languageRef = useRef(language);
  const mountedRef = useRef(false);
  const speechTokenRef = useRef(0);
  const speechCompletionRef = useRef<{ token: number; callback?: SpeechCompletion } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const globals = getSpeechGlobals();
    setRecognitionAvailable(
      Boolean(globals?.SpeechRecognition || globals?.webkitSpeechRecognition)
    );
    setRecordingFallbackAvailable(Boolean(
      window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined"
    ));
    setSpeechAvailable(
      Boolean(globals?.speechSynthesis && globals?.SpeechSynthesisUtterance)
    );

    return () => {
      mountedRef.current = false;
      inputTokenRef.current += 1;
      if (recorderStopTimerRef.current !== undefined) window.clearTimeout(recorderStopTimerRef.current);
      recorderStopTimerRef.current = undefined;
      const recorderSession = recorderSessionRef.current;
      recorderSessionRef.current = null;
      if (recorderSession) {
        recorderSession.shouldTranscribe = false;
        try { if (recorderSession.recorder.state !== "inactive") recorderSession.recorder.stop(); } catch { /* The recorder may already be stopping. */ }
        recorderSession.stream.getTracks().forEach(track => track.stop());
      }
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      const utterance = utteranceRef.current;
      utteranceRef.current = null;
      if (utterance) {
        utterance.onend = null;
        utterance.onerror = null;
      }
      const audio = audioRef.current;
      audioRef.current = null;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      speechTokenRef.current += 1;
      speechCompletionRef.current = null;
      try {
        getSpeechGlobals()?.speechSynthesis?.cancel();
      } catch {
        // Ignore cleanup errors from browser speech implementations.
      }
    };
  }, []);

  const setLanguage = useCallback((nextLanguage: string) => {
    const normalizedLanguage = nextLanguage.trim();
    if (!normalizedLanguage) return;
    languageRef.current = normalizedLanguage;
    if (mountedRef.current) setLanguageState(normalizedLanguage);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.lang = normalizedLanguage;
      } catch {
        // The updated language will still be used for the next recognition session.
      }
    }
  }, []);

  const clearAudio = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }, []);

  const stopSpeaking = useCallback(() => {
    speechTokenRef.current += 1;
    speechCompletionRef.current = null;
    const utterance = utteranceRef.current;
    utteranceRef.current = null;
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
    }
    try {
      getSpeechGlobals()?.speechSynthesis?.cancel();
    } catch {
      // Cancellation is best-effort; state is still restored below.
    }
    clearAudio();
    if (mountedRef.current) setStatus("idle");
  }, [clearAudio]);

  const finishListening = useCallback(() => {
    const session = recorderSessionRef.current;
    if (!session) return;
    session.shouldTranscribe = true;
    if (recorderStopTimerRef.current !== undefined) window.clearTimeout(recorderStopTimerRef.current);
    recorderStopTimerRef.current = undefined;
    try {
      if (session.recorder.state !== "inactive") session.recorder.stop();
    } catch {
      if (mountedRef.current) {
        setErrorMessage("Could not finish that recording. Please try again or type your message.");
        setStatus("error");
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    inputTokenRef.current += 1;
    const recorded = recorderSessionRef.current;
    if (recorded) {
      recorderSessionRef.current = null;
      recorded.shouldTranscribe = false;
      if (recorderStopTimerRef.current !== undefined) window.clearTimeout(recorderStopTimerRef.current);
      recorderStopTimerRef.current = undefined;
      try { if (recorded.recorder.state !== "inactive") recorded.recorder.stop(); } catch { /* The recorder may already be stopping. */ }
      recorded.stream.getTracks().forEach(track => track.stop());
      if (mountedRef.current) {
        setIsRecordingFallback(false);
        setStatus("idle");
      }
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) {
      if (mountedRef.current) setStatus("idle");
      return;
    }

    // Clear handlers before stopping so a manual stop never submits a late result.
    recognitionRef.current = null;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        // The recognizer may already have ended.
      }
    }
    if (mountedRef.current) setStatus("idle");
  }, []);

  const startListening = useCallback((onFinalTranscript?: (finalText: string) => void, transcribeAudio?: HostedTranscription) => {
    const globals = getSpeechGlobals();
    const Recognition =
      globals?.SpeechRecognition || globals?.webkitSpeechRecognition;
    if (!globals) {
      if (mountedRef.current) {
        setErrorMessage("Speech recognition is not supported in this browser.");
        setStatus("error");
      }
      return;
    }

    if (recognitionRef.current || recorderSessionRef.current) return;

    // This entry point is called by the consumer from the explicit listen action.
    // Starting a new turn may interrupt playback, but never resumes the mic itself.
    if (speechCompletionRef.current || utteranceRef.current || audioRef.current) {
      stopSpeaking();
    }

    if (mountedRef.current) setErrorMessage(null);
    if (!Recognition) {
      if (!recordingFallbackAvailable || !transcribeAudio) {
        if (mountedRef.current) {
          setErrorMessage("Voice input needs a microphone and secure connection here. You can type to Auri instead.");
          setStatus("error");
        }
        return;
      }
      const token = ++inputTokenRef.current;
      void navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(stream => {
        if (!mountedRef.current || inputTokenRef.current !== token) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        const supportedMime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
        let recorder: MediaRecorder;
        try {
          recorder = supportedMime ? new MediaRecorder(stream, { mimeType: supportedMime }) : new MediaRecorder(stream);
        } catch {
          stream.getTracks().forEach(track => track.stop());
          setErrorMessage("This browser could not start microphone recording. You can type to Auri instead.");
          setStatus("error");
          return;
        }
        const session: RecorderSession = { recorder, stream, chunks: [], token, onFinalTranscript, transcribeAudio, shouldTranscribe: false };
        recorderSessionRef.current = session;
        recorder.ondataavailable = event => { if (event.data.size > 0) session.chunks.push(event.data); };
        recorder.onerror = () => {
          session.shouldTranscribe = false;
          stream.getTracks().forEach(track => track.stop());
          if (recorderSessionRef.current === session) recorderSessionRef.current = null;
          if (recorderStopTimerRef.current !== undefined) window.clearTimeout(recorderStopTimerRef.current);
          recorderStopTimerRef.current = undefined;
          if (mountedRef.current && inputTokenRef.current === token) {
            setIsRecordingFallback(false);
            setErrorMessage("Microphone recording stopped unexpectedly. Please retry or type your message.");
            setStatus("error");
          }
        };
        recorder.onstop = () => {
          if (recorderStopTimerRef.current !== undefined) window.clearTimeout(recorderStopTimerRef.current);
          recorderStopTimerRef.current = undefined;
          stream.getTracks().forEach(track => track.stop());
          if (recorderSessionRef.current === session) recorderSessionRef.current = null;
          if (!mountedRef.current || inputTokenRef.current !== token) return;
          setIsRecordingFallback(false);
          if (!session.shouldTranscribe) { setStatus("idle"); return; }
          const audio = new Blob(session.chunks, { type: recorder.mimeType || "audio/webm" });
          if (audio.size < 100) {
            setErrorMessage("No clear audio was captured. Please try again or type your message.");
            setStatus("error");
            return;
          }
          setStatus("transcribing");
          void session.transcribeAudio(audio).then(result => {
            if (!mountedRef.current || inputTokenRef.current !== token) return;
            const finalText = result.trim().slice(0, 3_000);
            if (!finalText) throw new Error("No speech was detected. Try again or type your message.");
            setTranscript(finalText);
            setStatus("idle");
            session.onFinalTranscript?.(finalText);
          }).catch(error => {
            if (!mountedRef.current || inputTokenRef.current !== token) return;
            setErrorMessage(error instanceof Error ? error.message : "Auri could not transcribe that clip. Please retry or type your message.");
            setStatus("error");
          });
        };
        try {
          recorder.start();
          setIsRecordingFallback(true);
          setStatus("listening");
          recorderStopTimerRef.current = window.setTimeout(() => finishListening(), 30_000);
        } catch {
          recorderSessionRef.current = null;
          stream.getTracks().forEach(track => track.stop());
          setErrorMessage("Could not start the microphone recording. Allow microphone access and try again.");
          setStatus("error");
        }
      }).catch(error => {
        if (!mountedRef.current || inputTokenRef.current !== token) return;
        const name = error instanceof Error ? error.name : "";
        const message = name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was denied. Allow microphone access in your browser and try again."
          : name === "NotFoundError" || name === "DevicesNotFoundError"
            ? "No microphone is available. Connect or enable a microphone and try again."
            : "Auri could not open the microphone. Check permissions and try again.";
        setErrorMessage(message);
        setStatus("error");
      });
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.lang = languageRef.current;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognitionRef.current = recognition;
      let finalDelivered = false;

      recognition.onstart = () => {
        if (recognitionRef.current === recognition && mountedRef.current) {
          setStatus("listening");
        }
      };
      recognition.onresult = event => {
        if (recognitionRef.current !== recognition || !mountedRef.current) return;
        let visibleTranscript = "";
        let finalText = "";
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const resultText = result?.[0]?.transcript ?? "";
          visibleTranscript += resultText;
          if (result?.isFinal) finalText += resultText;
        }
        setTranscript(visibleTranscript);
        const normalizedFinal = finalText.trim();
        if (normalizedFinal && !finalDelivered) {
          finalDelivered = true;
          try {
            onFinalTranscript?.(normalizedFinal);
          } catch {
            // Consumer errors must not break the browser recognition session.
          }
        }
      };
      recognition.onerror = event => {
        if (recognitionRef.current !== recognition || !mountedRef.current) return;
        recognitionRef.current = null;
        setErrorMessage(getRecognitionErrorMessage(event.error, event.message));
        setStatus("error");
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        if (mountedRef.current) setStatus("idle");
      };

      // Recognition is constructed and started only from this consumer-invoked action.
      recognition.start();
      if (mountedRef.current) setStatus("listening");
    } catch (error) {
      recognitionRef.current = null;
      if (mountedRef.current) {
        setErrorMessage(
          error instanceof Error
            ? error.message || "Could not start speech recognition."
            : "Could not start speech recognition. Check microphone permission and try again."
        );
        setStatus("error");
      }
    }
  }, [stopSpeaking, finishListening, recordingFallbackAvailable]);

  const resetTranscript = useCallback(() => {
    if (!mountedRef.current) return;
    setTranscript("");
    setErrorMessage(null);
    setStatus(current => current === "error" ? "idle" : current);
  }, []);

  const speak = useCallback((text: string, hostedSpeech?: HostedSpeech, onComplete?: SpeechCompletion) => {
    const safeText = text.trim().slice(0, MAX_SPOKEN_TEXT_LENGTH);
    const globals = getSpeechGlobals();
    const Utterance = globals?.SpeechSynthesisUtterance;
    const synthesis = globals?.speechSynthesis;

    // A reply and dictation should never compete for the microphone/output.
    const recognition = recognitionRef.current;
    if (recognition) {
      recognitionRef.current = null;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        try {
          recognition.stop();
        } catch {
          // Continue with speech playback if recognition has already stopped.
        }
      }
    }

    // Supersede any prior speech session without firing its completion callback.
    speechTokenRef.current += 1;
    const token = speechTokenRef.current;
    speechCompletionRef.current = { token, callback: onComplete };
    const priorUtterance = utteranceRef.current;
    utteranceRef.current = null;
    if (priorUtterance) {
      priorUtterance.onend = null;
      priorUtterance.onerror = null;
    }
    clearAudio();
    try {
      synthesis?.cancel();
    } catch {
      // Playback can still proceed if cancellation of the previous utterance fails.
    }

    const complete = (failed = false, message?: string) => {
      const active = speechCompletionRef.current;
      if (!active || active.token !== token) return;
      speechCompletionRef.current = null;
      if (mountedRef.current) {
        if (failed && message) setErrorMessage(message);
        setStatus(failed ? "error" : "idle");
      }
      try {
        active.callback?.();
      } catch {
        // A consumer callback should not interfere with voice state cleanup.
      }
    };

    if (!safeText) {
      complete();
      return;
    }
    if (!hostedSpeech && (!Utterance || !synthesis)) {
      complete(true, "Spoken replies are not supported in this browser.");
      return;
    }

    if (mountedRef.current) {
      setErrorMessage(null);
      setStatus("speaking");
    }

    const playOnDevice = (hostedFailure?: string) => {
      if (!Utterance || !synthesis) {
        complete(
          true,
          hostedFailure
            ? "Hosted voice failed and this browser has no device speech fallback."
            : "Spoken replies are not supported in this browser."
        );
        return;
      }
      try {
        const utterance = new Utterance(safeText);
        utterance.lang = languageRef.current;
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        const requestedLocale = languageRef.current.toLowerCase();
        const requestedLanguage = requestedLocale.split("-")[0];
        const availableVoices = synthesis.getVoices?.() ?? [];
        const matchingVoices = availableVoices.filter(voice => voice.lang.toLowerCase().startsWith(`${requestedLanguage}-`) || voice.lang.toLowerCase() === requestedLanguage);
        const regionalVoice = matchingVoices.find(voice => voice.lang.toLowerCase() === requestedLocale);
        const chosenVoice = regionalVoice ?? matchingVoices.find(voice => voice.default) ?? matchingVoices.find(voice => voice.localService) ?? matchingVoices[0];
        if (chosenVoice) utterance.voice = chosenVoice;
        utterance.onend = () => {
          if (utteranceRef.current !== utterance || speechTokenRef.current !== token) return;
          utteranceRef.current = null;
          complete();
        };
        utterance.onerror = event => {
          if (utteranceRef.current !== utterance || speechTokenRef.current !== token) return;
          utteranceRef.current = null;
          complete(true, event.error ? `Spoken reply stopped (${event.error}).` : "Spoken reply could not be played.");
        };
        utteranceRef.current = utterance;
        if (mountedRef.current) setVoiceSource("device");
        synthesis.speak(utterance);
      } catch (error) {
        complete(
          true,
          error instanceof Error
            ? error.message || "Could not play the spoken reply."
            : "Could not play the spoken reply."
        );
      }
    };

    if (!hostedSpeech) {
      playOnDevice();
      return;
    }

    const hostedLanguage = languageRef.current.toLowerCase().startsWith("hi") ? "hi" : "en";
    void Promise.resolve().then(() => hostedSpeech(safeText, hostedLanguage)).then(blob => {
      if (!mountedRef.current || speechTokenRef.current !== token) return;
      let url: string;
      try {
        url = URL.createObjectURL(blob);
      } catch {
        playOnDevice("Hosted voice could not be prepared.");
        return;
      }
      let audio: HTMLAudioElement;
      try {
        audio = new Audio(url);
      } catch {
        URL.revokeObjectURL(url);
        playOnDevice("Hosted voice could not be played.");
        return;
      }
      audioUrlRef.current = url;
      audioRef.current = audio;
      audio.onended = () => {
        if (audioRef.current !== audio || speechTokenRef.current !== token) return;
        clearAudio();
        complete();
      };
      audio.onerror = () => {
        if (audioRef.current !== audio || speechTokenRef.current !== token) return;
        clearAudio();
        playOnDevice("Hosted voice could not be played.");
      };
      if (mountedRef.current) setVoiceSource("elevenlabs");
      void audio.play().catch(() => {
        if (audioRef.current !== audio || speechTokenRef.current !== token) return;
        clearAudio();
        playOnDevice("Hosted voice could not be played.");
      });
    }).catch(() => {
      if (mountedRef.current && speechTokenRef.current === token) {
        playOnDevice("Hosted voice request failed.");
      }
    });
  }, [clearAudio]);

  const voiceInputAvailable = recognitionAvailable || recordingFallbackAvailable;
  return {
    recognitionAvailable,
    recordingFallbackAvailable,
    voiceInputAvailable,
    isRecordingFallback,
    speechAvailable,
    status,
    voiceSource,
    errorMessage,
    transcript,
    language,
    setLanguage,
    startListening,
    stopListening,
    finishListening,
    resetTranscript,
    speak,
    stopSpeaking,
  };
}
