import { Injectable } from "@nestjs/common";
import { apiEnvSchema, loadEnv, type ApiEnv } from "@hospital/config";

/**
 * Thin injectable wrapper around `@hospital/config`'s validated env — see
 * docs/33-ENVIRONMENT-VARIABLES.md. Validated once at construction (module
 * init), not per-access, so a misconfigured deployment fails at startup.
 */
@Injectable()
export class AppConfigService {
  public readonly env: ApiEnv = loadEnv(apiEnvSchema);
}
