import { HandlerContext } from "../../types";
import { errorJson, okJson } from "../utils";
import {
  getUserFromAuthHeader,
  loginUser,
  parseLoginPayload,
  parseRegisterAccountOnlyPayload,
  parseRegisterPayload,
  parseRegisterOwnerPayload,
  registerAccountOnly,
  registerOwnerForAccount,
  registerUser,
  toPublicOwner
} from "../../services/auth";
import { Route } from "./types";

async function registerRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const payload = await parseRegisterPayload(ctx.request);
    const { owner, tokens } = await registerUser(ctx.db, payload);
    return okJson({ user: owner, ...tokens }, 201);
  } catch (err) {
    return errorJson((err as Error).message, 400);
  }
}

async function registerAccountRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const payload = await parseRegisterAccountOnlyPayload(ctx.request);
    const account = await registerAccountOnly(ctx.db, payload);
    return okJson({ account }, 201);
  } catch (err) {
    return errorJson((err as Error).message, 400);
  }
}

async function registerOwnerRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const payload = await parseRegisterOwnerPayload(ctx.request);
    const { owner, tokens } = await registerOwnerForAccount(ctx.db, payload);
    return okJson({ user: owner, ...tokens }, 201);
  } catch (err) {
    return errorJson((err as Error).message, 400);
  }
}

async function loginRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const payload = await parseLoginPayload(ctx.request);
    const { owner, tokens } = await loginUser(ctx.db, payload);
    return okJson({ user: owner, ...tokens }, 200);
  } catch (err) {
    const message = (err as Error).message;
    const status = message === "invalid credentials" ? 401 : 400;
    return errorJson(message, status);
  }
}

async function meRoute(ctx: HandlerContext): Promise<Response> {
  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!user) return errorJson("Unauthorized", 401);
  return okJson(toPublicOwner(user), 200);
}

export const routes: Route[] = [
  { method: "POST", path: "/auth/register", handler: registerRoute },
  { method: "POST", path: "/auth/register/account", handler: registerAccountRoute },
  { method: "POST", path: "/auth/register/owner", handler: registerOwnerRoute },
  { method: "POST", path: "/auth/login", handler: loginRoute },
  { method: "GET", path: "/me", handler: meRoute }
];
