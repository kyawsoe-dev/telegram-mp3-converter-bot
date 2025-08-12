import { createWriteStream, unlink, statSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import { log } from "../logger";

export async function handleVideo(ctx: any) {
  const processingMsg = await ctx.reply("⏳ Processing your video...");

  try {
    const fileId = ctx.message.video.file_id;
    const fileMeta = await ctx.telegram.getFile(fileId);

    if (fileMeta.file_size && fileMeta.file_size > 20 * 1024 * 1024) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        "Sorry, video size exceeds 20MB limit. Please send a smaller video."
      );
    }

    const fileLink = await ctx.telegram.getFileLink(fileId);

    const videoPath = join(process.cwd(), `video-${randomUUID()}.mp4`);
    const audioPath = videoPath.replace(".mp4", ".mp3");

    const response = await fetch(fileLink.href);
    if (!response.ok || !response.body)
      throw new Error("Video download failed.");

    const stream = Readable.fromWeb(response.body as any);
    const writeStream = createWriteStream(videoPath);

    await new Promise<void>((resolve, reject) => {
      stream.pipe(writeStream);
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .output(audioPath)
        .audioBitrate(64)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    const stats = statSync(audioPath);
    const maxAudioSize = 50 * 1024 * 1024;

    if (stats.size > maxAudioSize) {
      unlink(videoPath, () => {});
      unlink(audioPath, () => {});

      return ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        "Audio file is too large (>50MB) after compression. Try a shorter video."
      );
    }

    const originalName = `audio-${randomUUID()}.mp3`;

    await ctx.replyWithAudio(
      { source: audioPath, filename: originalName },
      { caption: "🎵 Here's your extracted audio!", parse_mode: "Markdown" }
    );

    // Cleanup
    unlink(videoPath, () => {});
    unlink(audioPath, () => {});

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      "Done! Enjoy your audio."
    );
  } catch (err: any) {
    log("Video processing error", err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      `❌ ${err.message}`
    );
  }
}
