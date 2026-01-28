import { HandlerContext } from "../../types";
import { asNumber, errorJson, okJson } from "../utils";
import { getUserFromAuthHeader } from "../../services/auth";
import { requireAuthOwner } from "./shared";
import { DynamicRoute, Route } from "./types";
import { recordFriendRequest, sendPushNotification } from "../../services/notifications";

function canonicalPair(a: string, b: string) {
  if (a === b) return null;
  const ownerA = a < b ? a : b;
  const ownerB = a < b ? b : a;
  return { ownerA, ownerB, pairKey: `${ownerA}#${ownerB}` };
}

async function ownersSearchRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const url = new URL(ctx.request.url);
  const q = (url.searchParams.get("display_name") ?? "").trim().toLowerCase();
  const limit = Math.min(20, Math.max(10, asNumber(url.searchParams.get("limit"), 20)));

  if (q.length < 2) return okJson({ items: [] });

  const items = await ctx.db.searchOwnersByDisplayName(q, limit, me.uuid);
  return okJson({ items });
}

async function incomingRequestsRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const items = await ctx.db.listIncomingRequests(me.uuid, 50);
  return okJson({ items });
}

async function outgoingRequestsRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const items = await ctx.db.listOutgoingRequests(me.uuid, 50);
  return okJson({ items });
}

async function friendsListRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const url = new URL(ctx.request.url);
  const limit = Math.min(100, Math.max(1, asNumber(url.searchParams.get("limit"), 50)));
  const items = await ctx.db.listFriends(me.uuid, limit);
  const payload = items.map((item) => ({
    uuid: item.uuid,
    display_name: item.displayName,
    avatar_url: item.avatarUrl ?? null,
    city: item.city ?? null,
    region: item.region ?? null
  }));
  return okJson({ items: payload });
}

async function friendshipStatusRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const otherId = params.id;
  const pair = canonicalPair(me.uuid, otherId);
  if (!pair) return errorJson("Invalid target", 400);

  const row = await ctx.db.getFriendshipRowByPairKey(pair.pairKey);
  if (!row) return okJson({ status: "none" });

  if (row.status === "accepted") return okJson({ status: "friends" });

  if (row.requestedBy === me.uuid) return okJson({ status: "pending_outgoing" });
  return okJson({ status: "pending_incoming" });
}

async function sendFriendRequestRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const otherId = params.id;
  const pair = canonicalPair(me.uuid, otherId);
  if (!pair) return errorJson("Invalid target", 400);

  const existing = await ctx.db.getFriendshipRowByPairKey(pair.pairKey);
  if (existing) {
    if (existing.status === "accepted") return errorJson("Already friends", 409);
    if (existing.requestedBy === me.uuid) return okJson({ status: "pending_outgoing" });
    return okJson({ status: "pending_incoming" });
  }

  try {
    const friendshipId = await ctx.db.createFriendRequest({
      ownerA: pair.ownerA,
      ownerB: pair.ownerB,
      requestedBy: me.uuid,
      pairKey: pair.pairKey
    });
    if (friendshipId > 0 && otherId !== me.uuid) {
      try {
        const notif = await recordFriendRequest({
          db: ctx.env.DB,
          recipientId: otherId,
          actorId: me.uuid,
          friendshipId
        });
        ctx.ctx.waitUntil(sendPushNotification(ctx.env, ctx.env.DB, notif));
      } catch (err) {
        console.error("notifyFriendRequest failed", err);
      }
    }
  } catch (err) {
    return errorJson("Failed to create request", 500);
  }

  return okJson({ status: "pending_outgoing" });
}

async function cancelFriendRequestRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);

  const changes = await ctx.db.deletePendingRequest(pair.pairKey, me.uuid);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "none" });
}

async function acceptFriendRequestRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);

  const changes = await ctx.db.acceptPendingIncoming(pair.pairKey, me.uuid);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "friends" });
}

async function rejectFriendRequestRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);

  const changes = await ctx.db.deletePendingIncoming(pair.pairKey, me.uuid);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "none" });
}

async function unfriendRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);

  const changes = await ctx.db.deleteFriendship(pair.pairKey);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "none" });
}

async function ownerDetailRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const owner = await ctx.db.getOwnerByUuid(params.id);
  if (!owner) return errorJson("Not found", 404);
  return okJson({
    accountId: owner.accountId,
    uuid: owner.uuid,
    email: owner.email,
    displayName: owner.displayName,
    avatarUrl: owner.avatarUrl,
    maxPets: owner.maxPets,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
    isActive: owner.isActive,
    city: owner.city ?? null,
    region: owner.region ?? null,
    isVerified: owner.isVerified ?? 0,
    idLicenseFrontUrl: owner.idLicenseFrontUrl ?? null,
    idLicenseBackUrl: owner.idLicenseBackUrl ?? null,
    faceWithLicenseUrl: owner.faceWithLicenseUrl ?? null
  });
}

