import { HandlerContext } from "../../types";
import { asNumber, errorJson, okJson } from "../utils";
import { getUserFromAuthHeader } from "../../services/auth";
import { requireAuthOwner } from "./shared";
import { DynamicRoute, Route } from "./types";
import petsCategory from "../../data/pets-category.json";
import { createPetForOwner } from "../../services/pets";

async function petsCategoriesRoute(_ctx: HandlerContext): Promise<Response> {
  return okJson(petsCategory, 200);
}

async function r2PetAvatarUploadRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const form = await ctx.request.formData().catch(() => null);
  if (!form) return errorJson("invalid form data", 400);

  const petId = (form.get("pet_id") ?? "").toString().trim();
  const file = form.get("file");
  if (!petId || !(file instanceof File)) {
    return errorJson("pet_id and file are required", 400);
  }

  const ext = imageMimeToExt(file.type || "");
  if (!ext) return errorJson("unsupported file type", 422);

  const key = `owners/${me.uuid}/pets/${petId}/${petId}_avatar.${ext}`;
  await ctx.env.R2_MEDIA.put(key, file, { httpMetadata: { contentType: file.type || undefined } });

  const base = getPublicMediaBase(ctx.env);
  const publicUrl = `${base}/${key}`;
  return okJson({ storage_key: key, public_url: publicUrl }, 200);
}

async function createPetsRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const body = await ctx.request.json();

  const pet = await createPetForOwner(ctx.db, ctx.env, me, body);

  return okJson(pet, 201);
}

async function petDetailRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const pet = await ctx.db.getPetById(params.id);
  if (!pet) return errorJson("Not found", 404);
  const authed = await getUserFromAuthHeader(ctx.db, ctx.request);
  const isFollowing = authed ? await ctx.db.isFollowingPet(authed.uuid, pet.id) : false;
  return okJson({ ...pet, isFollowing }, 200);
}

async function followPetRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const pet = await ctx.db.getPetById(params.id);
  if (!pet) return errorJson("Not found", 404);
  if (await ctx.db.isPetOwnedByOwner(pet.id, me.uuid)) {
    return errorJson("Cannot follow your own pet", 403);
  }
  // TODO: add block checks when block feature is available.

  const followersCount = await ctx.db.followPetTx(me.uuid, pet.id);
  return okJson({ petId: pet.id, isFollowing: true, followersCount }, 200);
}

async function unfollowPetRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const pet = await ctx.db.getPetById(params.id);
  if (!pet) return errorJson("Not found", 404);

  const followersCount = await ctx.db.unfollowPetTx(me.uuid, pet.id);
  return okJson({ petId: pet.id, isFollowing: false, followersCount }, 200);
}

async function petFollowersRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const pet = await ctx.db.getPetById(params.id);
  if (!pet) return errorJson("Not found", 404);

  const url = new URL(ctx.request.url);
  const limit = Math.min(50, Math.max(1, asNumber(url.searchParams.get("limit"), 20)));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw && Number.isFinite(Number(cursorRaw)) ? Number(cursorRaw) : null;

  const page = await ctx.db.listPetFollowers(pet.id, limit, cursor);
  return okJson(page, 200);
}

function imageMimeToExt(mimeType: string): "jpg" | "png" | "webp" | null {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

function getPublicMediaBase(env: HandlerContext["env"]): string {
  const raw = (env.R2_PUBLIC_BASE_URL ?? "https://media.rubypets.com").trim();
  return raw.replace(/\/+$/, "");
}

export const routes: Route[] = [
  { method: "GET", path: "/pets/categories", handler: petsCategoriesRoute },
  { method: "POST", path: "/r2/pets/avatar/upload", handler: r2PetAvatarUploadRoute },
  { method: "POST", path: "/create-pets", handler: createPetsRoute }
];

export const dynamicRoutes: DynamicRoute[] = [
  { method: "POST", pattern: /^\/pets\/([^/]+)\/follow$/, handler: followPetRoute },
  { method: "DELETE", pattern: /^\/pets\/([^/]+)\/follow$/, handler: unfollowPetRoute },
  { method: "GET", pattern: /^\/pets\/([^/]+)\/followers$/, handler: petFollowersRoute },
  { method: "GET", pattern: /^\/pets\/(?!categories$)([^/]+)$/, handler: petDetailRoute }
];
