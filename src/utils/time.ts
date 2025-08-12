export function timeStrToSeconds(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1) {
    return parts[0];
  }

  return 0;
}

export function secondsToTimeStr(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${padZero(h)}:${padZero(m)}:${padZero(s)}`
    : `${padZero(m)}:${padZero(s)}`;
}

export function padZero(num: number) {
  return num.toString().padStart(2, "0");
}
