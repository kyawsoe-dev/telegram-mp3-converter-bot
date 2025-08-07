import { Telegraf } from "telegraf";
import { config } from "./config";
import { log } from "./logger";
import { handleVideo } from "./utils/videoHandler";
import { handleYouTubeUrl } from "./utils/urlHandler";

const bot = new Telegraf(config.BOT_TOKEN);

bot.use(async (ctx, next) => {
  const isText = ctx.updateType === "message" && "text" in ctx.message!;

  log("Incoming update", {
    type: ctx.updateType,
    user: ctx.from?.username || ctx.from?.id,
    chatId: ctx.chat?.id,
    message: isText ? (ctx.message as any).text : "[non-text]",
  });

  try {
    await next();
  } catch (err) {
    log("Middleware error", err);
  }
});

bot.start((ctx) =>
  ctx.reply("🎵 Send a video or YouTube link to convert to MP3")
);

bot.on("video", handleVideo);
bot.on("text", handleYouTubeUrl);

bot.launch().then(() => log("✅ Bot is running..."));

process.once("SIGINT", () => {
  log("🛑 Bot stopped (SIGINT)");
  bot.stop("SIGINT");
});
process.once("SIGTERM", () => {
  log("🛑 Bot stopped (SIGTERM)");
  bot.stop("SIGTERM");
});
