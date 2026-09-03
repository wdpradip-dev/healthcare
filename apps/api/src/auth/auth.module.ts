import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpService } from "./otp.service";
import { RefreshTokenService } from "./refresh-token.service";
import { AuthzResolverService } from "./authz-resolver.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, OtpService, RefreshTokenService, AuthzResolverService],
  exports: [AuthzResolverService, OtpService, RefreshTokenService],
})
export class AuthModule {}
