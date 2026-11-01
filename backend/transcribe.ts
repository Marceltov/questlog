// Speaking into the chat: Claude takes no audio, so a spoken message goes to a Whisper server the instance runs itself
// (GAMEPANION_TRANSCRIBE_URL, any server with the OpenAI-compatible POST /v1/audio/transcriptions, such as speaches), and its words are
// what is sent as the player's message. The recording is never stored and never leaves the instance's own servers. Behind Transcriber,
// so tests stand in for Whisper.
import type { Logger } from "pino";
import { config } from "./config";
import { logger } from "./log";
import { processState } from "./state";

export interface Transcriber {
  /** What is said in the audio, word for word, or `error` (why not, as logged). */
  transcribe(bytes: Uint8Array, type: string): Promise<{ text: string } | { error: string }>;
}

/** CPU transcription of a few minutes of speech takes a while; past this it has hung. */
const TIMEOUT = 10 * 60_000;

/** The Whisper server at `base` (no trailing slash), with `model`. `deps` stand in for fetch and the logger in tests. */
export function whisperTranscriber(base: string, model: string, deps: { fetch?: typeof fetch; log?: Logger } = {}): Transcriber {
  const log = deps.log ?? logger("transcribe");
  return {
    async transcribe(bytes, type) {
      const form = new FormData();
      form.set("file", new Blob([bytes as BlobPart], { type }), `message.${type.split("/")[1] ?? "audio"}`);
      form.set("model", model);
      form.set("response_format", "json");
      let res: Response;
      try {
        res = await (deps.fetch ?? fetch)(`${base}/v1/audio/transcriptions`, { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT) });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        log.warn({ error }, "the transcription server can't be reached");
        return { error: `transcription server unreachable: ${error}` };
      }
      if (!res.ok) {
        log.warn({ status: res.status }, "the transcription failed");
        return { error: `transcription failed (HTTP ${res.status})` };
      }
      const out = (await res.json().catch(() => null)) as { text?: unknown } | null;
      const text = typeof out?.text === "string" ? out.text.trim() : "";
      if (!text) {
        log.warn("the transcription came back empty");
        return { error: "nothing was understood in the recording" };
      }
      return { text };
    },
  };
}

// The transcriber in use: a test's stand-in, Whisper at the configured URL, or none (the chat takes typing only).
const state = processState("transcribe", () => ({ override: null as Transcriber | null }));
export const setTranscriberForTests = (t: Transcriber | null) => {
  state.override = t;
};
export function transcriber(): Transcriber | null {
  if (state.override) return state.override;
  const url = config.transcribeUrl();
  return url ? whisperTranscriber(url, config.transcribeModel()) : null;
}
