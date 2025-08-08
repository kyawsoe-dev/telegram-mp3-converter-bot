import type { Message } from "telegraf/typings/core/types/typegram";
import { Telegraf, Input } from "telegraf";
import { createWriteStream, unlink } from "fs";
import { randomUUID } from "crypto";
import { join } from "path";
import fetch from "node-fetch";
import ffprobe from "fluent-ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { Context } from "telegraf";
import { config } from "./config";
import { log } from "./logger";
import { handleVideo } from "./utils/videoHandler";
import { handleYouTubeUrl } from "./utils/urlHandler";
import { cutAudio } from "./utils/audioEditor";
import { transcribe } from "./utils/speechToText";
import { searchYouTubeMP3 } from "./utils/musicSearch";
import { downloadYouTubeAudio } from "./utils/downloader";

const bot = new Telegraf(config.BOT_TOKEN);

bot.telegram.setMyCommands([
  { command: "start", description: "Show welcome message & help" },
  { command: "video", description: "Download video from URL" },
  { command: "mp3", description: "Download MP3 from URL" },
  // { command: "transcribe", description: "Transcribe audio reply" },
  // { command: "voice2text", description: "Transcribe voice message" },
  { command: "merge", description: "Merge multiple audios (TBD)" },
  { command: "cut", description: "Trim audio: /cut start=00:30 end=01:20" },
  { command: "search", description: "Search & download music from YouTube" },
]);

bot.use(async (ctx, next) => {
  const isText = ctx.updateType === "message" && "text" in ctx.message!;

  log("Incoming update", {
    type: ctx.updateType,
    user: ctx.from?.username || ctx.from?.id,
    chatId: ctx.chat?.id,
    message: isText ? (ctx.message as any).text : ctx,
  });

  try {
    await next();
  } catch (err) {
    log("Middleware error", err);
  }
});

// start command
bot.start((ctx) =>
  ctx.reply(
    "\uD83C\uDFB5 Send a video or YouTube link to convert to MP3\n" +
      "\uD83C\uDFAC /video <url> — Download video\n" +
      "\uD83C\uDFB5 /mp3 <url> — Download MP3\n" +
      "\uD83E\uDDE0 /transcribe — Reply to audio to transcribe\n" +
      // "\uD83C\uDFA4 /voice2text — Transcribe voice message\n" +
      // "\uD83D\uDCC2 /merge — Merge multiple audios (TBD)\n" +
      "\uD83D\uDD0A /cut start=00:30 end=01:20 — Trim audio\n" +
      "\uD83C\uDFA7 /search <song name> — Find & download music\n\n" +
      "You can also just send a song name to search directly."
  )
);

// text command
bot.on("text", async (ctx, next) => {
  const text = ctx.message.text.trim();

  if (text.startsWith("/")) {
    return next();
  }

  if (
    text.startsWith("http") &&
    (text.includes("youtube.com") || text.includes("youtu.be"))
  ) {
    return handleYouTubeUrl(ctx);
  }

  if (text.length < 2) {
    return ctx.reply("❗ Please send a valid YouTube URL or use a command.");
  }

  const processingMsg = await ctx.reply("⏳ Searching on YouTube...");

  try {
    const result = await searchYouTubeMP3(text);
    if (!result) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        "❌ No results found."
      );
    }

    await ctx.reply(result.message, { parse_mode: "Markdown" });

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      "🎵 Converting to MP3..."
    );

    const files = await downloadYouTubeAudio(result.url);

    await ctx.replyWithAudio({ source: files[0] });

    files.forEach((file) => {
      unlink(file, (err) => {
        if (err) console.error(`Failed to delete file ${file}:`, err);
      });
    });

    await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
  } catch (err: any) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      `❌ Error: ${err.message}`
    );
  }
});

// video command size max > 50MB
bot.on("video", handleVideo);

// search command
bot.command("search", async (ctx) => {
  const query = ctx.message.text.split(" ").slice(1).join(" ");
  if (!query) return ctx.reply("Usage: <song name>");

  const processingMsg = await ctx.reply("⏳ Searching on YouTube...");

  try {
    const result = await searchYouTubeMP3(query);
    if (!result) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        "❌ No results found."
      );
    }

    await ctx.reply(result.message, { parse_mode: "Markdown" });

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      "🎵 Converting to MP3..."
    );

    const files = await downloadYouTubeAudio(result.url);

    await ctx.replyWithAudio({ source: files[0] });

    files.forEach((file) => {
      unlink(file, (err) => {
        if (err) console.error(`Failed to delete file ${file}:`, err);
      });
    });

    await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
  } catch (err: any) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      `❌ Error: ${err.message}`
    );
  }
});

// audio duration parsing
function timeStrToSeconds(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffprobe.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata?.format?.duration;
      if (!duration) return reject(new Error("Cannot get audio duration"));
      resolve(duration);
    });
  });
}

