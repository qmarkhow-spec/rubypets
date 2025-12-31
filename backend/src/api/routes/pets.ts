import { HandlerContext } from "../../types";
import { errorJson, okJson } from "../utils";
import { requireAuthOwner } from "./shared";
import { DynamicRoute, Route } from "./types";
import petsCategory from "../../data/pets-category.json";

async function petsCategoriesRoute(_ctx: HandlerContext): Promise<Response> {
  return okJson({ data: petsCategory }, 200);
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
  const body = (await ctx.request.json().catch(() => ({}))) as {
    pet_id?: string;
    owners_uuid?: string;
    class?: string;
    species?: string;
    breed?: string | null;
    name?: string;
    gender?: "male" | "female" | "unknown";
    birthday?: string;
    bio?: string | null;
    avatar_storage_key?: string;
    avatar_url?: string;
  };

  const petId = (body.pet_id ?? "").trim();
  const ownersUuid = (body.owners_uuid ?? "").trim();
  const petClass = (body.class ?? "").trim();
  const species = (body.species ?? "").trim();
  const breed = (body.breed ?? "").toString().trim() || null;
  const name = (body.name ?? "").trim();
  const gender = body.gender ?? "";
  const birthdayRaw = (body.birthday ?? "").trim();
  const bio = (body.bio ?? "").toString().trim() || null;
  const storageKey = (body.avatar_storage_key ?? "").trim();
  const avatarUrl = (body.avatar_url ?? "").trim();

  if (!petId || !ownersUuid || !petClass || !species || !name || !storageKey || !avatarUrl) {
    return errorJson("missing required fields", 400);
  }
  if (ownersUuid !== me.uuid) return errorJson("Forbidden", 403);
  if (!gender) return errorJson("gender required", 400);
  if (!["male", "female", "unknown"].includes(gender)) return errorJson("invalid gender", 400);
  if (!birthdayRaw) return errorJson("birthday required", 400);
  if (bio && bio.length > 200) return errorJson("bio too long", 400);

  let birthday: string | null = null;
  if (birthdayRaw && birthdayRaw !== "unknown") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw)) return errorJson("invalid birthday", 400);
    birthday = birthdayRaw;
  }

  const keyPrefix = `owners/${me.uuid}/pets/${petId}/`;
  if (!storageKey.startsWith(keyPrefix)) return errorJson("invalid avatar_storage_key", 400);
  const fileName = storageKey.slice(keyPrefix.length);
  if (!new RegExp(`^${petId}_avatar\\.(jpg|png|webp)$`).test(fileName)) {
    return errorJson("invalid avatar_storage_key", 400);
  }

  const base = getPublicMediaBase(ctx.env);
  const expectedUrl = `${base}/${storageKey}`;
  if (avatarUrl !== expectedUrl) return errorJson("avatar_url mismatch", 400);

  const existing = await ctx.db.getPetById(petId);
  if (existing) return errorJson("pet already exists", 409);

  const currentCount = await ctx.db.countActivePetsByOwner(me.uuid);
  if (currentCount >= me.maxPets) return errorJson("pet limit reached", 409);

  const head = await ctx.env.R2_MEDIA.head(storageKey);
  if (!head) return errorJson("avatar not found", 404);

  const asset = await ctx.db.createMediaAsset({
    ownerId: me.uuid,
    kind: "image",
    usage: "pet_avatar",
    storageProvider: "r2",
    storageKey,
    url: avatarUrl,
    mimeType: head.httpMetadata?.contentType ?? null,
    sizeBytes: head.size ?? null,
    status: "uploaded"
  });

  const pet = await ctx.db.createPet({
    id: petId,
    ownerId: me.uuid,
    name,
    class: petClass,
    species,
    breed,
    gender: gender as "male" | "female" | "unknown",
    birthday,
    avatarAssetId: asset.id,
    avatarUrl,
    bio
  });

  return okJson({ data: pet }, 201);
}

async function petDetailRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const pet = await ctx.db.getPetById(params.id);
  if (!pet) return errorJson("Not found", 404);
  return okJson({ data: pet }, 200);
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
  { method: "GET", pattern: /^\/pets\/(?!categories$)([^/]+)$/, handler: petDetailRoute }
];
