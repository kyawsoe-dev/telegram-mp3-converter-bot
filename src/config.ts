import dotenv from "dotenv";
dotenv.config();

export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN!,
  FFMPEG_PATH: "/usr/bin/ffmpeg",
  LOG_DIR: "log",
};
