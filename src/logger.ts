import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { config } from "./config";

const logFile = join(process.cwd(), config.LOG_DIR, "bot.log");

export function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${message}`;

  if (!existsSync(config.LOG_DIR)) {
    mkdirSync(config.LOG_DIR, { recursive: true });
  }

  console.log(formatted, data ?? "");
  appendFileSync(
    logFile,
    `${formatted}${data ? " " + JSON.stringify(data) : ""}\n`
  );
}
