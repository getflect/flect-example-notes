// flect-example-notes — the smallest Flect DATABASE example.
//
// The entire data layer is: createEnv() → env.db('DB') → the official
// @libsql/client, already scoped to this app's database. No URL, no secret,
// no config — Flect injects only FLECT_TOKEN + FLECT_BROKER_URL and the SDK
// resolves the binding at runtime.
//
// The app is public, so each visitor gets their own note space: GET / mints a
// UUID and redirects to /<uuid>; every query is scoped by that space so two
// visitors never see each other's notes (demo separation, not security).
import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { serve } from "@hono/node-server"
import { createEnv } from "@getflect/sdk"
import type { Client } from "@libsql/client"

const env = createEnv()
const db = await env.db<Client>("DB")   // official @libsql/client → this app's database

await db.execute(
  "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, space TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL)",
)
await db.execute("CREATE INDEX IF NOT EXISTS notes_space ON notes (space)")

const SPACE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const app = new Hono()
app.get("/healthz", (c) => c.json({ ok: true, service: "flect-example-notes" }))

// Every visitor gets their own space — remembered in a cookie, so coming back
// to the homepage returns to the same space instead of minting a new one.
app.get("/", (c) => {
  const existing = getCookie(c, "space")
  if (existing && SPACE.test(existing)) return c.redirect(`/${existing}`)
  const space = randomUUID()
  c.header("Set-Cookie", `space=${space}; Path=/; Max-Age=31536000; SameSite=Lax`)
  return c.redirect(`/${space}`)
})

app.get("/:space/notes", async (c) => {
  const space = c.req.param("space")
  if (!SPACE.test(space)) return c.json({ error: "bad space" }, 400)
  const { rows } = await db.execute({
    sql: "SELECT id, text, created_at FROM notes WHERE space = ? ORDER BY id DESC",
    args: [space],
  })
  return c.json({ notes: rows })
})

app.post("/:space/notes", async (c) => {
  const space = c.req.param("space")
  if (!SPACE.test(space)) return c.json({ error: "bad space" }, 400)
  const { text } = await c.req.json<{ text?: string }>()
  if (!text?.trim()) return c.json({ error: "text required" }, 400)
  await db.execute({
    sql: "INSERT INTO notes (space, text, created_at) VALUES (?, ?, ?)",
    args: [space, text.trim(), Date.now()],
  })
  return c.json({ ok: true }, 201)
})

app.delete("/:space/notes/:id", async (c) => {
  const space = c.req.param("space")
  if (!SPACE.test(space)) return c.json({ error: "bad space" }, 400)
  await db.execute({
    sql: "DELETE FROM notes WHERE id = ? AND space = ?",
    args: [Number(c.req.param("id")), space],
  })
  return c.json({ ok: true })
})

app.get("/:space", (c) => (SPACE.test(c.req.param("space")) ? c.html(UI) : c.redirect("/")))

// --- UI: one page, plain fetch against the routes above ---------------------

const UI = /* html */ `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>notes · flect db example</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; }
  h1 { font-size: 1.4rem; margin: 0; letter-spacing: -.02em; }
  .lead { color: #888; font-size: .9rem; margin: .3rem 0 1.2rem; }
  .lead code { font: .85em monospace; background: #8882; padding: .05rem .35rem; border-radius: .3rem; }
  form { display: flex; gap: .5rem; margin: 1rem 0; }
  input { flex: 1; padding: .6rem .7rem; border: 1px solid #8884; border-radius: .5rem; background: transparent; color: inherit; }
  button { padding: .6rem 1rem; border: 0; border-radius: .5rem; background: #1a1a2e; color: #fff; cursor: pointer; }
  ul { list-style: none; padding: 0; }
  li { padding: .7rem .8rem; border: 1px solid #8883; border-radius: .5rem; margin-bottom: .5rem; display: flex; justify-content: space-between; align-items: flex-start; gap: .5rem; }
  li time { display: block; color: #888; font-size: .75rem; }
  li .x { background: none; border: 0; color: #888; cursor: pointer; font-size: 1.1rem; padding: 0 .2rem; line-height: 1; }
  li .x:hover { color: #dc2626; }
  .muted { color: #888; }
</style></head><body>
<h1>notes</h1>
<p class="lead">A Flect <b>database</b> in action — the app only calls
<code>env.db('DB')</code>. This is your own note space; share the URL to share it.</p>
<form onsubmit="return add(event)"><input id="t" placeholder="a new note…" autofocus><button>Add</button></form>
<ul id="list"></ul>
<p id="empty" class="muted" hidden>No notes yet — add one.</p>
<script>
const space = location.pathname.split('/')[1]
async function refresh() {
  const { notes } = await fetch('/' + space + '/notes').then(r => r.json())
  document.getElementById('empty').hidden = notes.length > 0
  document.getElementById('list').innerHTML = notes.map(n =>
    '<li><span>' + esc(n.text) + '<time>' + new Date(n.created_at).toLocaleString() + '</time></span>' +
    '<button class="x" title="delete" onclick="del(' + n.id + ')">×</button></li>').join('')
}
async function add(e) {
  e.preventDefault()
  const t = document.getElementById('t')
  if (!t.value.trim()) return false
  await fetch('/' + space + '/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t.value }) })
  t.value = ''; refresh(); return false
}
async function del(id) { await fetch('/' + space + '/notes/' + id, { method: 'DELETE' }); refresh() }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }
refresh()
</script></body></html>`

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => console.log(`flect-example-notes listening on :${port}`))
