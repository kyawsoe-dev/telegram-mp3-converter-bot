import ffprobe from "fluent-ffmpeg";

export function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffprobe.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata?.format?.duration;
      if (!duration) return reject(new Error("Cannot get audio duration"));
      resolve(duration);
    });
  });
}
