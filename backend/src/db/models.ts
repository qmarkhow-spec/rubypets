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
  id: string;
  uuid: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  avatarUrl: string | null;
  maxPets: number;
  city?: string | null;
  region?: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: number;
}
