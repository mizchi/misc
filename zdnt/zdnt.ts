import { join } from 'jsr:@std/path@0.223.0';
// ex. scripts/build_npm.ts
import { exists } from "jsr:@std/fs@0.223.0";
import * as dnt from "jsr:@deno/dnt@0.41.1";
import $ from 'jsr:@david/dax@0.40.0';
import { parse, increment, format, type ReleaseType } from "jsr:@std/semver@0.223.0";
import { parseArgs } from "node:util";
// import prettier from "npm:prettier@2.4.1";
import json5 from "npm:json5@2.2.0";
import json5writer from "npm:json5-writer@0.2.0";

enum UsingType {
  JSR,
  DenoJson,
  DenoJsonc,
  PackageJson,
}

type Using = {
  usingFile: string;
  usingType: UsingType;
}

const parsed = parseArgs({
  args: Deno.args,
  options: {
    user: { type: 'string', short: 'u', default: 'username' },
    type: { type: 'string', short: 't', default: 'patch' },
    dry: { type: 'boolean', short: 'd', default: false },
    npm: { type: 'boolean', short: 'n', default: false },
    shim: { type: 'boolean', default: false },
    test: { type: 'boolean', default: false },
    yes: { type: 'boolean', short: "y", default: false },
    typeCheck: { type: 'boolean', default: false },
  },
  allowPositionals: true
});

type ZdntOptions = Partial<Omit<dnt.BuildOptions, "package">> & {
  package: Partial<Omit<dnt.PackageJson, "name" | "version">> & {
    name: string;
    version: string;
  };
};

type ModuleParams = {
  using: Using | null;
  name: string | undefined,
  version: string | undefined;
  packageJson?: any;
}

