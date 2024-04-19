# zdnt

Zero Config Dnt wrapper

```bash
$ deno install -Afg https://raw.githubusercontent.com/mizchi/misc/main/zdnt/zdnt.ts
# Currently jsr.io does not support cli install
# $ deno install -Afg https://jsr.io/@mizchi/zdnt/0.0.4/zdnt.ts

```

## Usage

put `mod.ts` and deno.json

deno.json

```json
{
  "name": "@mizchi/zdnt",
  "version": "0.0.1",
  "exports": "./mod.ts"
}
```

```bash
$ zdnt # just build
$ zdnt release -d -y # Dry run
$ zdnt release       # publish to both jsr.io / npm.io
$ zdnt release -y    # All yes

# scaffold
$ zdnt new app -u mizchi
$ cd app
$ zdnt
```

## LICENSE

MIT