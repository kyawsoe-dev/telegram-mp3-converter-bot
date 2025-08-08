import ytdlp from "yt-dlp-exec";

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
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export async function searchYouTubeMP3(
  query: string
): Promise<SearchResult | undefined> {
  const raw = await ytdlp(`ytsearch1:${query}`, {
    dumpSingleJson: true,
    noPlaylist: true,
  });

  const result =
    typeof raw === "string" ? JSON.parse(raw) : (raw as YtDlpSearchResult);

  const first = result.entries?.[0];
  if (!first?.webpage_url || !first.title) return undefined;

  const durationFormatted = first.duration
    ? formatDuration(first.duration)
    : "Unknown";

  const message =
    `🎵 *${first.title}*\n` +
    `⌛ Duration: ${durationFormatted}\n` +
    (first.uploader ? `👤 Uploader: ${first.uploader}\n` : "") +
    `🔗 [Watch on YouTube](${first.webpage_url})`;

  return {
    url: first.webpage_url,
    title: first.title,
    duration: durationFormatted,
    uploader: first.uploader,
    message,
  };
}
