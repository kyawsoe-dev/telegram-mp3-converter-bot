import { createWriteStream, unlink } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import { log } from "../logger";

export async function handleVideo(ctx: any) {
  const processingMsg = await ctx.reply("⏳ Processing your video...");

  try {
    const fileId = ctx.message.video.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);

    const videoPath = join(process.cwd(), `video-${randomUUID()}.mp4`);
    const audioPath = videoPath.replace(".mp4", ".mp3");

    const response = await fetch(fileLink.href);
    if (!response.ok || !response.body)
      throw new Error("Video download failed.");

    const stream = Readable.fromWeb(response.body as any);
    const writeStream = createWriteStream(videoPath);

    await new Promise((res, rej) => {
      stream.pipe(writeStream);
      stream.on("end", res);
      stream.on("error", rej);
    });

    ffmpeg(videoPath)
      .output(audioPath)
      .audioBitrate(192)
      .on("end", async () => {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          "✅ Conversion complete!"
        );
        await ctx.replyWithAudio({ source: audioPath });
        unlink(videoPath, () => {});
        unlink(audioPath, () => {});
      })
      .on("error", async (err) => {
        log("FFmpeg error", err);
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          "❌ Conversion failed."
        );
      })
      .run();
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
