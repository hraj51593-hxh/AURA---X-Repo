import { useId } from "react";
import "../aura-auri-face.css";

export type AuriMood =
  | "sleeping"
  | "waking"
  | "idle"
  | "listening"
  | "thinking"
  | "searching"
  | "working"
  | "excited"
  | "bored"
  | "suspicious"
  | "angry"
  | "drowsy"
  | "happy"
  | "curious"
  | "confused"
  | "surprised"
  | "proud"
  | "shy"
  | "sad"
  | "laughing"
  | "scared"
  | "playful"
  | "celebrate";

export const AURI_MOODS = [
  "sleeping",
  "waking",
  "idle",
  "listening",
  "thinking",
  "searching",
  "working",
  "excited",
  "bored",
  "suspicious",
  "angry",
  "drowsy",
  "happy",
  "curious",
  "confused",
  "surprised",
  "proud",
  "shy",
  "sad",
  "laughing",
  "scared",
  "playful",
  "celebrate",
] as const satisfies readonly AuriMood[];

export type AuriExpression =
  | "neutral"
  | "joyful"
  | "delighted"
  | "curious"
  | "confused"
  | "surprised"
  | "focused"
  | "determined"
  | "proud"
  | "shy"
  | "relieved"
  | "hopeful"
  | "sleepy"
  | "drowsy"
  | "bored"
  | "skeptical"
  | "suspicious"
  | "sad"
  | "worried"
  | "scared"
  | "angry"
  | "frustrated"
  | "laughing"
  | "playful"
  | "listening"
  | "thinking"
  | "celebrating";

export const AURI_EXPRESSIONS = [
  "neutral",
  "joyful",
  "delighted",
  "curious",
  "confused",
  "surprised",
  "focused",
  "determined",
  "proud",
  "shy",
  "relieved",
  "hopeful",
  "sleepy",
  "drowsy",
  "bored",
  "skeptical",
  "suspicious",
  "sad",
  "worried",
  "scared",
  "angry",
  "frustrated",
  "laughing",
  "playful",
  "listening",
  "thinking",
  "celebrating",
] as const satisfies readonly AuriExpression[];

export const AURI_MOOD_EXPRESSIONS: Record<AuriMood, AuriExpression> = {
  sleeping: "sleepy", waking: "hopeful", idle: "neutral", listening: "listening",
  thinking: "thinking", searching: "focused", working: "determined", excited: "delighted",
  bored: "bored", suspicious: "suspicious", angry: "angry", drowsy: "drowsy",
  happy: "joyful", curious: "curious", confused: "confused", surprised: "surprised",
  proud: "proud", shy: "shy", sad: "sad", laughing: "laughing", scared: "scared",
  playful: "playful", celebrate: "celebrating",
};

type EyeStyle = "open" | "soft" | "crescent" | "wide" | "asym" | "round" | "narrow" | "side" | "closed" | "droop" | "half" | "worried" | "sharp" | "wink" | "up";
type MouthStyle = "neutral" | "smile" | "grin" | "laugh" | "tiny" | "wavy" | "o" | "flat" | "frown";

export const AURI_FACE_FEATURES: Record<AuriExpression, { eyes: EyeStyle; mouth: MouthStyle }> = {
  neutral: { eyes: "open", mouth: "neutral" },
  joyful: { eyes: "soft", mouth: "grin" },
  delighted: { eyes: "crescent", mouth: "laugh" },
  curious: { eyes: "wide", mouth: "tiny" },
  confused: { eyes: "asym", mouth: "wavy" },
  surprised: { eyes: "round", mouth: "o" },
  focused: { eyes: "narrow", mouth: "flat" },
  determined: { eyes: "sharp", mouth: "grin" },
  proud: { eyes: "soft", mouth: "smile" },
  shy: { eyes: "side", mouth: "tiny" },
  relieved: { eyes: "closed", mouth: "smile" },
  hopeful: { eyes: "up", mouth: "smile" },
  sleepy: { eyes: "droop", mouth: "flat" },
  drowsy: { eyes: "droop", mouth: "smile" },
  bored: { eyes: "half", mouth: "flat" },
  skeptical: { eyes: "side", mouth: "flat" },
  suspicious: { eyes: "narrow", mouth: "frown" },
  sad: { eyes: "droop", mouth: "frown" },
  worried: { eyes: "worried", mouth: "frown" },
  scared: { eyes: "wide", mouth: "o" },
  angry: { eyes: "sharp", mouth: "frown" },
  frustrated: { eyes: "sharp", mouth: "wavy" },
  laughing: { eyes: "closed", mouth: "laugh" },
  playful: { eyes: "wink", mouth: "grin" },
  listening: { eyes: "soft", mouth: "tiny" },
  thinking: { eyes: "up", mouth: "tiny" },
  celebrating: { eyes: "wide", mouth: "grin" },
};

export interface AuriFaceProps {
  mood: AuriMood;
  expression: AuriExpression;
  className?: string;
  size?: "compact" | "large";
  speaking?: boolean;
}

