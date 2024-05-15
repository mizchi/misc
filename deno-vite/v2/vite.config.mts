import { defineConfig, Plugin } from "npm:vite@5.2.10";
import { createGraph, load, type ModuleGraphJson, type ModuleJson } from "jsr:@deno/graph@0.74.4";
import { join } from "jsr:@std/path@0.223.0";
// import commonjs from 'npm:@rollup/plugin-commonjs@17.0.0';
import commonjs from 'npm:vite-plugin-commonjs@0.10.1';

// resolve any entry
function plugin_v1() {
  return {
    name: 'deno-resolve',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (importer?.startsWith('https://') && id.startsWith('.')) {
        return new URL(id, importer).toString();
      }
      if (id.startsWith('jsr:')) {
        const resolved = await createGraph(id);

        console.log("[jsr:resolved]", resolved);
        return resolved.redirects[id]
      }
    },
    async load(id) {
      if (id.startsWith('https')) {
        const loaded = await load(id);
        if (loaded?.kind === "module") {
          return loaded.content;
        } else {
          throw new Error("Failed to load module");
        }
      }
    },
  } as Plugin
}

function plugin_v2() {
  const resolver = new Map<string, string>();
  const resolveWithCache = async (id: string) => {
    if (resolver.has(id)) {
      console.log("[jsr:cache]", id);
      return resolver.get(id);
    }
    const resolved = await createGraph(id);
    for (const [from, to] of Object.entries(resolved.redirects)) {
      console.log("[jsr:resolved:add]", from, to);
      resolver.set(from, to);
    }
    return resolved.redirects[id];
  }
  return {
    name: 'deno-resolve',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (importer?.startsWith('https://') && id.startsWith('.')) {
        return new URL(id, importer).toString();
      }
      if (id.startsWith('jsr:')) {
        return resolveWithCache(id);
      }
    },
    async load(id) {
      if (id.startsWith('https')) {
        const loaded = await load(id);
        if (loaded?.kind === "module") {
          return loaded.content;
        } else {
          throw new Error("Failed to load module");
        }
      }
    },
  } as Plugin
}

// with npm
function plugin_v3() {
  const resolver = new Map<string, string>();
  const resolveWithCache = async (id: string) => {
    if (resolver.has(id)) {
      console.log("[jsr:cache]", id);
      return resolver.get(id);
    }
    const resolved = await createGraph(id);
    for (const [from, to] of Object.entries(resolved.redirects)) {
      console.log("[jsr:resolved:add]", from, to);
      resolver.set(from, to);
    }
    return resolved.redirects[id];
  }
  return {
    name: 'deno-resolve',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (importer?.startsWith('https://') && id.startsWith('.')) {
        return new URL(id, importer).toString();
      }
      if (id.startsWith('jsr:')) {
        return resolveWithCache(id);
      }
      if (id.startsWith('npm:')) {
        console.log("[npm:resolve]", id);
        const parsed = parseModuleExpr(id);
        if (parsed?.version == null) {
          throw new Error("Version is required");
        }
        if (parsed?.prefix === "npm") {
          console.log("[npm:resolve:parsed]", parsed);
          const resolved = await resolveNpmUrl(id);
          return resolved;
        }
      }
    },
    async load(id) {
      if (id.startsWith('https')) {
        const loaded = await load(id);
        if (loaded?.kind === "module") {
          return loaded.content;
        } else {
          throw new Error("Failed to load module");
        }
      }
    },
  } as Plugin
}

export default defineConfig({
  build: {
    lib: {
      entry: "./main.ts",
      formats: ["es"]
    }
  },
  plugins: [plugin_v3(), commonjs()]
});

// TODO: Handle ^version
const MODULE_REGEX = /(?<prefix>jsr|npm)\:(\/)?((?<scope>@[^@/]+)\/)?(?<pkg>[^@\/\s]+)(@\^?(?<version>\d+\.\d+\.\d+([^\/\n\s]+)?))?(?<path>\/.*)?/;

type ParsedExpr = {
  prefix?: "jsr" | "npm";
  scope?: string;
  pkg: string;
  version?: string;
  path?: string;
}

function parseModuleExpr(expr: string): ParsedExpr | undefined {
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

async function resolveNpmUrl(id: string) {
  const npmCacheDir = join(Deno.env.get("HOME")!, "Library/Caches/deno/npm/registry.npmjs.org");
  let { scope, pkg, version, path } = parseModuleExpr(id)!;
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

