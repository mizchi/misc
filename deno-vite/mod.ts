import { exists, existsSync } from "jsr:@std/fs@0.223.0/exists";
import { join } from "jsr:@std/path";
import type { Plugin } from "npm:vite@5.2.10";
import json5 from "npm:json5@2.2.3";
// import denoJson from "./deno.json" with { type: "json" };

type JsrPkgMeta = {
  latest: string;
};

type JsrVersionMeta = {
  exports: Record<string, string>;
};

type ParsedJsrExpr = {
  prefix?: "jsr" | "npm";
  scope?: string;
  pkg: string;
  version?: string;
  path?: string;
}

type NpmRegistryJson = {
  "dist-tags": Record<string, string> & {
    latest: string;
  };
}

// TODO: Handle ^version
const MODULE_REGEX = /(?<prefix>jsr|npm)\:(\/)?((?<scope>@[^@/]+)\/)?(?<pkg>[^@\/\s]+)(@\^?(?<version>\d+\.\d+\.\d+([^\/\n\s]+)?))?(?<path>\/.*)?/;

function parseModuleExpr(expr: string): ParsedJsrExpr | undefined {
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

function toCachePath(str: string) {
  const u = new URL(str);
  return u.pathname.slice(1).replace(/[\s\/\:\~]/g, "_");
}

// "jsr:@std/path@0.223.0";
async function fetchWithCache(url: string, cacheDir: string) {
  const hashed = toCachePath(url);
  const cachePath = join(cacheDir, `${hashed}`);
  if (await exists(cachePath)) {
    return await Deno.readTextFile(cachePath);
  }
  const res = await fetch(url, {});
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  const text = await res.text();
  await Deno.writeTextFile(cachePath, text);
  return text;
}

async function fetchMetaWithCache(url: string, cacheDir: string): Promise<JsrPkgMeta | JsrVersionMeta> {
  const hashed = toCachePath(url);
  const cachePath = join(cacheDir, hashed);
  if (await exists(cachePath)) {
    return JSON.parse(await Deno.readTextFile(cachePath));
  }
  const { default: json } = await import(url, { with: { type: "json" } })
  await Deno.writeTextFile(cachePath, JSON.stringify(json));
  return json;
}

async function resolveJsrUrl(id: string, cacheDir: string) {
  // console.log("resolveId", id, importer);
  let { scope, pkg, version, path } = parseModuleExpr(id)!;
  // resolve latest version
  if (!version) {
    const meta = await fetchMetaWithCache(`https://jsr.io/${scope}/${pkg}/meta.json`, cacheDir) as JsrPkgMeta;
    version = meta.latest;
  }
  const versionMeta = await fetchMetaWithCache(`https://jsr.io/${scope}/${pkg}/${version}_meta.json`, cacheDir) as JsrVersionMeta;
  const entry = versionMeta.exports[path ?? "."];
  if (entry === undefined) {
    throw new Error(`Entry not found: ${path} in ${Object.keys(versionMeta.exports)}`);
  }
  const pathname = join(scope!, pkg, version, entry);
  return `https://jsr.io/${pathname}`;
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
    // exports: {".": "./mod.js"}
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
  return join(npmCacheDir, scope ?? "", pkg, version, path ?? "index.js");
}

function loadDenoJson() {
  let denoJson: any;
  if (existsSync(join(Deno.cwd(), "deno.json"))) {
    try {
      denoJson = json5.parse(Deno.readTextFileSync("deno.json"));
    } catch (e) {
      console.error("Failed to parse deno.json", e);
    }
  }
  if (existsSync(join(Deno.cwd(), "deno.jsonc"))) {
    try {
      denoJson = json5.parse(Deno.readTextFileSync("deno.jsonc"));
    } catch (e) {
      console.error("Failed to parse deno.jsonc", e);
    }
  }
  return denoJson
}

type Options = {
  cacheDir?: string;
}
export function viteDeno(opts: Options = {}) {
  const denoJson = loadDenoJson();

  const HOME = Deno.env.get("HOME");
  // console.log("HOME", HOME);

  const cacheDir = opts.cacheDir ?? join(HOME!, "Library/Caches/vite-deno", denoJson.version ?? "");
  try {
    Deno.mkdirSync(cacheDir, { recursive: true });
  } catch (e) {
    // console.error("Failed to create cache dir", e);
  }

  const plugin: Plugin = {
    name: "vite-deno",
    async resolveId(id, importer) {
      if (id.startsWith("@")) {
        const jsr = parseModuleExpr(`jsr:${id}`);
        if (jsr?.scope && jsr?.pkg) {
          const expr = denoJson?.imports?.[jsr.scope + '/' + jsr.pkg];
          if (expr) {
            return resolveJsrUrl(join(expr, jsr.path ?? ""), cacheDir);
          }
        }
      }
      if (importer?.startsWith("https://") && id.startsWith(".")) {
        const fromURL = new URL("./", importer);
        const newPathname = join(fromURL.pathname, id);
        fromURL.pathname = newPathname;
        return fromURL.toString();
      }
      if (id.startsWith("jsr:")) {
        return resolveJsrUrl(id, cacheDir);
      }
      // if (id.startsWith("/npm:")) {
      //   return resolveNpmUrl(id.slice(1));
      // }
    },
    async load(id) {
      if (id.startsWith("https://")) {
        let text = await fetchWithCache(id, cacheDir);
        return text;
        // return text.replace("\"npm:", "\"/npm:").replace("\'npm:", "\'/npm:")
        // return text;
      }
    },
    // transform(code, id) {
    //   return code.replace("\"npm:", "\"/npm:").replace("\'npm:", "\'/npm:")
    // },
  }
  return plugin;
}
