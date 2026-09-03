/** Masks an email or phone for display in API responses and logs (e.g. "al**@example.com"). */
export function maskIdentifier(identifier: string): string {
  if (identifier.includes("@")) {
    const [local, domain] = identifier.split("@");
    return `${local?.slice(0, 2) ?? ""}${"*".repeat(Math.max((local?.length ?? 2) - 2, 1))}@${domain}`;
  }
  return `${identifier.slice(0, -4).replace(/./g, "*")}${identifier.slice(-4)}`;
}
