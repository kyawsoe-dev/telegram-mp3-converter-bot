import type { Message } from "telegraf/typings/core/types/typegram";
import axios from "axios";
import { writeFileSync, unlink } from "fs";
import path from "path";
import { Context } from "telegraf";
import dotenv from "dotenv";
dotenv.config();

function isTextMessage(msg: Message): msg is Message & { text: string } {
  return msg && typeof (msg as any).text === "string";
}

async function downloadFile(fileUrl: string, filename: string) {
  const res = await axios.get(fileUrl, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
      Referer: "https://www.tiktok.com/",
    },
  });
  writeFileSync(filename, res.data);
  return filename;
}

const TIKTOK_API_KEYS = (process.env.TIKTOK_API_KEYS || "").split(",");
let currentKeyIndex = 0;

async function fetchTikTokVideo(url: string) {
  const cleanUrl = url.split("?")[0];
  let attempts = 0;

  while (attempts < TIKTOK_API_KEYS.length) {
    const key = TIKTOK_API_KEYS[currentKeyIndex];
    try {
      const response = await axios.get(process.env.TIKTOK_VIDEO_API_URL!, {
        params: { url: cleanUrl },
        headers: { "X-PrimeAPI-Key": key },
      });
      return response.data;
    } catch (err: any) {
      if (
        err.response?.status === 429 ||
        err.response?.data?.error?.includes("limit")
      ) {
        console.warn(`Key ${key} reached limit, switching to next key...`);
        currentKeyIndex = (currentKeyIndex + 1) % TIKTOK_API_KEYS.length;
        attempts++;
      } else {
        throw err;
      }
    }
  }

  return null;
}

async function fetchTikTokPhoto(postId: string) {
  let attempts = 0;

  while (attempts < TIKTOK_API_KEYS.length) {
    const key = TIKTOK_API_KEYS[currentKeyIndex];
    try {
      const response = await axios.get(process.env.TIKTOK_PHOTOS_API_URL!, {
        params: { postId },
        headers: { "X-PrimeAPI-Key": key },
      });
      return response.data;
    } catch (err: any) {
      if (
        err.response?.status === 429 ||
        err.response?.data?.error?.includes("limit")
      ) {
        console.warn(`Key ${key} reached limit, switching to next key...`);
        currentKeyIndex = (currentKeyIndex + 1) % TIKTOK_API_KEYS.length;
        attempts++;
      } else {
        throw err;
      }
    }
  }

  return null;
}

async function fetchTikTokUserInfo(url: string) {
  const API_URL = process.env.DOWNLOADER_API_URL!;
  const response = await axios.post(API_URL, { url });
  const body = response.data;
  if (!body.status)
    throw new Error(body.error || "Failed to fetch TikTok info");
  return body.data;
}

async function resolveShortUrl(shortUrl: string) {
  try {
    const res = await axios.get(shortUrl, {
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const finalUrl = res.headers.location || shortUrl;
    const match = finalUrl.match(/\/(video|photo)\/(\d+)/);
    const postId = match ? match[2] : null;
    return { finalUrl, postId };
  } catch (err: any) {
    const finalUrl = err.response?.headers?.location || shortUrl;
    console.warn(`Failed to auto-resolve redirects, using: ${finalUrl}`);
    const match = finalUrl.match(/\/(video|photo)\/(\d+)/);
    const postId = match ? match[2] : null;
    return { finalUrl, postId };
  }
}

export async function handleTikTokUrl(ctx: Context) {
  const msg = ctx.message;
  if (!msg || !isTextMessage(msg))
    return ctx.reply("Please send a valid TikTok URL as text.");

  let url = msg.text.trim();
  if (!ctx.chat) return ctx.reply("Chat context missing.");

  const { finalUrl, postId } = await resolveShortUrl(url);
  url = finalUrl;

  let isPhoto = url.includes("/photo/");

  const processingMsg = await ctx.reply(
    `⏳ Fetching TikTok ${isPhoto ? "photo" : "video"}...`
  );

  try {
    const userInfo = await fetchTikTokUserInfo(url);

    if (isPhoto || !TIKTOK_API_KEYS.length) {
      const photoData = await fetchTikTokPhoto(postId);

      if (!photoData?.itemInfo?.itemStruct?.imagePost?.images?.length) {
        if (userInfo.video_img) {
          const photoPath = path.join("/tmp", `tiktok_${Date.now()}.jpg`);
          await downloadFile(userInfo.video_img, photoPath);
          await ctx.replyWithPhoto(
            { source: photoPath },
            { caption: `📸 TikTok Photo by @${userInfo.nick}` }
          );
          unlink(photoPath, () => {});
        }
      } else {
        const images = photoData.itemInfo.itemStruct.imagePost.images;
        for (const img of images) {
          const imgUrl = img.imageURL.urlList[0];
          if (!imgUrl) continue;

          const photoPath = path.join("/tmp", `tiktok_${Date.now()}.jpg`);
          await downloadFile(imgUrl, photoPath);
          await ctx.replyWithPhoto(
            { source: photoPath },
            { caption: `📸 TikTok Photo by @${userInfo.nick}` }
          );
          unlink(photoPath, () => {});
        }
      }
    } else {
      const videoData = await fetchTikTokVideo(url);
      if (!videoData || !videoData.play) {
        const photoPath = path.join("/tmp", `tiktok_${Date.now()}.jpg`);
        await downloadFile(userInfo.video_img, photoPath);
        await ctx.replyWithPhoto(
          { source: photoPath },
          { caption: `📸 TikTok Photo by @${userInfo.nick}` }
        );
        unlink(photoPath, () => {});
      } else {
        const videoPath = path.join("/tmp", `tiktok_${Date.now()}.mp4`);
        await downloadFile(videoData.play, videoPath);
        await ctx.replyWithVideo(
          { source: videoPath },
          {
            caption: `🎥 TikTok Video by @${userInfo.nick}\n${
              userInfo.video_info || ""
            }`,
          }
        );
        unlink(videoPath, () => {});
      }
    }

    await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
  } catch (err: any) {
    console.error(err);
    if (ctx.chat?.id && processingMsg.message_id) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        `Error: ${err.message}`
      );
    } else {
      await ctx.reply(`Something went wrong`);
    }
  }
}
