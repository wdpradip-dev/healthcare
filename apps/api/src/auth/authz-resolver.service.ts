import { Injectable } from "@nestjs/common";
import type { Permission, SystemRole } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";

export interface ResolvedAuthz {
  hospitalId: string | null;
  roles: SystemRole[];
  permissions: Permission[];
}

/**
 * Resolves a User's effective roles and permissions — the union across every
 * role they hold, per docs/17-AUTHORIZATION-RBAC.md "Multiple roles per
 * user". Used to build JWT claims at login/refresh and to answer `GET /auth/me`.
 */
@Injectable()
export class AuthzResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string): Promise<ResolvedAuthz> {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    const roleSet = new Set<SystemRole>();
    const permissionSet = new Set<Permission>();

    for (const userRole of user.userRoles) {
      roleSet.add(userRole.role.key as SystemRole);
      for (const rolePermission of userRole.role.rolePermissions) {
        permissionSet.add(rolePermission.permission.key as Permission);
      }
    }

    return {
      hospitalId: user.hospitalId,
      roles: [...roleSet],
      permissions: [...permissionSet],
    };
  }
}
