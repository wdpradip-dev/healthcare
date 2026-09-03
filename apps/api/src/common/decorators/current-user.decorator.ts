import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { RequestUser } from "../types/request-user";

/** Injects the authenticated `RequestUser` into a controller method parameter. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const request = ctx.switchToHttp().getRequest<Request>();
  if (!request.user) {
    throw new Error("CurrentUser used on a route with no authenticated user — check guard ordering.");
  }
  return request.user;
});