async function ownerPetsRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const owner = await ctx.db.getOwnerByUuid(params.id);
  if (!owner) return errorJson("Not found", 404);
  const items = await ctx.db.listPetsByOwner(params.id);
  return okJson({ items }, 200);
}

async function followedPetsRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const url = new URL(ctx.request.url);
  const limit = Math.min(50, Math.max(1, asNumber(url.searchParams.get("limit"), 20)));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw && Number.isFinite(Number(cursorRaw)) ? Number(cursorRaw) : null;

  const page = await ctx.db.listFollowedPets(me.uuid, limit, cursor);
  return okJson(page, 200);
}

async function ownerLocationRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const authed = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!authed || authed.uuid !== params.id) return errorJson("Forbidden", 403);
  const body = (await ctx.request.json()) as { city?: string; region?: string };
  if (!body.city || !body.region) return errorJson("city and region are required", 400);
  const owner = await ctx.db.updateOwnerLocation(params.id, body.city, body.region);
  return okJson({
    accountId: owner.accountId,
    uuid: owner.uuid,
    email: owner.email,
    displayName: owner.displayName,
    avatarUrl: owner.avatarUrl,
    maxPets: owner.maxPets,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
    isActive: owner.isActive,
    city: owner.city ?? null,
    region: owner.region ?? null,
    isVerified: owner.isVerified ?? 0,
    idLicenseFrontUrl: owner.idLicenseFrontUrl ?? null,
    idLicenseBackUrl: owner.idLicenseBackUrl ?? null,
    faceWithLicenseUrl: owner.faceWithLicenseUrl ?? null
  });
}

async function ownerVerificationDocsRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const authed = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!authed || authed.uuid !== params.id) return errorJson("Forbidden", 403);

  const owner = await ctx.db.getOwnerByUuid(params.id);
  if (!owner) return errorJson("Not found", 404);

  const form = await ctx.request.formData();
  const front = form.get("id_license_front");
  const back = form.get("id_license_back");
  const face = form.get("face_with_license");
  if (!(front instanceof File) || !(back instanceof File) || !(face instanceof File)) {
    return errorJson("all three images are required", 400);
  }

  const accountId = owner.accountId;
  const basePath = `${accountId}/verify_doc/pics`;
  const frontKey = `${basePath}/${accountId}_id_license_front.png`;
  const backKey = `${basePath}/${accountId}_id_license_back.png`;
  const faceKey = `${basePath}/${accountId}_face_with_license.png`;

  await Promise.all([
    ctx.env.R2_MEDIA.put(frontKey, front, { httpMetadata: { contentType: front.type || "image/png" } }),
    ctx.env.R2_MEDIA.put(backKey, back, { httpMetadata: { contentType: back.type || "image/png" } }),
    ctx.env.R2_MEDIA.put(faceKey, face, { httpMetadata: { contentType: face.type || "image/png" } })
  ]);

  const publicBase = ctx.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const toUrl = (key: string) => (publicBase ? `${publicBase}/${key}` : key);

  const frontUrl = toUrl(frontKey);
  const backUrl = toUrl(backKey);
  const faceUrl = toUrl(faceKey);

  await ctx.db.updateAccountVerificationUrls(accountId, {
    frontUrl,
    backUrl,
    faceUrl,
    setPending: true
  });

  return okJson(
    {
      idLicenseFrontUrl: frontUrl,
      idLicenseBackUrl: backUrl,
      faceWithLicenseUrl: faceUrl
    },
    200
  );
}

export const routes: Route[] = [
  { method: "GET", path: "/owners/search", handler: ownersSearchRoute },
  { method: "GET", path: "/me/followed-pets", handler: followedPetsRoute },
  { method: "GET", path: "/friendships/incoming", handler: incomingRequestsRoute },
  { method: "GET", path: "/friendships/outgoing", handler: outgoingRequestsRoute },
  { method: "GET", path: "/friendships/friends", handler: friendsListRoute }
];

export const dynamicRoutes: DynamicRoute[] = [
  { method: "GET", pattern: /^\/owners\/(?!search$)([^/]+)$/, handler: ownerDetailRoute },
  { method: "GET", pattern: /^\/owners\/([^/]+)\/pets$/, handler: ownerPetsRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/location$/, handler: ownerLocationRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/verification-docs$/, handler: ownerVerificationDocsRoute },
  { method: "GET", pattern: /^\/owners\/([^/]+)\/friendship\/status$/, handler: friendshipStatusRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/friend-request$/, handler: sendFriendRequestRoute },
  { method: "DELETE", pattern: /^\/owners\/([^/]+)\/friend-request$/, handler: cancelFriendRequestRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/friend-request\/accept$/, handler: acceptFriendRequestRoute },
  { method: "DELETE", pattern: /^\/owners\/([^/]+)\/friend-request\/reject$/, handler: rejectFriendRequestRoute },
  { method: "DELETE", pattern: /^\/owners\/([^/]+)\/friendship$/, handler: unfriendRoute }
];
