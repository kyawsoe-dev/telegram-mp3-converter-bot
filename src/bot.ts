import { Message } from "telegraf/typings/core/types/typegram";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Telegraf, Markup, Context } from "telegraf";
import { createWriteStream, unlink } from "fs";
import { randomUUID } from "crypto";
import { join } from "path";
import fetch from "node-fetch";
import {
  timeStrToSeconds,
  secondsToTimeStr,
  getAudioDuration,
  handleVideo,
  handleYouTubeUrl,
  cutAudio,
  searchYouTubeMP3,
  downloadYouTubeAudio,
  mergeAndSend,
  isAudioMessage,
  generateEndTimeButtons,
  generateTimeButtons,
  handleTikTokUrl,
  log,
  config,
} from "./utils";

const bot = new Telegraf(config.BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const pendingAskUsers = new Set<number>();
const aiModeUsers = new Set<number>();

bot.telegram.setMyCommands([
  { command: "start", description: "Show welcome message & help" },
  { command: "ask", description: "Ask AI anything" },
  { command: "exit", description: "Exit AI mode and return to normal" },
  { command: "search", description: "Search & download music from YouTube" },
  { command: "cut", description: "Trim audio: /cut start=00:30 end=01:20" },
  { command: "merge", description: "Merge multiple audios (TBD)" },
  { command: "mp3", description: "Download MP3 from URL" },
  { command: "video", description: "Download video from URL" },
]);

bot.use(async (ctx, next) => {
  const isText = ctx.updateType === "message" && "text" in ctx.message!;

  log("Incoming", {
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
      "\uD83E\uDD16 /ask — Ask AI (next message only)\n" +
      "\u2705 /exit — Exit AI mode and return to normal\n" +
      "\uD83C\uDFA7 /search <song name> — Find & download music\n" +
      "\uD83D\uDD0A /cut start=00:30 end=01:20 — Trim audio\n" +
      "\uD83D\uDCC2 /merge — Merge multiple audios (TBD)\n" +
      "\uD83C\uDFB5 /mp3 <url> — Download MP3\n" +
      "\uD83C\uDFAC /video <url> — Download video\n" +
      "You can also just send a song name to search directly."
  )
);

// ask command
bot.command("ask", (ctx) => {
  const userId = ctx.from.id;
  pendingAskUsers.add(userId);
  aiModeUsers.add(userId);
  ctx.reply(
    "🤖 Send me your question (AI will answer your next message only).\n" +
      "Or type /exit to stop AI mode."
  );
});

// exit command → leave AI mode
bot.command("exit", (ctx) => {
  const userId = ctx.from.id;
  pendingAskUsers.delete(userId);
  aiModeUsers.delete(userId);
  ctx.reply("✅ Exited AI mode. Back to normal.");
});

// text command
function splitMessage(text: string, chunkSize = 4000): string[] {
  const result: string[] = [];
  let start = 0;

  while (start < text.length) {
    result.push(text.slice(start, start + chunkSize));
    start += chunkSize;
  }

  return result;
}

bot.on("text", async (ctx, next) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  if (pendingAskUsers.has(userId) || aiModeUsers.has(userId)) {
    pendingAskUsers.delete(userId);

    const processingMsg = await ctx.reply("🤖 Thinking...");

    try {
      const result = await model.generateContent(text);
      const response = result?.response ? await result.response.text() : null;

      if (!response) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMsg.message_id,
          undefined,
          "No response. Please try again."
        );
        return;
      }

      const chunks = splitMessage(response, 4000);

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        chunks[0]
      );

      for (let i = 1; i < chunks.length; i++) {
        await ctx.reply(chunks[i]);
      }
    } catch (err: any) {
      console.error("Gemini API error:", err);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        `Error: ${err.message}`
      );
    }
    return;
  }

  if (text.startsWith("/")) return next();

  if (
    text.startsWith("http") &&
    (text.includes("youtube.com") || text.includes("youtu.be"))
  ) {
    return handleYouTubeUrl(ctx);
  }

  if (text.startsWith("http") && text.includes("tiktok.com")) {
    return handleTikTokUrl(ctx);
  }

  if (text.length < 2) {
    return ctx.reply(
      "❗ Please send a valid YouTube/TikTok URL or use a command."
    );
  }

  const processingMsg = await ctx.reply("⏳ Searching on Youtube ...");

  try {
    const result = await searchYouTubeMP3(text);
    if (!result) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        "No results found."
      );
    }

    if (result.tooLong) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        result.message
      );
      return;
    }

    await ctx.reply(result.message, { parse_mode: "Markdown" });
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      "🎵 Converting to MP3..."
    );

    const files = await downloadYouTubeAudio(result.url);
    if (!files.length) throw new Error("Failed to download audio.");

    await ctx.replyWithAudio({ source: files[0] });
    for (const file of files) unlink(file, (err) => err && console.error(err));

    await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
  } catch (err: any) {
    console.error(err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      `❌ Error: ${err.message}`
    );
  }
});

