import dotenv from "dotenv";
dotenv.config();

export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN!,
  FFMPEG_PATH: "/usr/bin/ffmpeg",
  COOKIES_PATH: process.env.COOKIES_PATH,
  LOG_DIR: "log",
};
