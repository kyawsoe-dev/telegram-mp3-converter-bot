import { Telegraf } from "telegraf";
import ffmpeg from "fluent-ffmpeg";
import fetch from "node-fetch";
import { createWriteStream, unlink } from "fs";
import { join } from "path";
import ytdlp from "yt-dlp-exec";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { glob } from "glob";
import { promises as fs } from "fs";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);

const sanitize = (str: string) => str.replace(/[<>:"/\\|?*]+/g, "");

const downloadYouTubeAudio = async (url: string): Promise<string[]> => {
  const outputTemplate = "%(title)s.%(ext)s";
  const timeoutMs = 10 * 60 * 1000; // 10 min max for playlists

  const ytdlpPromise = ytdlp(url, {
    extractAudio: true,
    audioFormat: "mp3",
    audioQuality: 192,
    output: outputTemplate,
    ffmpegLocation: "/usr/bin/ffmpeg",
    playlistItems: "1-5",
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("yt-dlp timed out")), timeoutMs)
  );

  await Promise.race([ytdlpPromise, timeoutPromise]);

  const files = await glob("*.mp3");

  if (files.length === 0) {
    throw new Error("No MP3 files found after yt-dlp.");
  }

  const renamedFiles: string[] = [];
  for (const file of files) {
    const safeName = sanitize(file);
    if (safeName !== file) {
      await fs.rename(file, safeName);
    }
    renamedFiles.push(safeName);
  }

  return renamedFiles;
};

bot.start((ctx) =>
  ctx.reply("🎵 Send me a video file or a YouTube link to convert to MP3")
);

bot.on("video", async (ctx) => {
  const processingMsg = await ctx.reply("⏳ Processing your video...");

  try {
    const fileId = ctx.message.video.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);

    const videoPath = join(__dirname, `video-${randomUUID()}.mp4`);
    const audioPath = videoPath.replace(".mp4", ".mp3");

    const writeStream = createWriteStream(videoPath);
    const response = await fetch(fileLink.href);

    if (!response.ok || !response.body) {
      throw new Error("Failed to download video.");
    }

    await new Promise<void>((resolve, reject) => {
      response.body.pipe(writeStream);
      response.body.on("end", resolve);
      response.body.on("error", reject);
    });

    ffmpeg(videoPath)
      .output(audioPath)
      .audioBitrate(192)
      .on("end", async () => {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          "✅ Conversion complete. Sending audio..."
        );
        await ctx.replyWithAudio({ source: audioPath });

        // Clean up
        unlink(videoPath, () => {});
        unlink(audioPath, () => {});
        setTimeout(() => {
          ctx.telegram
            .deleteMessage(ctx.chat.id, processingMsg.message_id)
            .catch(() => {});
        }, 5000);
      })
      .on("error", async (err) => {
        console.error("FFmpeg error:", err);
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          "❌ Failed to convert video to audio."
        );
      })
      .run();
  } catch (error: any) {
    console.error("Video processing error:", error);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      `❌ Error: ${error.message || "Unexpected error"}`
    );
  }
});

bot.on("text", async (ctx) => {
  const url = ctx.message.text.trim();

  if (!url.startsWith("http")) {
    return ctx.reply("❗ Please send a valid YouTube URL or playlist link.");
  }

  const processingMsg = await ctx.reply("⏳ Downloading and converting...");

  try {
    const mp3Paths = await downloadYouTubeAudio(url);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      `✅ ${mp3Paths.length} MP3(s) ready! Sending now...`
    );

    for (const mp3Path of mp3Paths) {
      await ctx.replyWithAudio({ source: mp3Path });
      unlink(mp3Path, () => {});
    }

    setTimeout(() => {
      ctx.telegram
        .deleteMessage(ctx.chat.id, processingMsg.message_id)
        .catch(() => {});
    }, 5000);
  } catch (error: any) {
    console.error("YouTube download error:", error);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      `❌ Failed: ${error.message || "Unknown error occurred."}`
    );
  }
});

bot.launch().then(() => {
  console.log("✅ Bot is running...");
});
