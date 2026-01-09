import {
  Comment,
  CommentThread,
  Post,
  ChatThread,
  ChatThreadParticipant,
  ChatThreadListItem,
  ChatMessage,
  ChatRequestState
} from "./models";

export interface CreatePostInput {
  authorId: string; // owner uuid
  body: string | null;
  visibility?: string;
  postType?: string;
  mediaCount?: number;
  originPostId?: string | null;
}

export interface DBClient {
  ping(): Promise<boolean>;
  createPost(input: CreatePostInput): Promise<Post>;
  getPostsByOwner(ownerUuid: string, limit?: number, currentOwnerUuid?: string): Promise<Post[]>;
  listRecentPosts(limit?: number, currentOwnerUuid?: string): Promise<Post[]>;
  getPostById(id: string): Promise<Post | null>;
  getCommentById(commentId: string, currentOwnerUuid?: string): Promise<Comment | null>;
  getLatestComment(postId: string, currentOwnerUuid?: string): Promise<Comment | null>;
  getOwnerByEmail(email: string): Promise<import("./models").Owner | null>;
  getOwnerByUuid(uuid: string): Promise<import("./models").Owner | null>;
  getOwnerByAccountId(accountId: string): Promise<import("./models").Owner | null>;
  searchOwnersByDisplayName(
    keyword: string,
    limit: number,
    excludeOwnerUuid: string
  ): Promise<import("./models").OwnerPublic[]>;
  getFriendshipRowByPairKey(pairKey: string): Promise<{ status: string; requestedBy: string } | null>;
  createFriendRequest(input: {
    ownerA: string;
    ownerB: string;
    requestedBy: string;
    pairKey: string;
  }): Promise<void>;
  deletePendingRequest(pairKey: string, requestedBy: string): Promise<number>;
  deletePendingIncoming(pairKey: string, me: string): Promise<number>;
  acceptPendingIncoming(pairKey: string, me: string): Promise<number>;
  deleteFriendship(pairKey: string): Promise<number>;
  listIncomingRequests(me: string, limit: number): Promise<import("./models").FriendshipRequestItem[]>;
  listOutgoingRequests(me: string, limit: number): Promise<import("./models").FriendshipRequestItem[]>;
  listFriends(me: string, limit: number): Promise<import("./models").OwnerPublic[]>;
  countActivePetsByOwner(ownerId: string): Promise<number>;
  listPetsByOwner(ownerId: string): Promise<Array<{ id: string; name: string; avatarUrl: string | null }>>;
  isPetOwnedByOwner(petId: string, ownerId: string): Promise<boolean>;
  isFollowingPet(followerOwnerId: string, petId: string): Promise<boolean>;
  followPetTx(followerOwnerId: string, petId: string): Promise<number>;
  unfollowPetTx(followerOwnerId: string, petId: string): Promise<number>;
  listFollowedPets(
    followerOwnerId: string,
    limit: number,
    cursor?: number | null
  ): Promise<{
    items: Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
      species: string | null;
      breed: string | null;
      followersCount: number;
      isActive: number;
    }>;
    nextCursor: string | null;
  }>;
  listPetFollowers(
    petId: string,
    limit: number,
    cursor?: number | null
  ): Promise<{
    items: Array<{ uuid: string; displayName: string; avatarUrl: string | null }>;
    nextCursor: string | null;
  }>;
  createPet(input: {
    id: string;
    ownerId: string;
    name: string;
    class?: string | null;
    species?: string | null;
    breed?: string | null;
    gender?: "male" | "female" | "unknown";
    birthday?: string | null;
    avatarAssetId?: string | null;
    avatarUrl?: string | null;
    bio?: string | null;
  }): Promise<import("./models").Pet>;
  getPetById(id: string): Promise<import("./models").Pet | null>;
  isFriends(ownerId: string, friendId: string): Promise<boolean>;
  hasLiked(postId: string, ownerId: string): Promise<boolean>;
  likePost(postId: string, ownerId: string): Promise<void>;
  unlikePost(postId: string, ownerId: string): Promise<void>;
  toggleLike(postId: string, ownerId: string): Promise<{ isLiked: boolean; likeCount: number }>;
  updateRepostCount(postId: string): Promise<number>;
  createComment(input: { postId: string; ownerId: string; content: string; parentCommentId?: string | null }): Promise<Comment>;
  toggleCommentLike(commentId: string, ownerId: string): Promise<{ isLiked: boolean; likeCount: number }>;
  listPostCommentsThread(
    postId: string,
    limit: number,
    cursor?: string | null,
    currentOwnerUuid?: string
  ): Promise<{ items: CommentThread[]; nextCursor: string | null; hasMore: boolean }>;
  createOwner(input: {
    accountId: string;
    uuid: string;
    displayName: string;
    avatarUrl?: string | null;
  }): Promise<import("./models").Owner>;
  createAccount(input: {
    accountId: string;
    email: string;
    passwordHash: string;
    realName?: string | null;
    idNumber?: string | null;
    phoneNumber?: string | null;
  }): Promise<import("./models").Account>;
  getAccountById(accountId: string): Promise<import("./models").Account | null>;
  getAccountByEmail(email: string): Promise<import("./models").Account | null>;
  createMediaAsset(input: {
    ownerId: string;
    kind: "image" | "video";
    usage: "avatar" | "pet_avatar" | "post" | "kyc" | "other";
    storageProvider: "r2" | "cf_media";
    storageKey: string;
    url?: string | null;
    thumbnailUrl?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
    status?: "uploaded" | "processing" | "ready" | "failed";
  }): Promise<import("./models").MediaAsset>;
  getMediaAssetsByIds(ids: string[]): Promise<import("./models").MediaAsset[]>;
  attachMediaToPost(postId: string, postType: "image_set" | "video", assetIds: string[]): Promise<void>;
  getAdminByAdminId(adminId: string): Promise<import("./models").AdminAccount & { passwordHash: string } | null>;
  updateAdminLastAt(adminId: string, ts: string): Promise<void>;
  updateAdminPassword(adminId: string, passwordHash: string): Promise<void>;
  updateAdminIpAllowlist(adminId: string, ipAllowlist: string | null): Promise<boolean>;
  updateOwnerLocation(ownerUuid: string, city: string, region: string): Promise<import("./models").Owner>;
  updateAccountVerificationUrls(
    accountId: string,
    urls: { frontUrl?: string | null; backUrl?: string | null; faceUrl?: string | null; setPending?: boolean }
  ): Promise<void>;
  updateAccountVerificationStatus(accountId: string, status: number): Promise<void>;
  countVerificationStatuses(): Promise<{ pending: number; verified: number; awaiting: number; failed: number }>;
  listVerifications(): Promise<
    Array<{
      accountId: string;
      realName: string | null;
      phoneNumber: string | null;
      idNumber: string | null;
      createdAt: string;
      isVerified: number;
    }>
  >;
  listAdminAccounts(): Promise<import("./models").AdminAccount[]>;
  createAdminAccount(input: { adminId: string; password: string; permission: string }): Promise<import("./models").AdminAccount>;
  listAdminIpAllowlist(): Promise<string[]>;

  // Chat
  getChatThreadById(threadId: string): Promise<ChatThread | null>;
  getChatThreadByPairKey(pairKey: string): Promise<ChatThread | null>;
  createChatThread(input: {
    threadId: string;
    ownerAId: string;
    ownerBId: string;
    pairKey: string;
    requestState: ChatRequestState;
    requestSenderId?: string | null;
    requestMessageId?: string | null;
    lastMessageId?: string | null;
    lastActivityAt?: string | null;
  }): Promise<ChatThread>;
  upsertChatParticipants(threadId: string, ownerAId: string, ownerBId: string): Promise<void>;
  getChatParticipant(threadId: string, ownerId: string): Promise<ChatThreadParticipant | null>;
  setParticipantArchived(threadId: string, ownerId: string, archivedAt: string | null): Promise<void>;
  setParticipantDeleted(threadId: string, ownerId: string, deletedAt: string | null): Promise<void>;
  setParticipantLastRead(threadId: string, ownerId: string, messageId: string | null): Promise<void>;
  clearParticipantsArchiveDeleted(threadId: string): Promise<void>;
  insertChatMessage(threadId: string, senderId: string, bodyText: string): Promise<ChatMessage>;
  getChatMessageById(messageId: string): Promise<ChatMessage | null>;
  listChatThreadsForOwner(
    ownerId: string,
    limit: number,
    cursor?: string | null,
    includeArchived?: boolean
  ): Promise<{ items: ChatThreadListItem[]; nextCursor: string | null }>;
  getChatThreadForOwner(threadId: string, ownerId: string): Promise<ChatThreadListItem | null>;
  listChatMessages(
    threadId: string,
    limit: number,
    beforeCursor?: string | null
  ): Promise<{ items: ChatMessage[]; nextCursor: string | null }>;
  updateChatThreadOnNewMessage(
    threadId: string,
    lastMessageId: string,
    options?: { requestMessageId?: string | null; requestSenderId?: string | null }
  ): Promise<void>;
  updateChatThreadRequestState(
    threadId: string,
    requestState: ChatRequestState,
    requestSenderId?: string | null,
    requestMessageId?: string | null
  ): Promise<void>;
}
