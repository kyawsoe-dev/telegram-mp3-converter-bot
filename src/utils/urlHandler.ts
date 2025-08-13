import { downloadYouTubeAudio } from "../utils/downloader";
import { unlink, statSync } from "fs";
import { log } from "../logger";
import ytdlp from "yt-dlp-exec";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

async function getYouTubeVideoInfo(url: string) {
  const raw = await ytdlp(url, {
    dumpSingleJson: true,
    noPlaylist: true,
  });
  const info = typeof raw === "string" ? JSON.parse(raw) : raw;

  return {
    title: info.title as string,
    uploader: info.uploader as string,
    duration: info.duration as number,
    webpage_url: info.webpage_url as string,
  };
}

export function compressAudio(
  inputPath: string,
  outputPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let lastUpdate = Date.now();

    ffmpeg(inputPath)
      .audioCodec("libmp3lame")
      .audioChannels(1)
      .audioBitrate("48k")
      .audioFrequency(22050)
      .on("progress", (progress) => {
        const percent = progress.percent ? Math.min(progress.percent, 100) : 0;
        if (onProgress && Date.now() - lastUpdate >= 3000) {
          onProgress(percent);
          lastUpdate = Date.now();
        }
      })
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

export async function handleYouTubeUrl(ctx: any) {
  const url = ctx.message.text.trim();

  if (!url.startsWith("http")) {
    return ctx.reply("❗ Please send a valid YouTube URL.");
  }

  let progressMsg = await ctx.reply("⏳ Downloading and converting...");

  try {
    const info = await getYouTubeVideoInfo(url);
    const maxDurationSeconds = 60 * 60;
    if (info.duration > maxDurationSeconds) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMsg.message_id,
        undefined,
        "Request too large: video duration exceeds 60 minutes. Please choose a shorter video."
      );
      return;
    }

    const files = await downloadYouTubeAudio(url);

    if (!files.length) throw new Error("Audio download failed.");

    const originalFile = files[0];
    const originalBaseName = path.basename(originalFile);

    const compressedFile = path.join(
      os.tmpdir(),
      `compressed-${randomUUID()}.mp3`
    );

    await compressAudio(originalFile, compressedFile, async (percent) => {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          progressMsg.message_id,
          undefined,
          `🎧 Compressing audio... ${percent.toFixed(1)}%`
        );
      } catch (err) {
        console.error("Failed to update progress message:", err);
      }
    });

    const stats = statSync(compressedFile);
    const maxFileSize = 50 * 1024 * 1024;

    if (stats.size > maxFileSize) {
      [originalFile, compressedFile].forEach((file) =>
        unlink(file, (err) => {
          if (err) console.error(`Failed to delete file ${file}:`, err);
        })
      );

      return ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMsg.message_id,
        undefined,
        "Sorry, the audio file is too large (>50MB) even after compression."
      );
    }

    const caption =
      `🎵 *${info.title}*\n` +
      `👤 Uploader: *${info.uploader}*\n` +
      `⌛ Duration: ${Math.floor(info.duration / 60)}:${(info.duration % 60)
        .toString()
        .padStart(2, "0")}\n` +
      `🔗 [Watch on YouTube](${info.webpage_url})`;

    await ctx.replyWithAudio(
      { source: compressedFile, filename: originalBaseName },
      { caption, parse_mode: "Markdown" }
    );

    [originalFile, compressedFile].forEach((file) =>
      unlink(file, (err) => {
        if (err) console.error(`Failed to delete file ${file}:`, err);
      })
    );

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progressMsg.message_id,
      undefined,
      "Done! Enjoy your audio."
    );
  } catch (err: any) {
    log("YouTube handler error", err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progressMsg.message_id,
      undefined,
      `${err.message}`
    );
  }
}