export async function getModuleParams(root: string): Promise<ModuleParams> {
  const serchingFiles = [
    {
      name: "jsr.json",
      type: UsingType.JSR,
    },
    {
      name: "deno.json",
      type: UsingType.DenoJson,
    },
    {
      name: "deno.jsonc",
      type: UsingType.DenoJsonc,
    },
    {
      name: "package.json",
      type: UsingType.PackageJson,
    },
  ];

  let using: Using | null = null;
  // let usingFile: string | undefined = undefined;
  let version: string | undefined = undefined;
  let name: string | undefined = undefined;
  let packageJson: any = null;
  let usingType: UsingType = UsingType.JSR;
  for (const f of serchingFiles) {
    if (await exists(join(root, f.name))) {
      // usingFile = join(root, f.name);
      using = {
        usingFile: join(root, f.name),
        usingType: f.type,
      }
      usingType = f.type;
      name = await tryGetParamOfJson(join(root, f.name), "name")
      version = await tryGetParamOfJson(join(root, f.name), "version")
      break;
    }
  }
  if (await exists(join(root, "package.json"))) {
    packageJson = json5.parse(Deno.readTextFileSync(join(root, "package.json")));
  }

  return {
    using,
    name,
    version,
    packageJson,
  }

  async function tryGetParamOfJson(fpath: string, key: string): Promise<string | undefined> {
    try {
      if (await exists(fpath)) {
        const json = json5.parse(Deno.readTextFileSync(fpath));
        if (json[key]) {
          return json[key];
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
}

// async function getVersionFromGitTag(): Promise<string | undefined> {
//   const tags = await $`git tag`.lines();
//   const versions = tags
//     .filter((tag: string) => tag.startsWith('v'))
//     .map((tag: string) => tag.slice(1))
//     .map(parse);

//   // get latest
//   const v = reverseSort(versions)[0];
//   if (v) {
//     return format(v);
//   }
// }

export async function build_npm(opts: ZdntOptions) {
  await dnt.emptyDir("./npm");
  await dnt.build({
    scriptModule: false,
    entryPoints: ["./mod.ts"],
    outDir: "./npm",
    test: false,
    typeCheck: false,
    shims: {
      deno: {
        test: true,
      }
    },
    package: {
      type: "module",
      description: "simple template builder",
      license: "MIT",
      ...opts.package,
    },
    postBuild: async () => {
      // TODO: strip Deno.test
    }
  });
}

async function updateReadmeVersion(moduleName: string, version: string, dryrun = false) {
  const readmePath = join(Deno.cwd(), "README.md");
  const readme = Deno.readTextFileSync(readmePath);
  const updated = readme.replaceAll(
    new RegExp(`${moduleName}@[^/]+`, 'g'),
    `${moduleName}@${version}`,
  );
  if (dryrun) {
    log(`dry: writing ${readmePath}`)
    console.log(updated);
  } else {
    await Deno.writeTextFile(readmePath, updated);
  }
}

function getNextVersion(current: string, releaseType: ReleaseType): string {
  const v = parse(current);
  if (!v) {
    throw new Error(`Invalid version: ${current}`);
  }
  return format(increment(v, releaseType));
}

async function writeVersionInJson(fpath: string, version: string) {
  const content = await Deno.readTextFile(fpath);
  const json = json5.parse(content);
  const writer = json5writer.load(content);
  // json.version = version;
  writer.write({
    ...json,
    version: version,
  })
  // const formatted = prettier.format(JSON.stringify(json, null, 2), { parser: "json" });
  if (parsed.values.dry) {
    log(`dry: writing ${fpath.replace(Deno.cwd(), "")}`)
    console.log(writer.toSource());
  } else {
    log(`writing ${fpath.replace(Deno.cwd(), "")}`)
    await Deno.writeTextFile(fpath, writer.toSource());
  }
}

const log = (str: string) => console.log(`%c[zdnt] ${str}`, "color: gray");

function toReadablePath(p: string) {
  return p.replace(Deno.cwd() + "/", "");
}


const README = (user: string, libname: string) => `
# @${user}/${libname}

## Install

\`\`\`ts
import * as mod from "https://jsr.io/@${user}/${libname}@0.0.0/mod.ts";
\`\`\`

## Build

\`\`\`bash
$ zdnt
\`\`\`

## Release

\`\`\`bash
$ zdnt release
\`\`\`
`.trim();

// expect
const MOD_TS = () => `// zdnt generated
export const hello = () => "hello";
`;


const MOD_TEST_TS = (libname: string) => `
import { expect } from 'https://deno.land/std@0.214.0/expect/expect.ts';
import { hello } from "./mod.ts";
Deno.test("${libname}", () => {
  expect(hello()).toBe("hello");
});
`.trim();

if (import.meta.main) {
  // run command
  const first = parsed.positionals[0]
  const root = Deno.cwd();

  if (first === "new") {
    const target = parsed.positionals[1];
    const user = parsed.values.user ?? Deno.env.get("DENO_USER") ?? "username";
    if (!target) { throw new Error("target is required") }
    // create zdnt template
    await $`mkdir -p ${target}`;
    await $`mkdir -p ${target}/.vscode`;

    await Deno.writeTextFile(join(root, target, ".vscode/settings.json"), JSON.stringify({
      "deno.enable": true,
      "deno.lint": false,
    }, null, 2));

    await Deno.writeTextFile(join(root, target, "mod.ts"), MOD_TS());
    await Deno.writeTextFile(join(root, target, "mod.test.ts"), MOD_TEST_TS(target));
    // await Deno.writeTextFile(join(root, target, "jsr.json"), JSON.stringify(
    //   { name: `@${user}/${target}`, version: "0.0.0", "exports": "./mod.ts" }
    //   , null, 2));
    await Deno.writeTextFile(join(root, target, "deno.jsonc"), JSON.stringify({
      name: `@${user}/${target}`,
      version: "0.0.0",
      "exports": "./mod.ts",
      "tasks": {
        "test": "deno test",
        "release": "zdnt release",
      }
    }, null, 2));

    await Deno.writeTextFile(join(root, target, ".gitignore"), `node_modules\nnpm\n`);
    await Deno.writeTextFile(join(root, target, "README.md"), README(user, target));
    Deno.exit(0);
  }

  if (first === "check") {
    const params = await getModuleParams(Deno.cwd());
    if (!params.version || !params.name) throw new Error("version and name is required");
    if (!await exists(join(root, "deno.json"))
      || !await exists(join(root, "deno.jsonc"))
      || !await exists(join(root, "jsr.json"))
    ) {
      throw new Error("deno.json(c) or jsr.json is not found");
    }

    const nextVersion = getNextVersion(params.version!, parsed.values.type as ReleaseType ?? "patch");
    log(`version: ${params.version} -> ${nextVersion}`);
    log(`name: ${params.name}`);
    log(`using: ${params.using?.usingFile}`);
    Deno.exit(0);
  }

  const params = await getModuleParams(Deno.cwd());

  const yes = !!parsed.values.yes;
  if (!params.version || !params.name) throw new Error("version and name is required");
  const nextVersion = getNextVersion(params.version!, parsed.values.type as ReleaseType ?? "patch");


  // pre check: mod.ts
  if (!await exists(join(root, "mod.ts"))) {
    throw new Error("mod.ts is not found");
  }

  log("building npm by dnt");
  await build_npm({
    shims: parsed.values.shim ? { deno: true } : undefined,
    test: parsed.values.test,
    typeCheck: parsed.values.typeCheck ? "both" : false,
    package: {
      name: params.name,
      version: first === "release" ? nextVersion : params.version,
      ...params.packageJson,
    },
  });

  if (first === "test") {
    // TODO: test deno and node
    Deno.exit(0)
  }

  const fname = toReadablePath(params.using?.usingFile!);
  const options = [
    {
      id: "WRITE_JSON", text: `Write ${fname}'s version to ${nextVersion} `, selected: true,
    },
    { id: "WRITE_README", text: `Write README's version to ${nextVersion}`, selected: true },
    { id: "GIT_COMMIT", text: `Git commit READEM.md and ${fname} ${nextVersion}`, selected: true },

    { id: "RELEASE_JSR", text: "Release to jsr.io", selected: true },
    { id: "RELEASE_NPM", text: "Release to npm", selected: true },

    // { id: "GIT_TAG", text: "git tag", selected: false },
    // { id: "GIT_PUSH_ORIGIN", text: "git push origin --tags", selected: false },
  ] as const;
  if (first === "release") {
    const selects = yes
      ? options.map((_) => true)
      : await $.multiSelect({
        message: "Release",
        options: options.map((o) => ({ text: o.text, selected: o.selected })),
      });

    const selectedOptions = options.filter((_, i) => selects[i]);

    if (!params.using || !params.name) throw new Error("release command is not supported for package.json");

    // update jsr.json or deno.json or package.json
    if (selectedOptions.some((o) => o.id === "WRITE_JSON") && params.using.usingType !== UsingType.PackageJson) {
      await writeVersionInJson(params.using.usingFile, nextVersion);
    }

    // update README.md
    if (selectedOptions.some((o) => o.id === "WRITE_README")) {
      await updateReadmeVersion(params.name!, nextVersion, parsed.values.dry);
    }

    // update README.md
    if (selectedOptions.some((o) => o.id === "GIT_COMMIT")) {
      if (parsed.values.dry) {
        log(`dry: git add README.md ${params.using.usingFile}`);
        log(`dry: git commit -m "${'v' + nextVersion}"`);
      } else {
        await $`git add README.md ${params.using.usingFile}`;
        await $`git commit -m "${'v' + nextVersion}"`;
      }
    }

    // git tag
    // if (selectedOptions.some((o) => o.id === "GIT_TAG")) {
    //   if (parsed.values.dry) {
    //     log(`dry: git tag v${nextVersion}`);
    //   } else {
    //     await $`git tag v${nextVersion}`;
    //   }
    // }

    // // deno publish
    if (selectedOptions.some((o) => o.id === "RELEASE_JSR")) {
      if (yes || confirm(`deno publish?`)) {
        if (parsed.values.dry) {
          log(`dry: deno publish`);
        } else {
          await $`deno publish`;
        }
      }
    }

    // npm publish
    if (selectedOptions.some((o) => o.id === "RELEASE_NPM")) {
      $.cd(join(root, "npm"));
      if (parsed.values.dry) {
        log(`dry: npm publish --access public`);
      } else {
        await $`npm publish --access public`;
      }
      $.cd(root);
    }
  }
}