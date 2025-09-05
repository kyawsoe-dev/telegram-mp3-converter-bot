import ytdlp from "yt-dlp-exec";
import { config } from "../config";
import path from "path";
import os from "os";
import { promises as fs } from "fs";

interface YtDlpSearchEntry {
  webpage_url?: string;
  title?: string;
  duration?: number;
  uploader?: string;
}

interface YtDlpSearchResult {
  entries?: YtDlpSearchEntry[];
}

export interface SearchResult {
  url: string;
  title: string;
  duration: string;
  uploader?: string;
  message: string;
  tooLong?: boolean;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const maxDurationSeconds = 60 * 60;

export async function searchYouTubeMP3(
  query: string
): Promise<SearchResult | undefined> {
  console.log(`[INFO] Searching YouTube for query: "${query}"`);

  let tempCookiesPath: string | undefined;
  const options: Record<string, any> = {
    dumpSingleJson: true,
    noPlaylist: true,
  };

  if (config.COOKIES_PATH) {
    tempCookiesPath = path.join(os.tmpdir(), `cookies-${Date.now()}.txt`);
    console.log(`[DEBUG] Copying cookies to temporary file: ${tempCookiesPath}`);
    await fs.copyFile(config.COOKIES_PATH, tempCookiesPath);
    options.cookies = tempCookiesPath;
  }

  const raw = await ytdlp(`ytsearch1:${query}`, options);

  if (tempCookiesPath) {
    await fs.unlink(tempCookiesPath).catch(() => {
      console.warn(`[WARN] Failed to delete temp cookies file: ${tempCookiesPath}`);
    });
  }

  const result =
    typeof raw === "string" ? JSON.parse(raw) : (raw as YtDlpSearchResult);

  const first = result.entries?.[0];
  if (!first?.webpage_url || !first.title) {
    console.warn("[WARN] No search results found.");
    return undefined;
  }

  console.log(`[INFO] First result: ${first.title} (${first.webpage_url})`);

  if (first.duration && first.duration > maxDurationSeconds) {
    console.warn("[WARN] Video too long, skipping.");
    return {
      url: first.webpage_url,
      title: first.title,
      duration: formatDuration(first.duration),
      uploader: first.uploader,
      message:
        "Request too large: video duration exceeds 60 minutes. Please choose a shorter video.",
      tooLong: true,
    };
  }

  const durationFormatted = first.duration
    ? formatDuration(first.duration)
    : "Unknown";

  const message =
    `🎵 *${first.title}*\n` +
    `⌛ Duration: ${durationFormatted}\n` +
    (first.uploader ? `👤 Uploader: ${first.uploader}\n` : "") +
    `🔗 [Watch on YouTube](${first.webpage_url})`;

  console.log(
    `[INFO] Search result prepared: ${first.title} (${durationFormatted})`
  );

  return {
    url: first.webpage_url,
    title: first.title,
    duration: durationFormatted,
    uploader: first.uploader,
    message,
  };
}
