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
  authorId: string;
  body: string;
  mediaKey: string | null;
  createdAt: string;
  authorHandle?: string | null;
  authorDisplayName?: string | null;
}