// cut auidio command
bot.command("cut", async (ctx) => {
  console.log("Received /cut command", ctx.message.text);
  const text = ctx.message.text;

  const startMatch = text.match(/start=(\S+)/);
  const endMatch = text.match(/end=(\S+)/);

  if (!startMatch && !endMatch) {
    return ctx.reply(
      "❗ You must specify at least one: start or end time.\nExample: /cut start=00:30 end=01:00"
    );
  }

  const startStr = startMatch ? startMatch[1] : "0";
  const endStr = endMatch ? endMatch[1] : undefined;

  const reply = ctx.message.reply_to_message;
  const lastAudio = (reply as any)?.audio;
  if (!lastAudio) return ctx.reply("Reply to an audio message with /cut");

  const processingMsg = await ctx.reply("⏳ Processing audio cut...");

  try {
    const link = await ctx.telegram.getFileLink(lastAudio.file_id);
    const filePath = join(process.cwd(), `${randomUUID()}.mp3`);

    const res = await fetch(link.href);
    const fileStream = createWriteStream(filePath);
    await new Promise<void>((resolve, reject) => {
      if (!res.body) return reject("No response body");
      res.body
        .pipe(fileStream)
        .on("finish", () => resolve())
        .on("error", reject);
    });

    const audioDuration = await getAudioDuration(filePath);
    const startSec = timeStrToSeconds(startStr);
    const endSec = endStr ? timeStrToSeconds(endStr) : audioDuration;

    if (startSec >= audioDuration) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        `❌ Start time (${startStr}) is beyond audio duration (${Math.floor(
          audioDuration
        )}s).`
      );
      return;
    }

    if (endSec > audioDuration) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        `❌ End time (${endStr}) is beyond audio duration (${Math.floor(
          audioDuration
        )}s).`
      );
      return;
    }

    if (startSec >= endSec) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        `❌ Start time must be less than end time.`
      );
      return;
    }

    const cutFile = await cutAudio(filePath, startStr, endStr);

    await ctx.replyWithAudio(Input.fromLocalFile(cutFile));

    [filePath, cutFile].forEach((file) => {
      unlink(file, (err) => {
        if (err) {
          console.error(`Failed to delete file ${file}:`, err);
        } else {
          console.log(`Deleted file: ${file}`);
        }
      });
    });

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      "✅ Audio cut complete!"
    );
  } catch (err: any) {
    console.error(err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      `❌ Failed to cut audio: ${err.message}`
    );
  }
});

// merge audios
function mergeAudios(inputs: string[], output: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    inputs.forEach((input) => command.input(input));
    command
      .on("error", reject)
      .on("end", () => resolve(output))
      .mergeToFile(output, join(process.cwd(), "tmp"));
  });
}

async function mergeAndSend(
  ctx: Context,
  audioFileIds: string[]
): Promise<void> {
  const filePaths: string[] = [];

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
    { caption: "✅ Merged audio file." }
  );

  filePaths.forEach((file) => unlink(file, () => {}));
  unlink(outputFile, () => {});
}

// keep user audios in memory
const userAudios: Record<number, string[]> = {};

bot.on("audio", (ctx) => {
  const message = ctx.message;
  if (!message || !("audio" in message)) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  if (!userAudios[userId]) {
    userAudios[userId] = [];
  }

  userAudios[userId].push(message.audio.file_id);
  ctx.reply(
    `✅ Audio added to merge list. (${userAudios[userId].length} so far)`
  );
});

bot.command("merge", async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const audios = userAudios[userId] || [];

  if (audios.length < 2) {
    return ctx.reply("❗ Please send at least two audio files before merging.");
  }

  await ctx.reply(`⏳ Merging ${audios.length} audios...`);
  await mergeAndSend(ctx, audios);
  userAudios[userId] = [];
});

// transcribe command
function hasAudioOrVoice(msg: any): msg is { audio?: any; voice?: any } {
  return msg && (msg.audio !== undefined || msg.voice !== undefined);
}

bot.command("transcribe", async (ctx) => {
  const reply = ctx.message?.reply_to_message;

  if (!reply || !hasAudioOrVoice(reply)) {
    return ctx.reply("Reply to an audio/voice message with /transcribe");
  }

  const audio = reply.audio ?? reply.voice;

  if (!audio)
    return ctx.reply("Reply to an audio/voice message with /transcribe");

  try {
    const link = await ctx.telegram.getFileLink(audio.file_id);
    const filePath = join(process.cwd(), `${randomUUID()}.mp3`);

    const res = await fetch(link.href);
    if (!res.body) return ctx.reply("Failed to download audio");

    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(filePath);
      res.body.pipe(stream).on("finish", resolve).on("error", reject);
    });

    const result = await transcribe(filePath);

    await ctx.reply(`📝 Transcription:\n${result}`);

    unlink(filePath, (err) => {
      if (err) console.error("Failed to delete temp file:", err);
    });
  } catch (err: any) {
    console.error("Transcription error:", err);
    await ctx.reply(`❌ Error during transcription: ${err.message || err}`);
  }
});

// voice2text command
bot.command("voice2text", async (ctx) => {
  const message = ctx.message;

  if (!("voice" in message)) {
    return ctx.reply("🎤 Please send a voice message to convert to text.");
  }

  const voiceMessage = message as Message.VoiceMessage;
  const fileLink = await ctx.telegram.getFileLink(voiceMessage.voice.file_id);
  const filePath = join(process.cwd(), `${randomUUID()}.mp3`);

  const res = await fetch(fileLink.href);
  if (!res.body) {
    return ctx.reply("❌ Failed to download voice file.");
  }

  await new Promise<void>((resolve, reject) => {
    const fileStream = createWriteStream(filePath);
    res.body
      .pipe(fileStream)
      .on("finish", () => resolve())
      .on("error", reject);
  });

  const result = await transcribe(filePath);
  await ctx.reply(`📝 Voice transcription:\n${result}`);
});

// start the bot
bot.launch().then(() => log("✅ Bot is running..."));

// handle graceful shutdown
process.once("SIGINT", () => {
  log("🛑 Bot stopped (SIGINT)");
  bot.stop("SIGINT");
});

// handle graceful shutdown on SIGTERM
process.once("SIGTERM", () => {
  log("🛑 Bot stopped (SIGTERM)");
  bot.stop("SIGTERM");
});
