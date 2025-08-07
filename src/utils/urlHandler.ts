import { downloadYouTubeAudio } from "../utils/downloader";
import { unlink } from "fs";
import { log } from "../logger";

export async function handleYouTubeUrl(ctx: any) {
  const url = ctx.message.text.trim();

  if (!url.startsWith("http")) {
    return ctx.reply("❗ Please send a valid YouTube URL.");
  }

  const processingMsg = await ctx.reply("⏳ Downloading and converting...");

  try {
    const files = await downloadYouTubeAudio(url);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      `✅ ${files.length} MP3(s) ready!`
    );

    for (const file of files) {
      await ctx.replyWithAudio({ source: file });
      unlink(file, () => {});
    }
  } catch (err: any) {
    log("YouTube handler error", err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      `❌ ${err.message}`
    );
  }
}
