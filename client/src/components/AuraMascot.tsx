import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AURI_MOOD_EXPRESSIONS, AURI_MOODS, AuriFace, type AuriExpression, type AuriMood } from "@/components/AuriFace";
import { useAuriVoice } from "@/hooks/useAuriVoice";

export type AuraMascotMood = AuriMood;

const expressionByMood = AURI_MOOD_EXPRESSIONS;
type ResponseLanguage = "auto" | "en" | "hi" | "hinglish";
type WidgetPosition = { left: number; top: number };
type WidgetDrag = { pointerId: number; startX: number; startY: number; originLeft: number; originTop: number; moved: boolean; lastPosition?: WidgetPosition };

function speechLocaleForResponse(language: ResponseLanguage, text: string): string {
  if (language === "en") return "en-IN";
  if (language === "hi" || language === "hinglish") return "hi-IN";
  const hasDevanagari = /[\u0900-\u097f]/u.test(text);
  const hasRomanHindi = /\b(?:hai|hain|hoon|hu|kya|kaise|kyun|kyu|mujhe|aap|tum|mera|meri|nahi|nahin|kar|karo|batao|bolo|accha|acha|haan|yaar)\b/iu.test(text);
  return hasDevanagari || hasRomanHindi ? "hi-IN" : "en-IN";
}

