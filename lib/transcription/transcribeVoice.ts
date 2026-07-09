import OpenAI, { toFile } from "openai";

let client: OpenAI | undefined;

function getClient() {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var");
  client = new OpenAI({ apiKey });
  return client;
}

export async function transcribeVoice(audio: Buffer, filename = "voice.ogg"): Promise<string> {
  const openai = getClient();
  const file = await toFile(audio, filename);
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return transcription.text;
}
