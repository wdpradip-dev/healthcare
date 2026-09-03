import { Injectable } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { parseDurationToMs } from "@hospital/shared";
import { AppConfigService } from "../../config/config.service";
import type { RequestUser } from "../types/request-user";

export interface AccessTokenClaims {
  sub: string;
  hospitalId: string | null;
  roles: RequestUser["roles"];
  permissions: RequestUser["permissions"];
}

/**
 * Signs and verifies the RS256 access token described in
 * docs/16-AUTHENTICATION.md "Tokens" / "Access token claims". Permissions are
 * embedded at issuance for fast in-process checks; AuthorizationGuard still
 * re-validates tenant/scope against live data per request — this service only
 * answers "is this token authentic and unexpired," never "is this action
 * actually allowed on this specific row."
 */
@Injectable()
export class AccessTokenService {
  constructor(private readonly config: AppConfigService) {}

  sign(claims: AccessTokenClaims): string {
    const jti = randomUUID();
    // jsonwebtoken's `expiresIn` types a plain string too narrowly for our
    // env-driven "15m"/"7d"-style config value — converting to a number of
    // seconds (via the same duration parser used for refresh-token TTLs)
    // sidesteps that without an `as` cast into an unsound type.
    const expiresInSeconds = parseDurationToMs(this.config.env.JWT_ACCESS_TOKEN_TTL) / 1000;
    return jwt.sign(claims, this.config.env.JWT_PRIVATE_KEY, {
      algorithm: "RS256",
      expiresIn: expiresInSeconds,
      jwtid: jti,
    });
  }

  verify(token: string): RequestUser {
    const decoded = jwt.verify(token, this.config.env.JWT_PUBLIC_KEY, {
      algorithms: ["RS256"],
    });
    if (typeof decoded === "string" || !decoded.jti) {
      throw new Error("Malformed access token payload.");
    }
    const payload = decoded as jwt.JwtPayload & AccessTokenClaims;
    return {
      sub: payload.sub as string,
      hospitalId: payload.hospitalId,
      roles: payload.roles,
      permissions: payload.permissions,
      jti: payload.jti as string,
    };
  }
}
