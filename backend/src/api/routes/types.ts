import { RouteHandler } from "../utils";
import { HandlerContext } from "../../types";

export interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

export type DynamicRoute = {
  method: "GET" | "POST" | "DELETE";
  pattern: RegExp;
  handler: (ctx: HandlerContext, params: Record<string, string>) => Promise<Response>;
};
