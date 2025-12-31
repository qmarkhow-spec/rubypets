import { D1Client } from "./d1-client";
import { DBClient } from "./interface";

type DBEnv = { DB: D1Database };

export function createDB(env: DBEnv): DBClient {
  return new D1Client(env.DB);
}

export type { DBClient } from "./interface";
export type { Post, User, Pet } from "./models";
