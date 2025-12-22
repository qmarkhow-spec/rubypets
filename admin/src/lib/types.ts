export type HealthStatus = {
  ok: boolean;
  environment: string;
  d1: boolean;
  r2: boolean;
  ts: string;
};

export type OwnerSummary = {
  uuid: string;
  displayName: string;
  email: string;
  city?: string | null;
  region?: string | null;
  isVerified: boolean;
  lastUpdate: string;
  risk?: "low" | "medium" | "high";
};

export type ReviewSummary = {
  pending: number;
  verified: number;
  awaiting: number;
  failed: number;
  ts: string;
};

export type KycPendingItem = {
  accountId: string;
  realName: string | null;
  phoneNumber: string | null;
  idNumber: string | null;
  createdAt: string;
  isVerified: number;
};

export type KycDetail = {
  accountId: string;
  realName: string | null;
  idNumber: string | null;
  phoneNumber: string | null;
  isVerified: number;
  idLicenseFrontUrl: string | null;
  idLicenseBackUrl: string | null;
  faceWithLicenseUrl: string | null;
  createdAt: string | null;
};

export type AdminPost = {
  id: string;
  authorId: string;
  authorDisplayName?: string | null;
  body?: string | null;
  content?: string | null;
  postType?: string | null;
  mediaCount?: number | null;
  mediaUrls?: string[];
  isDeleted?: number;
  createdAt: string;
};
