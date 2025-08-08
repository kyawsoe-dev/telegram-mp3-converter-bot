import ffmpeg from "fluent-ffmpeg";
import { join } from "path";
import { randomUUID } from "crypto";

export function cutAudio(
  input: string,
  start: string,
  end?: string
): Promise<string> {
  const output = input.replace(
    /\.mp3$/,
    `-cut-${start.replace(/:/g, "-")}${
      end ? "-" + end.replace(/:/g, "-") : ""
    }.mp3`
  );

  const startSeconds = parseTimestampToSeconds(start);
  let durationSeconds: number | undefined;

  if (end) {
    const endSeconds = parseTimestampToSeconds(end);
    durationSeconds = endSeconds - startSeconds;
    if (durationSeconds <= 0) {
      return Promise.reject(new Error("End time must be after start time"));
    }
  }

  return new Promise((resolve, reject) => {
    let command = ffmpeg(input).setStartTime(startSeconds);

    if (durationSeconds !== undefined) {
      command = command.setDuration(durationSeconds);
    }

    command
      .output(output)
      .on("end", () => resolve(output))
      .on("error", (err) => reject(err))
      .run();
  });
}

function parseTimestampToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number).reverse();
  let seconds = 0;
  if (parts[0]) seconds += parts[0];
  if (parts[1]) seconds += parts[1] * 60;
  if (parts[2]) seconds += parts[2] * 3600;
  return seconds;
}

export async function mergeAudios(inputs: string[]): Promise<string> {
  const output = join(process.cwd(), `merged-${randomUUID()}.mp3`);
  const tmpDir = join(process.cwd(), "tmp");

  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    inputs.forEach((input) => command.input(input));
    command
      .on("error", reject)
      .on("end", () => resolve(output))
      .mergeToFile(output, tmpDir);
  });
}
