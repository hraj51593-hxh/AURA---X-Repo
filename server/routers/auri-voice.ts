import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { enforceRateLimit } from "../services/auth";
import { isAuriVoiceConfigured, synthesizeAuriSpeech } from "../services/elevenlabs-tts";
import { isAuriTranscriptionAvailable, transcribeAuriAudio } from "../services/auri-transcription";

export const auriVoiceRouter = router({
  status: protectedProcedure.query(() => ({ available: isAuriVoiceConfigured(), transcriptionAvailable: isAuriTranscriptionAvailable() })),
  transcribe: protectedProcedure
    .input(z.object({
      audioBase64: z.string().min(136).max(1_600_000).regex(/^[A-Za-z0-9+/]+={0,2}$/).refine(value => value.length % 4 === 0),
      contentType: z.enum(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]),
    }))
    .mutation(async ({ ctx, input }) => {
      enforceRateLimit(`auri-transcription:${ctx.user.id}`, 30, 60 * 60 * 1000);
      const audio = Buffer.from(input.audioBase64, "base64");
      if (audio.byteLength < 100 || audio.byteLength > 1_200_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The voice clip is empty or too large. Please record a shorter clip." });
      }
      try {
        return { transcript: await transcribeAuriAudio(new Uint8Array(audio), input.contentType) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Auri could not transcribe that clip.";
        const inputError = /format|empty|too large|no speech/i.test(message);
        if (!inputError) console.warn("[AURA-X] Auri transcription failed:", message.slice(0, 180));
        throw new TRPCError({ code: inputError ? "BAD_REQUEST" : "SERVICE_UNAVAILABLE", message });
      }
    }),
  speak: protectedProcedure
    .input(z.object({ text: z.string().trim().min(1).max(1_800), language: z.enum(["hi", "en"]) }))
    .mutation(async ({ ctx, input }) => {
      enforceRateLimit(`auri-voice:${ctx.user.id}`, 12, 60 * 60 * 1000);
      if (!isAuriVoiceConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Auri's hosted voice is not configured." });
      }
      try {
        const audio = await synthesizeAuriSpeech(input.text, input.language);
        return { audioBase64: audio.toString("base64"), contentType: "audio/mpeg" as const };
      } catch (error) {
        console.warn("[AURA-X] Hosted voice synthesis failed:", error instanceof Error ? error.message.slice(0, 220) : "unknown error");
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Hosted voice is unavailable right now." });
      }
    }),
});
