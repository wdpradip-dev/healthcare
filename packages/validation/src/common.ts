import { z } from "zod";

/** Shared pagination query params — see docs/15-API-SPECIFICATION.md "Conventions". */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/** Shared `id` path-param shape (UUID v4 per docs/13-DATABASE-DESIGN.md conventions). */
export const idParamSchema = z.object({
  id: z.string().uuid(),
});

/** Shared error envelope — see docs/28-ERROR-HANDLING.md. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
