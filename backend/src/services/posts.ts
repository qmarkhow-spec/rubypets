import { Env } from "../types";

interface CreatePostInput {
  author_id: string;
  body: string;
  media_key?: string | null;
}

export async function listPosts(env: Env, limit = 20) {
  const stmt = env.DB.prepare(
    `
      select
        p.id,
        p.body,
        p.media_key as mediaKey,
        p.created_at as createdAt,
        u.display_name as authorDisplayName,
        u.handle as authorHandle
      from posts p
      left join users u on u.id = p.author_id
      order by p.created_at desc
      limit ?
    `
  ).bind(limit);

  const { results } = await stmt.all();
  return results ?? [];
}

export async function createPost(env: Env, input: CreatePostInput) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `
      insert into posts (id, author_id, body, media_key, created_at)
      values (?, ?, ?, ?, ?)
    `
  )
    .bind(id, input.author_id, input.body, input.media_key ?? null, createdAt)
    .run();

  return {
    id,
    body: input.body,
    mediaKey: input.media_key ?? null,
    createdAt,
    authorId: input.author_id
  };
}
