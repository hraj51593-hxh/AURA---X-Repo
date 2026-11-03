const USER_VOICE_ID = "NOpBlnGInO9m6vDvFkFC";
const MODEL_ID = "eleven_v4_turbo";
const MAX_TTS_CHARACTERS = 1_800;

export async function synthesizeAuriSpeech(text: string, languageCode: "hi" | "en"): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Auri voice service is not configured.");
  const boundedText = text.trim().slice(0, MAX_TTS_CHARACTERS);
  if (!boundedText) throw new Error("Speech text is empty.");

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${USER_VOICE_ID}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: boundedText,
      model_id: MODEL_ID,
      language_code: languageCode,
      voice_settings: { stability: 0.55, similarity_boost: 0.75 },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const reason = (await response.text()).slice(0, 240);
    throw new Error(`Voice provider returned ${response.status}: ${reason}`);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length || audio.length > 8_000_000) throw new Error("Voice response was empty or too large.");
  return audio;
}

export function isAuriVoiceConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}