function moodFromUserText(message: string): AuriMood | null {
  const text = message.toLocaleLowerCase();
  if (/\b(?:furious|angry|pissed|hate this|so annoying|fed up)\b|\b(?:gussa|gussā|naraz|naraaz)\b|गुस्सा|नाराज़|नाराज|क्रोधित/iu.test(text)) return "angry";
  if (/\b(?:scared|afraid|terrified|worried|anxious|nervous|panic)\b|\b(?:darr|dar lag|chinta|pareshan)\b|डर|चिंता|चिन्तित|घबराहट|परेशान/iu.test(text)) return "scared";
  if (/\b(?:sad|disappointed|down today|feeling low|discouraged|missed my goal)\b|\b(?:dukhi|udaas|nirash|niraash)\b|दुखी|उदास|निराश/iu.test(text)) return "sad";
  if (/\b(?:haha+|lol|lmao|that's funny|joke|kidding)\b|हाहा|😂|😄/iu.test(text)) return "laughing";
  if (/\b(?:thank you|thanks|you are great|you're amazing|good job|love you)\b|\b(?:shukriya|dhanyavaad)\b|धन्यवाद|शुक्रिया|बहुत अच्छे/iu.test(text)) return "shy";
  if (/\b(?:i did it|i have done|finished my|completed my|made progress|got it done)\b|\b(?:kar liya|ho gaya mera)\b|कर लिया|पूरा कर लिया|हो गया मेरा/iu.test(text)) return "proud";
  if (/\b(?:unexpected|didn't expect|did not expect|surprised|whoa|wait what)\b|\b(?:arey|arre|sach mein)\b|अरे|सच में|अप्रत्याशित/iu.test(text)) return "surprised";
  if (/\b(?:hello|hi there|hey|namaste|namaskar|let's play|kidding|just joking)\b|नमस्ते|नमस्कार|चलो खेलें/iu.test(text)) return "playful";
  if (/\b(?:awesome|amazing|let's go|lets go|excited|can't wait|cant wait|yes!|great idea)\b|\b(?:bahut badhiya|maza aa gaya)\b|बहुत बढ़िया|वाह|मज़ा आ गया/iu.test(text)) return "excited";
  if (/[?？]/u.test(text) || /\b(?:what|how|why|when|where|which|could you explain|idea|i wonder|curious|kya|kaise|kyun|kyon|kab|kahan|samjha|बताओ|क्या|कैसे|क्यों|कब|कहाँ|कहां|समझाओ)\b/iu.test(text)) return "curious";
  return null;
}

function requestedWorkMood(message: string): AuriMood {
  if (/\b(?:search|find|look up|resources?|tutorial|videos?|articles?)\b|खोज|ढूंढ|ढूँढ|सर्च|वीडियो|ट्यूटोरियल/iu.test(message)) return "searching";
  if (/\b(?:update|edit|change|record|mark|complete|finish|create|generate|prepare|schedule|plan|quiz|assessment)\b|अपडेट|बदल|दर्ज|पूरा|कर लिया|बनाओ|तैयार|शेड्यूल|क्विज़/iu.test(message)) return "working";
  return "thinking";
}

function resultMood(message: string, action: { name?: string; status?: string } | null | undefined): AuriMood {
  const cue = moodFromUserText(message);
  if (action?.status === "blocked") return "suspicious";
  if (action?.status === "failed") return "confused";
  if (action?.status === "proposed") return "working";
  if (action?.status === "completed") {
    if (action.name === "search_resources") return "searching";
    if (action.name === "set_task_progress" && /\bcompleted\b|पूरा|हो गया|कर लिया/iu.test(message)) return "celebrate";
    if (action.name === "create_learning_check" || action.name === "update_goal_fields") return "working";
  }
  if (cue) return cue;
  if (action?.status === "completed" && action.name === "set_task_progress") return "proud";
  return "happy";
}

export function announceMascot(mood: AuraMascotMood) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AuraMascotMood>("aurax:mascot", { detail: mood }));
  }
}

function pageTip(pathname: string, authenticated: boolean) {
  if (!authenticated) return "Welcome to AURA-X. Sign in or create an account, then tell me the goal you want to work on.";
  if (pathname === "/settings") return "Your profile and preferences are right here.";
  if (pathname === "/goals") return "Choose one meaningful goal. We’ll turn it into small steps.";
  if (pathname.startsWith("/goals/")) return "One small action today keeps your roadmap moving.";
  return "Tell me what you want to do with your goal.";
}

function sectionTip(section: string) {
  const tips: Record<string, string> = {
    overview: "Your dashboard brings today’s progress and next action together.",
    roadmap: "I can explain a milestone or suggest a schedule change for you to review.",
    daily: "Need a smaller first step? Tell me what is making today’s task hard.",
    resources: "Search this goal for related books, papers, videos, courses and practice; check each source before relying on it.",
    assessment: "A learning check can reveal gaps; a quiz score is not proof of real-world skill.",
    coach: "Ask me about this goal in English, Hindi or Hinglish. I can use its saved context and search public sources.",
    settings: "Your profile and preferences are right here.",
    goals: "Choose one meaningful goal. I can turn it into small steps.",
  };
  return tips[section] ?? "Tell me what you want to do with your goal.";
}

function readableError(error: unknown) {
  if (error instanceof Error) return error.message.replace(/^\[.*?\]\s*/, "");
  return "Auri couldn't complete that message. Please try again.";
}

export default function AuraMascot() {
  const [pathname] = useLocation();
  const [mood, setMood] = useState<AuraMascotMood>("waking");
  const expression: AuriExpression = expressionByMood[mood];
  const [chatOpen, setChatOpen] = useState(false);
  const [widgetPosition, setWidgetPosition] = useState<WidgetPosition | null>(null);
  const [chatPanelPosition, setChatPanelPosition] = useState<WidgetPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [tip, setTip] = useState(() => pageTip(pathname, false));
  const [feedbackBubble, setFeedbackBubble] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [voiceRepliesEnabled, setVoiceRepliesEnabled] = useState(true);
  const [responseLanguage, setResponseLanguage] = useState<ResponseLanguage>("auto");
  const [voiceSessionActive, setVoiceSessionActive] = useState(false);
  const [voicePaused, setVoicePaused] = useState(false);
  const voice = useAuriVoice();
  const userSelectedGoal = useRef(false);
  const moodRef = useRef<AuraMascotMood>(mood);
  const voiceSessionRef = useRef(false);
  const chatOpenRef = useRef(chatOpen);
  const voicePausedRef = useRef(false);
  const selectedGoalRef = useRef<number | null>(selectedGoalId);
  const responseLanguageRef = useRef<ResponseLanguage>(responseLanguage);
  const feedbackTimerRef = useRef<number | undefined>(undefined);
  const finalTurnInFlightRef = useRef(false);
  const gazeRef = useRef<HTMLElement | null>(null);
  const chatPanelRef = useRef<HTMLElement | null>(null);
  const widgetDragRef = useRef<WidgetDrag | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, { enabled: chatOpen, retry: 1 });
  const goalsQuery = trpc.goals.list.useQuery(undefined, {
    enabled: chatOpen && !!me.data,
    retry: 1,
  });
  const goals = goalsQuery.data ?? [];
  const coachHistory = trpc.learning.coach.history.useQuery(
    { goalId: selectedGoalId ?? 1 },
    { enabled: chatOpen && !!me.data && selectedGoalId !== null, retry: 1 }
  );
  const agentChat = trpc.learning.agent.chat.useMutation();
  const hostedVoiceStatus = trpc.auriVoice.status.useQuery(undefined, { enabled: chatOpen && !!me.data, retry: 0 });
  const hostedSpeak = trpc.auriVoice.speak.useMutation();
  const transcribeVoice = trpc.auriVoice.transcribe.useMutation();
  const voiceInputReady = voice.recognitionAvailable || (voice.recordingFallbackAvailable && hostedVoiceStatus.data?.transcriptionAvailable === true);
  const messages = coachHistory.data ?? [];
  const lastAssistantMessage = [...messages].reverse().find(item => item.role === "assistant")?.content ?? "";
  const selectedGoalTitle = goals.find(goal => goal.id === selectedGoalId)?.title;

  function showFeedback(message: string) {
    setFeedbackBubble(message);
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedbackBubble(""), 4_200);
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem("aura-auri-position");
      const parsed = saved ? JSON.parse(saved) as WidgetPosition : null;
      if (parsed && Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) {
        setWidgetPosition({ left: Math.max(8, Math.min(window.innerWidth - 70, parsed.left)), top: Math.max(8, Math.min(window.innerHeight - 88, parsed.top)) });
      }
    } catch { /* keep the default corner if local storage is unavailable */ }
  }, []);

  useEffect(() => {
    const keepVisible = () => {
      const widget = gazeRef.current;
      if (!widget || !widgetPosition) return;
      const bounds = widget.getBoundingClientRect();
      setWidgetPosition({
        left: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, widgetPosition.left)),
        top: Math.max(8, Math.min(window.innerHeight - bounds.height - 8, widgetPosition.top)),
      });
    };
    window.addEventListener("resize", keepVisible);
    return () => window.removeEventListener("resize", keepVisible);
  }, [widgetPosition]);

  useLayoutEffect(() => {
    if (!chatOpen) {
      setChatPanelPosition(null);
      return;
    }
    const placePanel = () => {
      const panel = chatPanelRef.current;
      const widget = gazeRef.current;
      if (!panel || !widget) return;
      const panelBounds = panel.getBoundingClientRect();
      const widgetBounds = widget.getBoundingClientRect();
      const margin = 10;
      const gap = 12;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const openRight = widgetBounds.left + widgetBounds.width / 2 < viewportWidth / 2;
      const openBelow = widgetBounds.top + widgetBounds.height / 2 < viewportHeight / 2;
      const preferredLeft = openRight ? widgetBounds.right + gap : widgetBounds.left - panelBounds.width - gap;
      const preferredTop = openBelow ? widgetBounds.bottom + gap : widgetBounds.top - panelBounds.height - gap;
      const left = Math.round(Math.max(margin, Math.min(viewportWidth - panelBounds.width - margin, preferredLeft)));
      const top = Math.round(Math.max(margin, Math.min(viewportHeight - panelBounds.height - margin, preferredTop)));
      setChatPanelPosition(current => current?.left === left && current.top === top ? current : { left, top });
    };
    placePanel();
    window.addEventListener("resize", placePanel);
    window.addEventListener("orientationchange", placePanel);
    window.visualViewport?.addEventListener("resize", placePanel);
    return () => {
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("orientationchange", placePanel);
      window.visualViewport?.removeEventListener("resize", placePanel);
    };
  }, [chatOpen, widgetPosition, messages.length, agentChat.isPending, voice.status]);

  function beginWidgetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !gazeRef.current) return;
    event.preventDefault();
    const bounds = gazeRef.current.getBoundingClientRect();
    widgetDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originLeft: bounds.left, originTop: bounds.top, moved: false };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveWidgetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = widgetDragRef.current;
    const widget = gazeRef.current;
    if (!drag || !widget || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    const bounds = widget.getBoundingClientRect();
    const next = {
      left: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, drag.originLeft + dx)),
      top: Math.max(8, Math.min(window.innerHeight - bounds.height - 8, drag.originTop + dy)),
    };
    drag.lastPosition = next;
    setWidgetPosition(next);
  }

  function endWidgetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = widgetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    widgetDragRef.current = null;
    setIsDragging(false);
    if (drag.moved && drag.lastPosition) {
      try { localStorage.setItem("aura-auri-position", JSON.stringify(drag.lastPosition)); } catch { /* movement still works for this session */ }
    }
  }

  function moveWidgetByKey(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const delta = event.shiftKey ? 40 : 16;
    const movement = event.key === "ArrowLeft" ? [-delta, 0] : event.key === "ArrowRight" ? [delta, 0] : event.key === "ArrowUp" ? [0, -delta] : event.key === "ArrowDown" ? [0, delta] : null;
    if (!movement || !gazeRef.current) return;
    event.preventDefault();
    const bounds = gazeRef.current.getBoundingClientRect();
    const next = {
      left: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, (widgetPosition?.left ?? bounds.left) + movement[0]!)),
      top: Math.max(8, Math.min(window.innerHeight - bounds.height - 8, (widgetPosition?.top ?? bounds.top) + movement[1]!)),
    };
    setWidgetPosition(next);
    try { localStorage.setItem("aura-auri-position", JSON.stringify(next)); } catch { /* movement still works for this session */ }
  }

  function stopVoiceSession() {
    voiceSessionRef.current = false;
    voicePausedRef.current = false;
    finalTurnInFlightRef.current = false;
    setVoiceSessionActive(false);
    setVoicePaused(false);
    voice.stopListening();
    voice.stopSpeaking();
  }

  function startVoiceListening() {
    if (!voiceSessionRef.current || voicePausedRef.current || !chatOpen || !voiceInputReady) return;
    voice.resetTranscript();
    voice.startListening(text => {
      const finalText = text.trim();
      if (!finalText || !voiceSessionRef.current || voicePausedRef.current || finalTurnInFlightRef.current) return;
      finalTurnInFlightRef.current = true;
      setChatInput(finalText);
      voice.stopListening();
      void sendChatMessage(finalText, true);
    }, requestHostedTranscription);
  }

  function startDictation() {
    if (!voiceInputReady || voiceSessionRef.current) return;
    voice.resetTranscript();
    voice.startListening(text => {
      const finalText = text.trim();
      if (!finalText) return;
      setChatInput(finalText);
      voice.stopListening();
    }, requestHostedTranscription);
  }

  function startVoiceConversation() {
    if (!me.data) {
      setChatError("Sign in to start a voice conversation with Auri.");
      return;
    }
    if (!selectedGoalRef.current) {
      setChatError("Create or select a goal before starting a voice conversation.");
      return;
    }
    if (!voiceInputReady) {
      setChatError("Voice input is not available here yet. You can type to Auri or allow microphone access in a secure browser.");
      return;
    }
    setChatError("");
    voiceSessionRef.current = true;
    voicePausedRef.current = false;
    setVoiceSessionActive(true);
    setVoicePaused(false);
    startVoiceListening();
  }

  function pauseVoiceConversation() {
    voicePausedRef.current = true;
    setVoicePaused(true);
    voice.stopListening();
    voice.stopSpeaking();
  }

  function resumeVoiceConversation() {
    if (!voiceSessionRef.current || !voicePausedRef.current) return;
    voicePausedRef.current = false;
    setVoicePaused(false);
    startVoiceListening();
  }

  function switchToText() {
    stopVoiceSession();
    showFeedback("Voice conversation stopped. You can continue by typing.");
  }

  async function requestHostedSpeech(text: string, language: "hi" | "en") {
    const response = await hostedSpeak.mutateAsync({ text: text.slice(0, 1_800), language });
    const bytes = Uint8Array.from(atob(response.audioBase64), character => character.charCodeAt(0));
    return new Blob([bytes.buffer], { type: response.contentType });
  }

  async function requestHostedTranscription(audio: Blob) {
    const contentType = audio.type.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"].includes(contentType)) {
      throw new Error("This browser produced an unsupported recording format. Try text chat instead.");
    }
    const bytes = new Uint8Array(await audio.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    }
    const result = await transcribeVoice.mutateAsync({ audioBase64: btoa(binary), contentType: contentType as "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/mpeg" | "audio/wav" });
    return result.transcript;
  }

  useEffect(() => {
    const onAuthState = (event: Event) => setAuthenticated(Boolean((event as CustomEvent<{ authenticated?: boolean }>).detail?.authenticated));
    window.addEventListener("aurax:auth-state", onAuthState);
    return () => window.removeEventListener("aurax:auth-state", onAuthState);
  }, []);

  useEffect(() => {
    setTip(pageTip(pathname, authenticated));
    const pageName = !authenticated ? "Welcome" : pathname === "/settings" ? "Settings" : pathname === "/goals" || pathname.startsWith("/goals/") ? "Goals" : pathname === "/" ? "Dashboard" : "Page";
    showFeedback(authenticated ? `${pageName} opened.` : "Welcome to AURA-X. Sign in or create an account to begin.");
    userSelectedGoal.current = false;
    announceMascot("waking");
    const wakeTimer = window.setTimeout(() => announceMascot("idle"), 850);
    return () => window.clearTimeout(wakeTimer);
  }, [pathname, authenticated]);

  useEffect(() => { moodRef.current = mood; }, [mood]);
  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);
  useEffect(() => { selectedGoalRef.current = selectedGoalId; }, [selectedGoalId]);
  useEffect(() => { responseLanguageRef.current = responseLanguage; }, [responseLanguage]);
  useEffect(() => () => {
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  useEffect(() => {
    if (voice.status === "listening") announceMascot("listening");
    else if (voice.status === "speaking") announceMascot("working");
    else if (voice.status === "error") announceMascot("confused");
    else if (moodRef.current === "listening" || moodRef.current === "working") announceMascot("idle");
  }, [voice.status]);

  useEffect(() => {
    if (voice.status !== "error" || !voiceSessionRef.current || voicePausedRef.current) return;
    voicePausedRef.current = true;
    setVoicePaused(true);
    voice.stopListening();
  }, [voice.status]);

  useEffect(() => {
    if (voice.status === "listening" && voice.transcript.trim()) setChatInput(voice.transcript);
  }, [voice.status, voice.transcript]);

  useEffect(() => {
    if (chatOpen) return;
    if (voiceSessionRef.current || voicePausedRef.current || voice.status !== "idle") stopVoiceSession();
  }, [chatOpen, voice.status]);

  useEffect(() => {
    if (!chatOpen || goals.length === 0) return;
    const routeGoalId = Number(pathname.match(/^\/goals\/(\d+)/)?.[1]);
    const routeGoal = goals.find(goal => goal.id === routeGoalId);
    if (routeGoal && !userSelectedGoal.current) {
      setSelectedGoalId(routeGoal.id);
      return;
    }
    if (selectedGoalId !== null && goals.some(goal => goal.id === selectedGoalId)) return;
    const fallback = goals.find(goal => goal.status === "active") ?? goals[0];
    if (fallback) setSelectedGoalId(fallback.id);
  }, [chatOpen, goals, pathname, selectedGoalId]);

  useEffect(() => {
    const node = messageListRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, chatOpen, agentChat.isPending]);

  useEffect(() => {
    let inactivityTimers: number[] = [];
    let reactionTimer: number;
    let wakeTimer: number;
    let activeMood: AuraMascotMood | null = null;
    let activePriority = 0;
    let lastActivity = 0;
    let lastScrollReaction = 0;
    let lastScrollY = window.scrollY;
    const persistent = new Set<AuraMascotMood>(["listening", "thinking", "searching", "working"]);
    const priority = (value: AuraMascotMood) => value === "listening" ? 100 : persistent.has(value) ? 90 : ["confused", "suspicious"].includes(value) ? 80 : ["angry", "scared", "sad", "surprised", "proud", "celebrate"].includes(value) ? 70 : ["curious", "excited", "playful", "laughing", "shy", "happy"].includes(value) ? 60 : value === "waking" ? 40 : 0;
    const clearInactivity = () => { inactivityTimers.forEach(clearTimeout); inactivityTimers = []; };
    const setCurrentMood = (value: AuraMascotMood) => { moodRef.current = value; setMood(value); };
    const scheduleInactivity = () => {
      clearInactivity();
      [30_000, 75_000, 195_000].forEach((delay, index) => {
      inactivityTimers.push(window.setTimeout(() => {
          if (activePriority > 0) return;
          const nextMood: AuraMascotMood = index === 0 ? "drowsy" : index === 1 ? "bored" : "sleeping";
          setCurrentMood(nextMood);
        }, delay));
      });
    };
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivity < 800) return;
      lastActivity = now;
      if (activePriority > 0) return;
      if (["sleeping", "drowsy", "bored"].includes(moodRef.current)) {
        clearTimeout(wakeTimer);
        activeMood = "waking";
        activePriority = priority("waking");
        setCurrentMood("waking");
        wakeTimer = window.setTimeout(() => {
          if (activeMood === "waking") { activeMood = null; activePriority = 0; setCurrentMood("idle"); }
        }, 850);
      }
      scheduleInactivity();
    };
    const onScrollDirection = () => {
      const currentY = window.scrollY;
      const direction = currentY >= lastScrollY ? "down" : "up";
      lastScrollY = currentY;
      const now = Date.now();
      if (now - lastScrollReaction < 1_400 || activePriority > 0 || persistent.has(moodRef.current)) return;
      lastScrollReaction = now;
      const nextMood: AuraMascotMood = direction === "down" ? "curious" : "happy";
      clearTimeout(reactionTimer);
      activeMood = nextMood;
      activePriority = priority(nextMood);
      setCurrentMood(nextMood);
      reactionTimer = window.setTimeout(() => {
        if (activeMood === nextMood) { activeMood = null; activePriority = 0; setCurrentMood("idle"); }
      }, 1_100);
    };
    const onAppEvent = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (typeof next !== "string" || !AURI_MOODS.includes(next as AuraMascotMood)) return;
      const nextMood = next as AuraMascotMood;
      if (nextMood === "waking" && activePriority > priority("waking")) return;
      clearTimeout(reactionTimer);
      if (nextMood === "idle") {
        activeMood = null;
        activePriority = 0;
        setCurrentMood("idle");
        return;
      }
      activeMood = nextMood;
      activePriority = priority(nextMood);
      setCurrentMood(nextMood);
      if (!persistent.has(nextMood)) {
        reactionTimer = window.setTimeout(() => {
          if (activeMood === nextMood) { activeMood = null; activePriority = 0; setCurrentMood("idle"); }
        }, nextMood === "celebrate" ? 2_400 : 1_900);
      }
      scheduleInactivity();
    };
    const onGaze = (event: Event) => {
      const pointer = event as PointerEvent;
      if (pointer.pointerType !== "mouse" || !gazeRef.current) return;
      const bounds = gazeRef.current.getBoundingClientRect();
      const x = Math.max(-1.6, Math.min(1.6, (pointer.clientX - (bounds.left + bounds.width / 2)) / 65));
      const y = Math.max(-1.1, Math.min(1.1, (pointer.clientY - (bounds.top + bounds.height / 2)) / 80));
      gazeRef.current.style.setProperty("--auri-gaze-x", `${x.toFixed(2)}px`);
      gazeRef.current.style.setProperty("--auri-gaze-y", `${y.toFixed(2)}px`);
    };
    const onPointerOver = (event: Event) => {
      const pointer = event as PointerEvent;
      const element = pointer.target instanceof Element ? pointer.target.closest<HTMLElement>("button.btn-primary, .btn-primary") : null;
      if (!element || element.closest(".aura-mascot-widget")) return;
      if (pointer.relatedTarget instanceof Node && element.contains(pointer.relatedTarget)) return;
      announceMascot("excited");
    };
    const onFocusTarget = (event: Event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || target.closest(".aura-mascot-widget")) return;
      const widget = gazeRef.current;
      if (!widget) return;
      const focused = target.getBoundingClientRect();
      const bounds = widget.getBoundingClientRect();
      const x = Math.max(-1.6, Math.min(1.6, (focused.left + focused.width / 2 - bounds.left - bounds.width / 2) / 65));
      const y = Math.max(-1.1, Math.min(1.1, (focused.top + focused.height / 2 - bounds.top - bounds.height / 2) / 80));
      widget.style.setProperty("--auri-gaze-x", `${x.toFixed(2)}px`);
      widget.style.setProperty("--auri-gaze-y", `${y.toFixed(2)}px`);
      announceMascot("curious");
    };
    const onFeedback = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const message = typeof detail === "string" ? detail : typeof detail === "object" && detail !== null && "message" in detail && typeof detail.message === "string" ? detail.message : "";
      if (message.trim()) showFeedback(message.trim().slice(0, 240));
    };
    const onSection = (event: Event) => {
      const section = (event as CustomEvent<unknown>).detail;
      if (typeof section !== "string") return;
      const message = sectionTip(section);
      setTip(message);
      showFeedback(message);
    };
    const onInvalid = (event: Event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const message = target instanceof HTMLInputElement && target.type === "email"
        ? "Could you check your email address? The field will show what needs fixing."
        : "Could you check this field? I’ll stay with you while you fix it.";
      showFeedback(message);
      announceMascot("confused");
    };
    scheduleInactivity();
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("pointermove", onActivity, { passive: true });
    window.addEventListener("pointerover", onPointerOver, { passive: true });
    window.addEventListener("focusin", onFocusTarget);
    window.addEventListener("invalid", onInvalid, true);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("scroll", onScrollDirection, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });
    window.addEventListener("aurax:mascot", onAppEvent);
    window.addEventListener("aurax:feedback", onFeedback);
    window.addEventListener("aurax:section", onSection);
    window.addEventListener("pointermove", onGaze, { passive: true });
    return () => {
      clearInactivity(); clearTimeout(reactionTimer); clearTimeout(wakeTimer);
      window.removeEventListener("pointerdown", onActivity); window.removeEventListener("pointermove", onActivity);
      window.removeEventListener("pointerover", onPointerOver); window.removeEventListener("focusin", onFocusTarget);
      window.removeEventListener("invalid", onInvalid, true);
      window.removeEventListener("keydown", onActivity); window.removeEventListener("scroll", onActivity);
      window.removeEventListener("scroll", onScrollDirection);
      window.removeEventListener("touchstart", onActivity); window.removeEventListener("aurax:mascot", onAppEvent);
      window.removeEventListener("aurax:feedback", onFeedback); window.removeEventListener("aurax:section", onSection);
      window.removeEventListener("pointermove", onGaze);
    };
  }, []);

  async function sendChatMessage(rawMessage: string, voiceTurn = false) {
    const message = rawMessage.trim();
    const goalId = selectedGoalRef.current;
    if (!message || agentChat.isPending) return;
    if (!me.data) {
      setChatError("Sign in to let Auri work with your saved goals.");
      return;
    }
    if (!goalId) {
      setChatError("Create a goal first, then select it here.");
      return;
    }
    setChatError("");
    voice.stopListening();
    voice.stopSpeaking();
    const userCue = moodFromUserText(message);
    announceMascot(userCue && ["angry", "scared", "sad", "laughing", "shy", "proud", "surprised", "playful", "excited"].includes(userCue) ? userCue : requestedWorkMood(message));
    try {
      const result = await agentChat.mutateAsync({ goalId, message, responseLanguage: responseLanguageRef.current });
      await Promise.all([
        utils.learning.coach.history.invalidate({ goalId }),
        utils.goals.list.invalidate(),
        utils.analytics.invalidate(),
        utils.learning.assessments.list.invalidate({ goalId }),
      ]);
      announceMascot(resultMood(message, result.action));
      if (result.action) showFeedback(result.reply.slice(0, 150));
      voice.setLanguage(speechLocaleForResponse(responseLanguageRef.current, `${message}\n${result.reply}`));
      const shouldSpeak = voiceTurn
        ? voiceSessionRef.current && !voicePausedRef.current
        : voiceRepliesEnabled;
      if (shouldSpeak && result.reply) {
        const onPlaybackComplete = voiceTurn
          ? () => {
              if (voiceSessionRef.current && !voicePausedRef.current && chatOpen) startVoiceListening();
            }
          : undefined;
        voice.speak(result.reply, hostedVoiceStatus.data?.available ? requestHostedSpeech : undefined, onPlaybackComplete);
      } else if (voiceTurn && voiceSessionRef.current && !voicePausedRef.current) {
        // There is no playback to wait for; leave the session stopped for an explicit Resume.
        voicePausedRef.current = true;
        setVoicePaused(true);
      }
    } catch (error) {
      setChatInput(message);
      setChatError(readableError(error));
      announceMascot("confused");
      await utils.learning.coach.history.invalidate({ goalId });
    } finally {
      finalTurnInFlightRef.current = false;
    }
  }

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message) return;
    await sendChatMessage(message, voiceSessionRef.current && !voicePausedRef.current);
  }

  function openExistingFlow() {
    window.dispatchEvent(new Event("aurax:open-coach"));
  }

  const label = "Auri, your AURA-X AI goal agent. Activate to open chat.";
  const visibleMessages = messages.slice(-10);

  return (
    <aside ref={gazeRef} className="aura-mascot-widget" data-mood={mood} data-dragging={isDragging ? "true" : undefined} data-chat-placement={widgetPosition && widgetPosition.left < window.innerWidth / 2 ? "right" : "left"} data-chat-vertical={widgetPosition && widgetPosition.top < window.innerHeight / 2 ? "below" : "above"} style={widgetPosition ? { left: `${widgetPosition.left}px`, top: `${widgetPosition.top}px`, right: "auto", bottom: "auto" } : undefined} aria-label="AURA-X assistant" onFocusCapture={event => {
      announceMascot("curious");
      const target = event.target instanceof HTMLElement ? event.target : null;
      const mascot = event.currentTarget.querySelector<HTMLElement>(".aura-mascot-button");
      if (!target || !mascot) return;
      const focused = target.getBoundingClientRect();
      const face = mascot.getBoundingClientRect();
      const x = Math.max(-1.6, Math.min(1.6, (focused.left + focused.width / 2 - face.left - face.width / 2) / 65));
      const y = Math.max(-1.1, Math.min(1.1, (focused.top + focused.height / 2 - face.top - face.height / 2) / 80));
      gazeRef.current?.style.setProperty("--auri-gaze-x", `${x.toFixed(2)}px`);
      gazeRef.current?.style.setProperty("--auri-gaze-y", `${y.toFixed(2)}px`);
    }}>
      {chatOpen && (
        <section ref={chatPanelRef} className="aura-mascot-chat" role="dialog" aria-label="Chat with Auri" style={chatPanelPosition ? { position: "fixed", left: `${chatPanelPosition.left}px`, top: `${chatPanelPosition.top}px`, right: "auto", bottom: "auto" } : undefined}>
          <header className="aura-mascot-chat-header">
            <span className="aura-mascot-chat-avatar" aria-hidden="true"><AuriFace mood={mood} expression={expression} size="compact" speaking={voice.status === "speaking"} /></span>
            <span className="aura-mascot-chat-title"><strong>Auri</strong><small>AI goal agent</small></span>
            <button type="button" className="aura-mascot-chat-close" onClick={() => { stopVoiceSession(); setChatOpen(false); }} aria-label="Close Auri chat">×</button>
          </header>
          <div className="auri-companion-stage">
            <AuriFace mood={mood} expression={expression} size="large" speaking={voice.status === "speaking"} />
            <div className="auri-companion-copy">
              <span className="auri-companion-eyebrow">AURA-X · AURI</span>
              <strong>{mood.charAt(0).toUpperCase() + mood.slice(1)}</strong>
              <span>{selectedGoalTitle ? `Working with ${selectedGoalTitle}` : "Ready when you are."}</span>
            </div>
          </div>
          <div className="aura-mascot-chat-context">
            <p>{tip}</p>
            {!!me.data && goals.length > 0 && (
              <label className="aura-agent-goal-label">
                Working on
                <select
                  value={selectedGoalId ?? ""}
                  onChange={event => {
                    userSelectedGoal.current = true;
                    const nextGoalId = Number(event.target.value) || null;
                    selectedGoalRef.current = nextGoalId;
                    setSelectedGoalId(nextGoalId);
                    setChatError("");
                  }}
                  aria-label="Choose a goal for Auri"
                >
                  {goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                </select>
              </label>
            )}
          </div>
          {!me.isLoading && !me.data ? (
            <div className="aura-agent-empty">
              <p>{me.error ? "I couldn't check your sign-in just now." : "Sign in so I can work only with your saved goals."}</p>
              <button type="button" className="aura-mascot-coach-link" onClick={openExistingFlow}>
                {me.error ? "Try the sign-in flow" : "Open sign in"}
              </button>
            </div>
          ) : me.isLoading ? (
            <div className="aura-agent-empty" role="status">Connecting to your workspace…</div>
          ) : goalsQuery.isLoading ? (
            <div className="aura-agent-empty" role="status">Loading your goals…</div>
          ) : goalsQuery.error ? (
            <div className="aura-agent-empty" role="alert">{readableError(goalsQuery.error)}<button type="button" className="aura-mascot-coach-link" onClick={() => void goalsQuery.refetch()}>Try again</button></div>
          ) : goals.length === 0 ? (
            <div className="aura-agent-empty">
              <p>Create a goal first. Then Auri can answer in its context and take supported actions for it.</p>
              <button type="button" className="aura-mascot-coach-link" onClick={openExistingFlow}>Create a goal</button>
            </div>
          ) : (
            <>
              <div className="aura-agent-messages" ref={messageListRef} aria-live="polite" aria-relevant="additions text">
                {coachHistory.isLoading ? (
                  <p className="aura-agent-empty" role="status">Loading this goal's conversation…</p>
                ) : coachHistory.error ? (
                  <p className="aura-agent-empty" role="alert">{readableError(coachHistory.error)}</p>
                ) : visibleMessages.length === 0 ? (
                  <div className="aura-agent-message assistant"><strong>Auri</strong><p>Tell me what you want to do. I can answer, search and save real resources, create a learning check, update this goal's details, record a task status you explicitly report, or prepare a schedule proposal for your review.</p></div>
                ) : visibleMessages.map((item, index) => (
                  <div className={`aura-agent-message ${item.role}`} key={`${item.id}-${index}`}>
                    <strong>{item.role === "user" ? "You" : "Auri"}</strong>
                    <p>{item.content}</p>
                  </div>
                ))}
                {agentChat.isPending && <p className="aura-agent-thinking" role="status">Auri is thinking…</p>}
              </div>
              <form className="aura-agent-compose" onSubmit={submitChat}>
                <div className="auri-voice-tools">
                  <div className="auri-voice-controls">
                    {!voiceSessionActive ? (
                      <button type="button" className="auri-voice-button" onClick={startVoiceConversation} disabled={!voiceInputReady || agentChat.isPending}>
                        Start voice conversation
                      </button>
                    ) : voicePaused ? (
                      <button type="button" className="auri-voice-button" onClick={resumeVoiceConversation} disabled={!voiceInputReady || agentChat.isPending}>
                        Resume voice conversation
                      </button>
                    ) : (
                      <button type="button" className="auri-voice-button" onClick={pauseVoiceConversation} aria-pressed="true">
                        Pause voice conversation
                      </button>
                    )}
                    <button type="button" className="auri-voice-button" onClick={() => { stopVoiceSession(); showFeedback("Voice conversation stopped."); }} disabled={!voiceSessionActive && voice.status === "idle"}>
                      Stop voice
                    </button>
                    <button type="button" className="auri-voice-button" onClick={() => { stopVoiceSession(); showFeedback("Voice playback and listening interrupted."); }} disabled={voice.status !== "speaking" && voice.status !== "listening" && !voiceSessionActive}>
                      Interrupt
                    </button>
                    <button type="button" className="auri-voice-button" onClick={switchToText}>
                      Switch to text
                    </button>
                    <button type="button" className="auri-voice-button" onClick={startDictation} disabled={!voiceInputReady || voiceSessionActive || agentChat.isPending}>
                      Dictate for text
                    </button>
                    {voice.isRecordingFallback && <button type="button" className="auri-voice-button" onClick={voice.finishListening}>
                      {voiceSessionActive ? "Finish & send voice turn" : "Finish recording"}
                    </button>}
                    <button type="button" className="auri-voice-button" onClick={() => setVoiceRepliesEnabled(enabled => !enabled)} disabled={!voice.speechAvailable && !hostedVoiceStatus.data?.available} aria-pressed={voiceRepliesEnabled}>
                      Voice replies {voiceRepliesEnabled ? "on" : "off"}
                    </button>
                    <button type="button" className="auri-voice-button" onClick={() => {
                      if (voice.status === "speaking") { voice.stopSpeaking(); return; }
                      const sample = responseLanguage === "hi"
                        ? "नमस्ते, मैं Auri हूँ। मैं आपके goal को छोटे, भरोसेमंद steps में बदलने में मदद करूँगी।"
                        : responseLanguage === "hinglish"
                          ? "Namaste! Main Auri hoon. Aapke goal ko clear plan aur daily steps mein badalte hain."
                          : "Hi, I'm Auri. Tell me your goal, and I'll help you turn it into a clear, practical plan.";
                      voice.setLanguage(speechLocaleForResponse(responseLanguage, sample));
                      voice.speak(sample, hostedVoiceStatus.data?.available ? requestHostedSpeech : undefined);
                    }} disabled={!voice.speechAvailable && !hostedVoiceStatus.data?.available}>
                      {voice.status === "speaking" ? "Stop speaking" : "Test Auri voice"}
                    </button>
                    <button type="button" className="auri-voice-button" onClick={() => voice.status === "speaking" ? voice.stopSpeaking() : voice.speak(lastAssistantMessage, hostedVoiceStatus.data?.available ? requestHostedSpeech : undefined)} disabled={(!voice.speechAvailable && !hostedVoiceStatus.data?.available) || !lastAssistantMessage || voiceSessionActive}>
                      Read latest reply
                    </button>
                    <label className="auri-voice-language">
                      Reply language
                      <select aria-label="Auri reply language" value={responseLanguage} onChange={event => {
                        const nextLanguage = event.target.value as ResponseLanguage;
                        responseLanguageRef.current = nextLanguage;
                        setResponseLanguage(nextLanguage);
                        voice.setLanguage(nextLanguage === "en" ? "en-IN" : nextLanguage === "hi" || nextLanguage === "hinglish" ? "hi-IN" : "en-IN");
                      }}>
                        <option value="auto">Auto — follow me</option>
                        <option value="en">English</option>
                        <option value="hi">Hindi</option>
                        <option value="hinglish">Hinglish</option>
                      </select>
                    </label>
                  </div>
                  {!voice.recognitionAvailable && !voice.recordingFallbackAvailable && <p className="auri-voice-note">This browser has no microphone speech input. Text chat is available.</p>}
                  {!voice.recognitionAvailable && voice.recordingFallbackAvailable && !hostedVoiceStatus.data?.transcriptionAvailable && <p className="auri-voice-note" role="status">Secure voice transcription is unavailable right now; use text chat or enable browser dictation.</p>}
                  {voice.status === "listening" && <p className="auri-voice-note" role="status">{voice.isRecordingFallback ? "Recording after your microphone permission. Tap Finish to transcribe and send this turn." : "Listening. Your final transcript is sent automatically during a voice conversation."}</p>}
                  {voice.status === "transcribing" && <p className="auri-voice-note" role="status">Transcribing your voice securely. The recording is not saved.</p>}
                  {voice.status === "speaking" && <p className="auri-voice-note" role="status">Auri is speaking. Listening will resume after playback if the session is active and unpaused.</p>}
                  {voiceSessionActive && voicePaused && <p className="auri-voice-note" role="status">Voice conversation paused. Resume when you are ready.</p>}
                  {voice.transcript.trim() && <p className="auri-voice-transcript" aria-live="polite"><strong>Transcript</strong><span>{voice.transcript}</span></p>}
                  {voice.errorMessage && <p className="aura-agent-error" role="alert">{voice.errorMessage}</p>}
                  <p className="auri-voice-note">Speak using your device microphone; if browser dictation is unavailable, tap Finish after speaking to send a short clip for protected transcription. The audio is not stored. Auri speaks its actual goal-aware reply using {voice.voiceSource === "elevenlabs" ? "the configured hosted voice" : "a locale-matched voice installed on your device"}. {hostedVoiceStatus.data?.available ? "Hosted voice usage depends on the configured account plan." : "Optional hosted voice is not configured; device speech is used when available."}</p>
                </div>
                <label className="sr-only" htmlFor="auri-agent-message">Message Auri</label>
                <textarea
                  id="auri-agent-message"
                  value={chatInput}
                  onChange={event => setChatInput(event.target.value)}
                  placeholder="Ask Auri about this goal…"
                  maxLength={2000}
                  rows={2}
                  disabled={agentChat.isPending || coachHistory.isLoading}
                />
                {chatError && <p className="aura-agent-error" role="alert">{chatError}</p>}
                <button type="submit" className="aura-agent-send" disabled={!chatInput.trim() || agentChat.isPending || coachHistory.isLoading}>
                  {agentChat.isPending ? "Working…" : "Send"}
                </button>
              </form>
            </>
          )}
          <p className="aura-agent-footnote">Auri acts only on the selected goal. Schedule proposals need your approval. AI use consumes project credits.</p>
      </section>
      )}
      {feedbackBubble && <div className="aura-mascot-feedback" role="status" aria-live="polite" aria-atomic="true">{feedbackBubble}</div>}
      <button
        type="button"
        className="aura-mascot-drag-handle"
        aria-label="Move Auri. Drag this handle, or focus it and use the arrow keys."
        title="Move Auri — drag or use arrow keys"
        onPointerDown={beginWidgetDrag}
        onPointerMove={moveWidgetDrag}
        onPointerUp={endWidgetDrag}
        onPointerCancel={endWidgetDrag}
        onKeyDown={moveWidgetByKey}
      ><span aria-hidden="true">⠿</span><span>Move</span></button>
      <button
        type="button"
        className="aura-mascot-button"
        aria-label={label}
        aria-expanded={chatOpen}
        aria-pressed={chatOpen}
        title="Talk with Auri"
        onClick={() => {
          if (chatOpen) {
            stopVoiceSession();
            setChatOpen(false);
          } else {
            setChatOpen(true);
            announceMascot("playful");
          }
          setChatError("");
        }}
      >
        <span className="aura-mascot-art-frame" aria-hidden="true"><AuriFace mood={mood} expression={expression} size="large" speaking={voice.status === "speaking"} /></span>
      </button>
    </aside>
  );
}
