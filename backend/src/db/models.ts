export interface User {
  id: string;
  handle: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  passwordHash?: string | null;
  createdAt: string;
}

export interface Post {
  id: string;
  authorId: string; // owner uuid
  body: string;
  mediaKey: string | null;
  createdAt: string;
  authorHandle?: string | null;
  authorDisplayName?: string | null;
}

export interface Owner {
  accountId: string;
  uuid: string;
  email?: string | null;
  passwordHash?: string | null;
  displayName: string;
  avatarUrl: string | null;
  maxPets: number;
  city?: string | null;
  region?: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: number;
  isVerified?: number;
  idLicenseFrontUrl?: string | null;
  idLicenseBackUrl?: string | null;
  faceWithLicenseUrl?: string | null;
}

export interface Account {
  accountId: string;
  email: string;
  passwordHash: string;
  phoneNumber?: string | null;
  isVerified: number;
  idLicenseFrontUrl?: string | null;
  idLicenseBackUrl?: string | null;
  faceWithLicenseUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
