import { Markup } from "telegraf";
import { secondsToTimeStr } from "./time";

export function generateTimeButtons(durationSec: number) {
  const buttons = [];
  const count = Math.min(5, Math.floor(durationSec / 30) + 1);

  for (let i = 0; i < count; i++) {
    const sec = Math.min(i * 30, durationSec);
    buttons.push(
      Markup.button.callback(
        secondsToTimeStr(sec),
        `cut_start_${secondsToTimeStr(sec)}`
      )
    );
  }

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  rows.push([Markup.button.callback("Custom", "cut_start_custom")]);

  return rows;
}

export function generateEndTimeButtons(durationSec: number, startSec: number) {
  const buttons = [];
  const count = Math.min(5, Math.floor((durationSec - startSec) / 30) + 1);

  for (let i = 1; i <= count; i++) {
    const sec = Math.min(startSec + i * 30, durationSec);
    buttons.push(
      Markup.button.callback(
        secondsToTimeStr(sec),
        `cut_end_${secondsToTimeStr(sec)}`
      )
    );
  }

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  rows.push([
    Markup.button.callback("Done", "cut_done"),
    Markup.button.callback("Cancel", "cut_cancel"),
  ]);

  return rows;
}
