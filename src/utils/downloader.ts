import ytdlp from "yt-dlp-exec";
import { glob } from "glob";
import { promises as fs } from "fs";
import { config } from "../config";
import { log } from "../logger";
import { sanitize } from "./sanitize";

export async function downloadYouTubeAudio(url: string): Promise<string[]> {
  log("Starting YouTube download", { url });

  await Promise.race([
    ytdlp(url, {
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: 192,
      output: "%(title)s.%(ext)s",
      ffmpegLocation: config.FFMPEG_PATH,
      noPlaylist: true,
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("yt-dlp timed out")), 600000)
    ),
  ]);

  const files = await glob("*.mp3");
  if (files.length === 0) throw new Error("No MP3 files found.");

  const renamed = [];
  for (const file of files) {
    const safe = sanitize(file);
    if (file !== safe) await fs.rename(file, safe);
    renamed.push(safe);
  }

  log("Download complete", { files: renamed });
  return renamed;
}
