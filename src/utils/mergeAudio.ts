import ffmpeg from "fluent-ffmpeg";
import { join } from "path";
import { randomUUID } from "crypto";

export function mergeAudios(
  inputs: string[],
  output?: string
): Promise<string> {
  if (!output) {
    output = join(process.cwd(), `merged-${randomUUID()}.mp3`);
  }
  const tmpDir = join(process.cwd(), "tmp");

  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    inputs.forEach((input) => command.input(input));
    command
      .on("error", reject)
      .on("end", () => resolve(output!))
      .mergeToFile(output, tmpDir);
  });
}
