import { HandlerContext } from "../../types";
import { getUserFromAuthHeader } from "../../services/auth";

export async function requireAuthOwner(ctx: HandlerContext) {
  const me = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!me) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return me;
}
