import { Injectable } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { AppConfigService } from "../../config/config.service";

const ACTIVATION_TOKEN_TTL_SECONDS = 72 * 60 * 60;
const ACTIVATION_TOKEN_TYPE = "activation";

/**
 * Signs and verifies the invite activation token (docs/16-AUTHENTICATION.md
 * "Staff activation") — a 72h-lived, RS256-signed JWT reusing the same
 * keypair as access tokens, distinguished by a `typ` claim so it can never
 * be accepted where an access token is expected, or vice versa.
 */
@Injectable()
export class ActivationTokenService {
  constructor(private readonly config: AppConfigService) {}

  sign(userId: string): string {
    return jwt.sign({ typ: ACTIVATION_TOKEN_TYPE }, this.config.env.JWT_PRIVATE_KEY, {
      algorithm: "RS256",
      subject: userId,
      expiresIn: ACTIVATION_TOKEN_TTL_SECONDS,
    });
  }

  /** Returns the invited User's id, or null if the token is missing/malformed/expired/wrong-typ. */
  verify(token: string): string | null {
    try {
      const decoded = jwt.verify(token, this.config.env.JWT_PUBLIC_KEY, { algorithms: ["RS256"] });
      if (typeof decoded === "string" || decoded.typ !== ACTIVATION_TOKEN_TYPE || !decoded.sub) {
        return null;
      }
      return decoded.sub;
    } catch {
      return null;
    }
  }
}
