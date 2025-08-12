import { Message } from "telegraf/types";

export type AudioMessage = Message & { audio: { file_id: string } };

export function isAudioMessage(msg: any): msg is AudioMessage {
  return msg && typeof msg === "object" && "audio" in msg;
}
