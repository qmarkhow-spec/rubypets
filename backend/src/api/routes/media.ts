import { HandlerContext } from "../../types";
import { errorJson, okJson } from "../utils";
import { getUserFromAuthHeader } from "../../services/auth";
import { DynamicRoute, Route } from "./types";

async function mediaImagesInitRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const user = await getUserFromAuthHeader(ctx.db, ctx.request);
    if (!user) return errorJson("Unauthorized", 401);

    const body = (await ctx.request.json().catch(() => ({}))) as any;
    const usage = (body.usage ?? "").trim();
    const file = body.file ?? {};

    if (!["avatar", "pet_avatar", "post", "kyc", "other"].includes(usage)) {
      return errorJson("invalid usage", 400);
    }
    if (!file.filename || !file.mime_type || typeof file.size_bytes !== "number") {
      return errorJson("file.filename, file.mime_type, size_bytes are required", 400);
    }
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mime_type)) {
      return errorJson("unsupported mime_type", 422);
    }

    const cfAccountId = ctx.env.CF_ACCOUNT_ID;
    const cfToken = ctx.env.CF_API_TOKEN;
    const cfImagesHash = ctx.env.CF_IMAGES_ACCOUNT_HASH;
    if (!cfAccountId || !cfToken || !cfImagesHash) return errorJson("cloudflare images not configured", 500);

    const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v2/direct_upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfToken}` }
    });
    const cfJson = (await cfResp.json().catch(() => ({}))) as any;
    if (!cfResp.ok || !cfJson?.success) {
      console.error("CF Images init failed", cfJson);
      return errorJson("cloudflare images init failed", 502);
    }
    const cfImageId = cfJson.result?.id;
    const uploadUrl = cfJson.result?.uploadURL;
    if (!cfImageId || !uploadUrl) return errorJson("cloudflare images init missing uploadURL", 502);

    const asset = await ctx.db.createMediaAsset({
      ownerId: user.uuid,
      kind: "image",
      usage: usage as any,
      storageProvider: "cf_media",
      storageKey: cfImageId,
      url: `https://imagedelivery.net/${cfImagesHash}/${cfImageId}/${pickImageVariant(usage)}`,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      status: "uploaded"
    });

    return okJson({ data: { asset_id: asset.id, upload_url: uploadUrl } }, 201);
  } catch (err) {
    console.error("mediaImagesInit error", err);
    return errorJson((err as Error).message, 500);
  }
}

async function mediaVideosInitRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const user = await getUserFromAuthHeader(ctx.db, ctx.request);
    if (!user) return errorJson("Unauthorized", 401);

    const body = (await ctx.request.json().catch(() => ({}))) as any;
    const usage = (body.usage ?? "").trim();
    const file = body.file ?? {};

    if (usage !== "post") return errorJson("video upload only supports usage=post for now", 400);
    if (!file.filename || !file.mime_type || typeof file.size_bytes !== "number") {
      return errorJson("file.filename, file.mime_type, size_bytes are required", 400);
    }

    const cfAccountId = ctx.env.CF_ACCOUNT_ID;
    const cfToken = ctx.env.CF_API_TOKEN;
    if (!cfAccountId || !cfToken) return errorJson("cloudflare stream not configured", 500);
    const cfStreamSubdomain = ctx.env.CF_STREAM_SUBDOMAIN; // e.g. abc123 or customer-abc123.cloudflarestream.com

    const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/direct_upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ maxDurationSeconds: 60, creator: user.uuid })
    });
    const cfJson = (await cfResp.json().catch(() => ({}))) as any;
    if (!cfResp.ok || !cfJson?.success) {
      console.error("CF Stream init failed", cfJson);
      return errorJson("cloudflare stream init failed", 502);
    }
    const uid = cfJson.result?.uid;
    const uploadUrl = cfJson.result?.uploadURL;
    if (!uid || !uploadUrl) return errorJson("cloudflare stream init missing uploadURL", 502);

    const streamUrl =
      cfStreamSubdomain && uid
        ? `https://customer-${normalizeStreamSubdomain(cfStreamSubdomain)}.cloudflarestream.com/${uid}/manifest/video.m3u8`
        : null;

    const asset = await ctx.db.createMediaAsset({
      ownerId: user.uuid,
      kind: "video",
      usage: "post",
      storageProvider: "cf_media",
      storageKey: uid,
      url: streamUrl,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      status: "processing"
    });

    return okJson({ data: { asset_id: asset.id, upload_url: uploadUrl } }, 201);
  } catch (err) {
    console.error("mediaVideosInit error", err);
    return errorJson((err as Error).message, 500);
  }
}

async function mediaUploadStubRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  // Accept upload (stub) and mark ready
  const assetId = params.id;
  try {
    const form = await ctx.request.formData().catch(() => null);
    if (!form) return okJson({ ok: true }, 200);
    // In a real implementation, stream to Cloudflare. Here we just mark as ready.
    return okJson({ ok: true, asset_id: assetId }, 200);
  } catch (err) {
    console.error("mediaUploadStub error", err);
    return errorJson((err as Error).message, 500);
  }
}

function pickImageVariant(usage: string): string {
  switch (usage) {
    case "avatar":
      return "OwnerAvatar256";
    case "pet_avatar":
      return "PetAvatar256";
    case "post":
      return "Post1080";
    case "kyc":
      return "KYCMax1600";
    default:
      return "public";
  }
}

function normalizeStreamSubdomain(value: string): string {
  let sub = value.trim();
  sub = sub.replace(/^https?:\/\//, "");
  sub = sub.replace(/\.cloudflarestream\.com.*$/i, "");
  sub = sub.replace(/^customer-/, "");
  return sub;
}

export const routes: Route[] = [
  { method: "POST", path: "/media/images/init", handler: mediaImagesInitRoute },
  { method: "POST", path: "/media/videos/init", handler: mediaVideosInitRoute }
];

export const dynamicRoutes: DynamicRoute[] = [
  { method: "POST", pattern: /^\/media\/upload\/([^/]+)$/, handler: mediaUploadStubRoute }
];
