import { Context } from "telegraf";
import { createWriteStream, unlink } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import fetch from "node-fetch";
import { mergeAudios } from "./mergeAudio";

export async function mergeAndSend(
  ctx: Context,
  audioFileIds: string[]
): Promise<void> {
  const filePaths: string[] = []

  for (const fileId of audioFileIds) {
    const link = await ctx.telegram.getFileLink(fileId);
    const filePath = join(process.cwd(), `${randomUUID()}.mp3`);
    const res = await fetch(link.href);

    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(filePath);
      res.body?.pipe(stream).on("finish", resolve).on("error", reject);
    });

    filePaths.push(filePath);
  }

  const outputFile = join(process.cwd(), `merged-${randomUUID()}.mp3`);
  await mergeAudios(filePaths, outputFile);

  await ctx.replyWithAudio(
    { source: outputFile },
    { caption: "Merged audio file." }
  );

  filePaths.forEach((file) =>
    unlink(file, (err) => {
      if (err) console.error(`Failed to delete temp file ${file}:`, err);
    })
  );
  unlink(outputFile, (err) => {
    if (err) console.error(`Failed to delete merged file ${outputFile}:`, err);
  });
}
