import ytdlp from "yt-dlp-exec";
import { glob } from "glob";
import { promises as fs } from "fs";
import { config } from "../config";
import { sanitize } from "./sanitize";

export async function downloadYouTubeAudio(url: string): Promise<string[]> {
  const oldFiles = await glob("*.mp3");
  await Promise.all(oldFiles.map((f) => fs.unlink(f)));

  const options: Record<string, any> = {
    extractAudio: true,
    audioFormat: "mp3",
    audioQuality: 192,
    output: "%(title)s.%(ext)s",
    ffmpegLocation: config.FFMPEG_PATH,
    noPlaylist: true,
    format: "bestaudio/best",
  };
  if (config.COOKIES_PATH) {
    options.cookies = config.COOKIES_PATH;
  }

  await Promise.race([ytdlp(url, options), 600000]);

  const files = await glob("*.mp3");
  if (files.length === 0) throw new Error("No MP3 files found.");

  const renamed = [];
  for (const file of files) {
    const safe = sanitize(file);
    if (file !== safe) await fs.rename(file, safe);
    renamed.push(safe);
  }

  return renamed;
}
