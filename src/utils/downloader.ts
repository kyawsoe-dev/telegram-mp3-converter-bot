import ytdlp from "yt-dlp-exec";
import { glob } from "glob";
import { promises as fs } from "fs";
import { config } from "../config";
import { sanitize } from "./sanitize";

export async function downloadYouTubeAudio(url: string): Promise<string[]> {
  console.log(`[INFO] Starting download for: ${url}`);

  try {
    const oldFiles = await glob("*.mp3");
    if (oldFiles.length > 0) {
      console.log(`[DEBUG] Removing old files: ${oldFiles.join(", ")}`);
      await Promise.all(oldFiles.map((f) => fs.unlink(f)));
    }

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
      console.log(`[DEBUG] Using cookies file: ${config.COOKIES_PATH}`);
      options.cookies = config.COOKIES_PATH;
      options.noCookieUpdate = true;
    }

    console.log("[INFO] Running yt-dlp...");
    
    await Promise.race([
      ytdlp(url, options),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("yt-dlp timed out after 10 minutes")),
          600000
        )
      ),
    ]);

    const files = await glob("*.mp3");
    if (files.length === 0) {
      throw new Error("No MP3 files found.");
    }
    console.log(`[INFO] Downloaded files: ${files.join(", ")}`);

    const renamed: string[] = [];
    for (const file of files) {
      const safe = sanitize(file);
      if (file !== safe) {
        console.log(`[DEBUG] Renaming ${file} -> ${safe}`);
        await fs.rename(file, safe);
      }
      renamed.push(safe);
    }

    console.log(`[INFO] Final files ready: ${renamed.join(", ")}`);
    return renamed;
  } catch (err) {
    console.error(
      `[ERROR] Failed to download audio: ${(err as Error).message}`
    );
    throw err;
  }
}
