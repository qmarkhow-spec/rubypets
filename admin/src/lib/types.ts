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
