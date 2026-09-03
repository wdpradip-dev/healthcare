import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-provider";
import { QueryProvider } from "@/lib/query-provider";
import { HospitalScopeProvider } from "@/lib/hospital-scope";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hospital Platform — Admin Console",
  description: "Staff and administration console. See docs/06-ADMIN-PANEL-SPECIFICATION.md.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>
          <QueryProvider>
            <HospitalScopeProvider>{children}</HospitalScopeProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
