import { ENV } from "../_core/env";

const MAX_AUDIO_BYTES = 1_200_000;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
]);

export async function transcribeAuriAudio(audio: Uint8Array, suppliedType: string): Promise<string> {
  const contentType = suppliedType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_AUDIO_TYPES.has(contentType)) throw new Error("This audio format is not supported.");
  if (audio.byteLength < 100 || audio.byteLength > MAX_AUDIO_BYTES) throw new Error("The voice clip is empty or too large.");
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) throw new Error("Auri voice transcription is not available right now.");

  const stableBuffer = new ArrayBuffer(audio.byteLength);
  new Uint8Array(stableBuffer).set(audio);
  const extension = contentType === "audio/webm" ? "webm" : contentType === "audio/ogg" ? "ogg" : contentType === "audio/mp4" ? "m4a" : contentType === "audio/wav" ? "wav" : "mp3";
  const form = new FormData();
  form.set("file", new Blob([stableBuffer], { type: contentType }), `auri-turn.${extension}`);
  form.set("model", "whisper-1");
  form.set("prompt", "Transcribe the user's spoken words in their original language. They may speak English, Hindi, or Hinglish and may use learning, work, technology, or goal-planning vocabulary. Preserve meaning and names; do not translate.");

  let response: Response;
  try {
    response = await fetch(`${ENV.forgeApiUrl.replace(/\/+$/, "")}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("Auri could not reach the speech service. Check your connection and try again.");
  }
  if (!response.ok) throw new Error("Auri's speech service is unavailable right now. You can retry or type your message.");

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("Auri received an unreadable transcription response. Please retry or type your message.");
  }
  if (!result || typeof result !== "object" || "error" in result) {
    throw new Error("Auri could not transcribe that clip. Please retry or type your message.");
  }
  const transcript = "text" in result && typeof result.text === "string" ? result.text.trim() : "";
  if (!transcript) throw new Error("No speech was detected. Try again or type your message.");
  return transcript.slice(0, 3_000);
}

export function isAuriTranscriptionAvailable(): boolean {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}
