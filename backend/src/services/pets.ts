import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { Env } from "../../types";
import { Owner } from "../../db/models";

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

function getPublicMediaBase(env: Env): string {
  const raw = (env.R2_PUBLIC_BASE_URL ?? "https://media.rubypets.com").trim();
  return raw.replace(/\/+$/, "");
}

type CreatePetPayload = {
  pet_id: string;
  owners_uuid: string;
  class: string;
  species: string;
  breed: string | null;
  name: string;
  gender: "male" | "female" | "unknown";
  birthday: string;
  bio: string | null;
  avatar_storage_key: string;
  avatar_url: string;
};

export async function createPetForOwner(
  db: DrizzleD1Database<typeof schema>,
  env: Env,
  me: Owner,
  body: CreatePetPayload
) {
  const {
    pet_id,
    owners_uuid,
    "class": petClass,
    species,
    breed,
    name,
    gender,
    birthday: birthdayRaw,
    bio,
    avatar_storage_key: storageKey,
    avatar_url: avatarUrl
  } = body;

  if (!pet_id || !owners_uuid || !petClass || !species || !name || !storageKey || !avatarUrl) {
    throw Object.assign(new Error("missing required fields"), { status: 400 });
  }
  if (owners_uuid !== me.uuid) throw Object.assign(new Error("Forbidden"), { status: 403 });
  if (!gender) throw Object.assign(new Error("gender required"), { status: 400 });
  if (!["male", "female", "unknown"].includes(gender)) {
    throw Object.assign(new Error("invalid gender"), { status: 400 });
  }
  if (!birthdayRaw) throw Object.assign(new Error("birthday required"), { status: 400 });
  if (bio && bio.length > 200) throw Object.assign(new Error("bio too long"), { status: 400 });

  let birthday: string | null = null;
  if (birthdayRaw && birthdayRaw !== "unknown") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw)) {
      throw Object.assign(new Error("invalid birthday"), { status: 400 });
    }
    birthday = birthdayRaw;
  }

  const keyPrefix = `owners/${me.uuid}/pets/${pet_id}/`;
  if (!storageKey.startsWith(keyPrefix)) {
    throw Object.assign(new Error("invalid avatar_storage_key"), { status: 400 });
  }
  const fileName = storageKey.slice(keyPrefix.length);
  if (!new RegExp(`^${pet_id}_avatar\.(jpg|png|webp)$`).test(fileName)) {
    throw Object.assign(new Error("invalid avatar_storage_key"), { status: 400 });
  }

  const base = getPublicMediaBase(env);
  const expectedUrl = `${base}/${storageKey}`;
  if (avatarUrl !== expectedUrl) throw Object.assign(new Error("avatar_url mismatch"), { status: 400 });

  const existing = await db.getPetById(pet_id);
  if (existing) throw Object.assign(new Error("pet already exists"), { status: 409 });

  const currentCount = await db.countActivePetsByOwner(me.uuid);
  if (currentCount >= me.maxPets) throw Object.assign(new Error("pet limit reached"), { status: 409 });

  const head = await env.R2_MEDIA.head(storageKey);
  if (!head) throw Object.assign(new Error("avatar not found"), { status: 404 });

  const asset = await db.createMediaAsset({
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

  const pet = await db.createPet({
    id: pet_id,
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

  return pet;
}
