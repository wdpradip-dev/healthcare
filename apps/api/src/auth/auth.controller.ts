import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UsePipes } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  revokeSessionParamsSchema,
  type RegisterInput,
  type VerifyOtpInput,
  type ResendOtpInput,
  type LoginInput,
  type RefreshInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@hospital/validation";
import { Public } from "../common/decorators/public.decorator";
import { Authenticated } from "../common/decorators/authenticated.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { RequestUser } from "../common/types/request-user";
import { AuthService, type RequestContext } from "./auth.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @RateLimit({ limit: 5, windowSeconds: 3600 })
  @Post("register")
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() body: RegisterInput, @Req() req: Request) {
    return this.authService.register(body, contextFrom(req));
  }

  @Public()
  @Post("verify-otp")
  @UsePipes(new ZodValidationPipe(verifyOtpSchema))
  verifyOtp(@Body() body: VerifyOtpInput, @Req() req: Request) {
    return this.authService.verifyOtp(body.otpChallengeId, body.code, contextFrom(req));
  }

  @Public()
  @RateLimit({ limit: 5, windowSeconds: 3600 })
  @Post("resend-otp")
  @UsePipes(new ZodValidationPipe(resendOtpSchema))
  resendOtp(@Body() body: ResendOtpInput) {
    return this.authService.resendOtp(body.otpChallengeId);
  }

  @Public()
  @RateLimit({ limit: 5, windowSeconds: 300 })
  @Post("login")
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: LoginInput, @Req() req: Request) {
    return this.authService.login(body, contextFrom(req));
  }

  @Public()
  @Post("refresh")
  @UsePipes(new ZodValidationPipe(refreshSchema))
  refresh(@Body() body: RefreshInput, @Req() req: Request) {
    return this.authService.refresh(body.refreshToken, contextFrom(req));
  }

  @Authenticated()
  @Post("logout")
  @HttpCode(200)
  logout(@Body() body: { sessionId: string }, @CurrentUser() user: RequestUser) {
    return this.authService.logout(body.sessionId, user.sub, user.roles[0] ?? "USER").then(() => ({ success: true }));
  }

  @Public()
  @RateLimit({ limit: 5, windowSeconds: 3600 })
  @Post("forgot-password")
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  forgotPassword(@Body() body: ForgotPasswordInput) {
    return this.authService.forgotPassword(body);
  }

  @Public()
  @Post("reset-password")
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  resetPassword(@Body() body: ResetPasswordInput, @Req() req: Request) {
    return this.authService.resetPassword(body, contextFrom(req)).then(() => ({ success: true }));
  }

  @Authenticated()
  @Get("sessions")
  getSessions(@CurrentUser() user: RequestUser) {
    return this.authService.getSessions(user.sub);
  }

  @Authenticated()
  @Delete("sessions/:id")
  revokeSession(@Param(new ZodValidationPipe(revokeSessionParamsSchema)) params: { id: string }, @CurrentUser() user: RequestUser) {
    return this.authService.revokeSession(user.sub, params.id).then(() => ({ success: true }));
  }

  @Authenticated()
  @Get("me")
  me(@CurrentUser() user: RequestUser) {
    return this.authService.me(user.sub);
  }
}

function contextFrom(req: Request): RequestContext {
  const platformHeader = req.headers["x-client-platform"];
  const platform = typeof platformHeader === "string" && ["IOS", "ANDROID", "WEB"].includes(platformHeader.toUpperCase())
    ? (platformHeader.toUpperCase() as RequestContext["platform"])
    : "WEB";

  return {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    platform,
  };
}