// video command size max > 20MB
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
        "No results found."
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
      `Error: ${err.message}`
    );
  }
});

// cut audio command
type AudioMessage = Message & { audio: { file_id: string } };

const userCutSelections = new Map<
  number,
  {
    start?: string;
    end?: string;
    audioMessage?: AudioMessage;
    audioDuration?: number;
  }
>();

bot.command("cut", async (ctx) => {
  const reply = ctx.message?.reply_to_message;

  if (!isAudioMessage(reply)) {
    return ctx.reply("❗ Please reply to an audio message with /cut command.");
  }

  const lastAudio = reply.audio;
  const processingMsg = await ctx.reply("⏳ Fetching audio info...");

  try {
    const link = await ctx.telegram.getFileLink(lastAudio.file_id);
    const filePath = join(process.cwd(), `${randomUUID()}.mp3`);

    const res = await fetch(link.href);
    if (!res.body) throw new Error("No response body");

    await new Promise<void>((resolve, reject) => {
      const fileStream = createWriteStream(filePath);
      res.body.pipe(fileStream).on("finish", resolve).on("error", reject);
    });

    const audioDuration = await getAudioDuration(filePath);
    unlink(filePath, () => {});

    const startButtons = generateTimeButtons(audioDuration);

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      undefined,
      "Select the *start time* for trimming:",
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard(startButtons).reply_markup,
      }
    );

    userCutSelections.set(ctx.from.id, {
      audioMessage: reply,
      audioDuration,
    });
  } catch (err: any) {
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      undefined,
      `Failed to fetch audio info: ${err.message}`
    );
  }
});

bot.on("callback_query", async (ctx) => {
  if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return;
  const data = ctx.callbackQuery.data!;
  if (!data.startsWith("cut_")) return;

  const userId = ctx.from?.id;
  if (!userId) return;
  if (!userCutSelections.has(userId)) {
    userCutSelections.set(userId, {});
  }

  const selection = userCutSelections.get(userId)!;

  // START selection
  if (data.startsWith("cut_start_")) {
    selection.start = data.replace("cut_start_", "");
    const startSeconds = timeStrToSeconds(selection.start);

    const audioDuration = selection.audioDuration ?? 0;
    const endButtons = generateEndTimeButtons(audioDuration, startSeconds);

    await ctx.editMessageText(
      `Start time set to *${selection.start}*.\nNow select the *end time*:`,
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard(endButtons).reply_markup,
      }
    );
  }

  // END selection
  else if (data.startsWith("cut_end_")) {
    selection.end = data.replace("cut_end_", "");
    await ctx.answerCbQuery(`End time set to ${selection.end}`);
  }

  // DONE
  else if (data === "cut_done") {
    if (!selection.start) {
      return ctx.answerCbQuery("Please select start time first.");
    }

    const lastAudio = selection.audioMessage?.audio;
    if (!lastAudio) {
      return ctx.answerCbQuery("Audio info missing.");
    }

    await ctx.editMessageText("⏳ Processing audio cut...");

    try {
      const link = await ctx.telegram.getFileLink(lastAudio.file_id);
      const filePath = join(process.cwd(), `cutted-${randomUUID()}.mp3`);

      const res = await fetch(link.href);
      if (!res.body) throw new Error("No response body");

      await new Promise<void>((resolve, reject) => {
        const fileStream = createWriteStream(filePath);
        res.body.pipe(fileStream).on("finish", resolve).on("error", reject);
      });

      const endTime =
        selection.end ?? secondsToTimeStr(selection.audioDuration ?? 0);

      const cutFile = await cutAudio(filePath, selection.start!, endTime);

      await ctx.replyWithAudio({ source: cutFile });

      unlink(filePath, () => {});
      unlink(cutFile, () => {});

      await ctx.editMessageText("Audio cut complete!");
    } catch (err: any) {
      await ctx.editMessageText(`Failed to cut audio: ${err.message}`);
    }

    userCutSelections.delete(userId);
  }

  // CANCEL
  else if (data === "cut_cancel") {
    await ctx.editMessageText("Cut operation cancelled.");
    userCutSelections.delete(userId);
  }

  await ctx.answerCbQuery();
});

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

// merege audios command
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
