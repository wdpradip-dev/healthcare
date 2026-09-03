"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";
import { hasPermission } from "@/lib/permissions";
import { NAV_ITEMS } from "./nav-items";

/** Sidebar renders only modules the current permission set unlocks — docs/09-ADMIN-DESIGN-MOCKUPS.md "Shell". */
export function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(user, item.permission));

  return (
    <nav className="w-56 shrink-0 border-r border-outline/20 bg-surface-container p-4" aria-label="Main navigation">
      <ul className="flex flex-col gap-1">
        {visibleItems.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-primary-container text-on-surface" : "text-on-surface-variant hover:bg-primary-container/50"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
