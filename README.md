# flect-example-notes

**Live:** https://flect-example-notes-6b6e4f.up.flect.run

The smallest possible **Flect database** example: a public notes app where the
whole data layer is three lines.

```ts
const env = createEnv()
const db  = await env.db('DB')     // an official @libsql/client — no URL, no secret
await db.execute('SELECT ...')
```

That's the point of this repo. No auth, no cache, no extra services — one app,
one database binding, and the official client. Each Flect feature gets its own
example this small; see `flect-example-counter` for KV.

## What it shows

- **`createEnv().db('DB')`** — the SDK resolves the binding through the broker
  at runtime. The image contains no connection string; Flect injects only
  `FLECT_TOKEN` and `FLECT_BROKER_URL`.
- **Plain SQL with the official client** — `db.execute` with parameterized
  queries; the schema is applied idempotently on boot.
- **Visitor spaces** — the app is public, so `GET /` gives each visitor a UUID
  space and redirects to `/<uuid>`, remembered in a cookie so returning to the
  homepage lands in the same space. All notes are scoped to that space, so two
  visitors never see each other's notes. (That's demo separation, not security
  — anyone holding the URL sees the space.)

## Run it on Flect

```bash
flect init                # declare the app + a [[databases]] binding named DB
docker build --platform linux/amd64 -t ghcr.io/you/flect-example-notes:0.1.0 .
docker push ghcr.io/you/flect-example-notes:0.1.0
flect deploy              # provisions the db, binds it, deploys → https://…up.flect.run
```

`flect.toml` needs exactly one binding:

```toml
scope = "examples/notes/prod"   # where it lives — deploy creates missing scopes

[[databases]]
binding = "DB"
name    = "notes-db"
```

## Code tour

Everything is [src/index.ts](./src/index.ts):

| part | lines of interest |
|---|---|
| resolve the database | `createEnv()` → `await env.db('DB')` |
| schema on boot | one `CREATE TABLE IF NOT EXISTS` |
| visitor space | `GET /` → cookie'd space, or `randomUUID()` + `Set-Cookie` → redirect `/<uuid>` |
| list / add / delete | three routes, all parameterized SQL scoped by `space` |
| UI | a single embedded HTML page calling the routes with `fetch` |

## Run it locally

```bash
npm install
flect dev        # writes flect.local.json → createEnv() resolves DB locally
node --experimental-strip-types src/index.ts
```
