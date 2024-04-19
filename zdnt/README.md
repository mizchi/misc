# zdnt

Zero Config Dnt wrapper

```
$ deno install -Af https://jsr.io/@mizchi/zdnt@0.0.4/zdnt.ts
```

## Usage

put `mod.ts`

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