export function AuriFace({ mood, expression, className, size = "compact", speaking = false }: AuriFaceProps) {
  const gradientId = useId().replace(/:/g, "");
  const { eyes, mouth } = AURI_FACE_FEATURES[expression];
  const classes = [
    "auri-face",
    `auri-face--${size}`,
    `auri-face--eyes-${eyes}`,
    `auri-face--mouth-${mouth}`,
    `auri-face--mood-${mood}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      data-mood={mood}
      data-expression={expression}
      data-speaking={speaking ? "true" : undefined}
      role="img"
      aria-label={`Auri, ${mood}, ${expression}${speaking ? ", speaking" : ""}`}
    >
      <svg className="auri-face__art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={`${gradientId}-body`} cx="31%" cy="23%" r="80%">
            <stop offset="0" stopColor="#ffc294" />
            <stop offset="0.48" stopColor="#ff7658" />
            <stop offset="1" stopColor="#c84332" />
          </radialGradient>
          <linearGradient id={`${gradientId}-shine`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff9e9" stopOpacity="0.78" />
            <stop offset="1" stopColor="#fff9e9" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g className="auri-face__character">
          <path className="auri-face__orb" d="M50 22c-13.5 0-23.5 9.8-26 22-3.4 16.2 4.9 31.7 17.6 37.5 5.2 2.4 11.6 2.4 16.8 0C71.1 75.7 79.4 60.2 76 44c-2.5-12.2-12.5-22-26-22Z" fill={`url(#${gradientId}-body)`} />
          <path className="auri-face__shine" d="M29 40c4-9.2 11.6-14.7 21-15.2 2.1-.1 4.2.1 6.1.6-8.3 2.3-14.6 9.1-17.5 17.6-1.6 4.7-5.7 6.1-8.6 3.8-2.1-1.7-2.6-4.1-1-6.8Z" fill={`url(#${gradientId}-shine)`} />
          <ellipse className="auri-face__cheek" cx="30" cy="58" rx="4.4" ry="2.1" />
          <ellipse className="auri-face__cheek" cx="70" cy="58" rx="4.4" ry="2.1" />

          <g className="auri-face__arms" aria-hidden="true">
            <g className="auri-face__arm auri-face__arm--left">
              <path className="auri-face__limb" d="M31 63C24 62 19 66 17 72" />
              <path className="auri-face__hand" d="M17 71c-2-2-5-1-5 2l1 4c1 3 5 4 8 2l5-4c2-2 1-5-1-6-2-1-4 1-5 2l-3 2Z" />
              <path className="auri-face__fingers" d="m14 72-2-2m4 0-1-3m3 3 1-3" />
            </g>
            <g className="auri-face__arm auri-face__arm--right">
              <path className="auri-face__limb" d="M69 63c7-1 12 3 14 9" />
              <path className="auri-face__hand" d="M83 70c2-2 5-1 5 2l-1 4c-1 3-5 4-8 2l-5-4c-2-2-1-5 1-6 2-1 4 1 5 2l3 2Z" />
              <path className="auri-face__fingers" d="m86 71 2-2m-4 0 1-3m-3 3-1-3" />
            </g>
          </g>

          <g className="auri-face__gaze">
          <g className="auri-face__eyes">
            <path className="auri-face__brow auri-face__brow--left" d="M34 39q5-3 10-.5" />
            <path className="auri-face__brow auri-face__brow--right" d="M56 38.5q5-2.5 10 .5" />
            <ellipse className="auri-face__eye" cx="40" cy="47" rx="3.3" ry="5.1" />
            <ellipse className="auri-face__eye" cx="60" cy="47" rx="3.3" ry="5.1" />
            <circle className="auri-face__eye-glint" cx="41" cy="45.2" r="1.05" />
            <circle className="auri-face__eye-glint" cx="61" cy="45.2" r="1.05" />
            <path className="auri-face__lid auri-face__lid--left" d="M36.5 47q3.5 3.7 7 0" />
            <path className="auri-face__lid auri-face__lid--right" d="M56.5 47q3.5 3.7 7 0" />
          </g>
          </g>

          <g className="auri-face__mouth">
            <path className="auri-face__mouth-shape auri-mouth--neutral" d="M45 59h10" />
            <path className="auri-face__mouth-shape auri-mouth--smile" d="M42 57q8 9 16 0" />
            <path className="auri-face__mouth-shape auri-mouth--grin" d="M41 56q9 2 18 0v3q-9 9-18 0Z" />
            <path className="auri-face__mouth-shape auri-mouth--laugh" d="M42 56q8 3 16 0v2q-1 8-8 8t-8-8Z" />
            <path className="auri-face__mouth-shape auri-mouth--tiny" d="M47 59q3 2 6 0" />
            <path className="auri-face__mouth-shape auri-mouth--wavy" d="M42 59q3-3 6 0t6 0 4 0" />
            <path className="auri-face__mouth-shape auri-mouth--o" d="M50 56c-3.5 0-5.5 2-5.5 4.4S46.5 65 50 65s5.5-2.2 5.5-4.6S53.5 56 50 56Z" />
            <path className="auri-face__mouth-shape auri-mouth--flat" d="M44 59h12" />
            <path className="auri-face__mouth-shape auri-mouth--frown" d="M42 62q8-9 16 0" />
            <path className="auri-face__tongue" d="M47 63q3-2 6 0v2h-6Z" />
          </g>
        </g>
      </svg>
    </span>
  );
}
