import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

export async function transcribe(filePath: string): Promise<string> {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));
  form.append("model", "whisper-1");

  const transacriptionUrl = process.env.OPENAI_API_TRANSCRIPTIONS_URL || "";
  const res = await fetch(transacriptionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      ...form.getHeaders(),
    },
    body: form as any,
  });

  if (!res.ok) throw new Error(`Transcription failed: ${res.statusText}`);
  const json = await res.json();
  return json.text;
}
