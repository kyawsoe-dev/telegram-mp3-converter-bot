import ffmpeg from "fluent-ffmpeg";
import { timeStrToSeconds } from "./time";

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

  const startSeconds = timeStrToSeconds(start);
  let durationSeconds: number | undefined;

  if (end) {
    const endSeconds = timeStrToSeconds(end);
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