import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { config } from "./config";

function getLogFilePath(): string {
  const date = new Date();
  const fileName = `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.log`;

  return join(process.cwd(), config.LOG_DIR, fileName);
}

export function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${message}`;

  if (!existsSync(config.LOG_DIR)) {
    mkdirSync(config.LOG_DIR, { recursive: true });
  }
  const logFile = getLogFilePath();

  appendFileSync(
    logFile,
    `${formatted}${data ? " " + JSON.stringify(data) : ""}\n`
  );
}
