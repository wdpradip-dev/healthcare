import { Global, Module } from "@nestjs/common";
import { AccessTokenService } from "./access-token.service";
import { ActivationTokenService } from "./activation-token.service";

@Global()
@Module({
  providers: [AccessTokenService, ActivationTokenService],
  exports: [AccessTokenService, ActivationTokenService],
})
export class JwtCommonModule {}
