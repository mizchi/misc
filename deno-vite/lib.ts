import { join } from "jsr:@std/path@0.223.0";

const MODULE_REGEX = /(?<prefix>jsr|npm)\:(\/)?((?<scope>@[^@/]+)\/)?(?<pkg>[^@\/\s]+)(@\^?(?<version>\d+\.\d+\.\d+([^\/\n\s]+)?))?(?<path>\/.*)?/;

type ParsedSpecifier = {
  prefix?: "jsr" | "npm";
  scope?: string;
  pkg: string;
  version?: string;
  path?: string;
}

export function parseSpecifier(expr: string): ParsedSpecifier | undefined {
  const match = MODULE_REGEX.exec(expr);

  if (!match) {
    return undefined;
  }
  const p = match.groups?.path;
  return {
    prefix: match.groups?.prefix! as "jsr" | "npm",
    scope: match.groups?.scope,
    pkg: match.groups?.pkg!,
    version: match.groups?.version ?? undefined,
    path: p?.startsWith("/") ? `.${p}` : undefined
  };
}

type NpmRegistryJson = {
  "dist-tags": Record<string, string> & {
    latest: string;
  };
}

export async function resolveNpmSpecifier(id: string) {
  const npmCacheDir = join(Deno.env.get("HOME")!, "Library/Caches/deno/npm/registry.npmjs.org");
  let { scope, pkg, version, path } = parseSpecifier(id)!;
  // resolve latest version
  if (!version) {
    const { default: registryJson } = await import(join(npmCacheDir, pkg, "registry.json"), {
      with: { type: "json" }
    }) as { default: NpmRegistryJson };
    version = registryJson["dist-tags"].latest;
  }
  const pkgJsonPath = join(npmCacheDir, scope ?? "", pkg, version, "package.json");
  const { default: pkgJson } = await import(pkgJsonPath, { with: { type: "json" } });

  if (!path) {
    if (pkgJson.exports && pkgJson.exports["."] || pkgJson.exports["./"]) {
      const exportExpr = pkgJson.exports["."] || pkgJson.exports["./"];
      if (typeof exportExpr === "string") {
        path = pkgJson.exports[exportExpr]
      } else if (typeof exportExpr.import === "string") {
        path = exportExpr.import;
      } else if (typeof exportExpr.default === "string") {
        path = exportExpr.default
      }
    }
    if (pkgJson.main) {
      path = pkgJson.main;
    }
    if (pkgJson.module) {
      path = pkgJson.module;
    }
  }
  console.log("[npm:resolved]", scope, pkg, version, path);
  return join(npmCacheDir, scope ?? "", pkg, version, path ?? "index.js");
}

