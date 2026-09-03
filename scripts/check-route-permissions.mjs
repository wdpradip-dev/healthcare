#!/usr/bin/env node
/**
 * Static check backing docs/17-AUTHORIZATION-RBAC.md's rule: "every
 * controller method has exactly one of @Public()/@Authenticated()/
 * @RequirePermission(...)". This is the "custom lint rule" referenced by
 * docs/41-TASKS.md task T-307 — implemented as a standalone TypeScript-AST
 * script (run via `pnpm --filter api lint`, see apps/api/package.json)
 * rather than a full local ESLint plugin package, since the check is narrow
 * and project-specific enough that the AST-walking script is simpler to
 * read and maintain than ESLint's plugin scaffolding for one rule.
 *
 * AuthorizationGuard (apps/api/src/common/guards/authorization.guard.ts)
 * fails closed at runtime if a route somehow reaches it with none of the
 * three — this script is what catches the mistake before that, at build time.
 */
import ts from "typescript";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiSrcDir = path.resolve(__dirname, "..", "apps", "api", "src");

const AUTH_DECORATORS = new Set(["Public", "Authenticated", "RequirePermission"]);
const HTTP_METHOD_DECORATORS = new Set(["Get", "Post", "Put", "Patch", "Delete", "Options", "Head", "All"]);

function decoratorNames(node) {
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
  if (!decorators) return [];
  return decorators.map((d) => {
    const expr = d.expression;
    const callee = ts.isCallExpression(expr) ? expr.expression : expr;
    return ts.isIdentifier(callee) ? callee.text : null;
  }).filter(Boolean);
}

function checkFile(filePath) {
  const sourceText = readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const violations = [];

  function visit(node) {
    if (ts.isClassDeclaration(node)) {
      const classAuthDecorators = decoratorNames(node).filter((n) => AUTH_DECORATORS.has(n));

      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const memberDecoratorNames = decoratorNames(member);
        const hasHttpMethod = memberDecoratorNames.some((n) => HTTP_METHOD_DECORATORS.has(n));
        if (!hasHttpMethod) continue;

        const methodAuthDecorators = memberDecoratorNames.filter((n) => AUTH_DECORATORS.has(n));
        const effective = methodAuthDecorators.length > 0 ? methodAuthDecorators : classAuthDecorators;

        const methodName = member.name && ts.isIdentifier(member.name) ? member.name.text : "<unknown>";
        const { line } = sourceFile.getLineAndCharacterOfPosition(member.getStart());

        if (effective.length === 0) {
          violations.push(
            `${filePath}:${line + 1} — ${node.name?.text}.${methodName} has an HTTP method decorator but none of @Public()/@Authenticated()/@RequirePermission().`,
          );
        } else if (effective.length > 1) {
          violations.push(
            `${filePath}:${line + 1} — ${node.name?.text}.${methodName} has more than one of @Public()/@Authenticated()/@RequirePermission() (${effective.join(", ")}) — exactly one is required.`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

const controllerFiles = globSync("**/*.controller.ts", { cwd: apiSrcDir }).map((f) => path.join(apiSrcDir, f));

if (controllerFiles.length === 0) {
  console.log("[check-route-permissions] No controller files found — nothing to check.");
  process.exit(0);
}

const allViolations = controllerFiles.flatMap(checkFile);

if (allViolations.length > 0) {
  console.error(`[check-route-permissions] ${allViolations.length} violation(s) found:\n`);
  for (const violation of allViolations) {
    console.error(`  ${violation}`);
  }
  process.exit(1);
}

console.log(`[check-route-permissions] OK — checked ${controllerFiles.length} controller file(s), all routes are properly guarded.`);
