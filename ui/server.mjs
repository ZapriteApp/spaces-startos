// Spaces dashboard: serves the web UI and a small JSON API over spaced's RPC.
// No dependencies beyond Node's standard library.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT ?? 8080)
const SPACED_URL = process.env.SPACED_URL ?? 'http://127.0.0.1:7225'
const SPACED_COOKIE = process.env.SPACED_COOKIE ?? '/data/mainnet/.cookie'
const PASSWORD = process.env.UI_PASSWORD ?? ''
const NETWORK = process.env.SPACES_NETWORK ?? 'mainnet'
const WALLET = 'default'
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url))

const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const sessions = new Map() // token -> expiry

// ---------- spaced RPC ----------

class RpcError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

let rpcId = 0
async function rpc(method, params = []) {
  // spaced rewrites its cookie on every start, so read it per call.
  const cookie = (await readFile(SPACED_COOKIE, 'utf8')).trim()
  let res
  try {
    res = await fetch(SPACED_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Basic ' + Buffer.from(cookie).toString('base64'),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (e) {
    throw new RpcError(`spaced is not reachable (${e.cause?.code ?? e.message})`)
  }
  const body = await res.json().catch(() => null)
  if (!body) throw new RpcError(`spaced returned HTTP ${res.status}`)
  if (body.error) {
    const message = /could not estimate fee rate/i.test(body.error.message)
      ? 'Bitcoin could not estimate a fee rate. Enter one in sat/vB.'
      : body.error.message
    throw new RpcError(message, body.error.code)
  }
  return body.result
}

// spaced forgets loaded wallets on restart; walletload is a no-op when loaded.
async function walletRpc(method, params = []) {
  try {
    return await rpc(method, [WALLET, ...params])
  } catch (e) {
    if (!/not loaded/i.test(e.message)) throw e
    await rpc('walletload', [WALLET])
    return rpc(method, [WALLET, ...params])
  }
}

async function walletExists() {
  const wallets = await rpc('listwallets')
  return wallets.includes(WALLET)
}

// ---------- API ----------

const SPACE_NAME = /^@?[a-z0-9-]{1,62}$/i
const normalizeName = (n) => {
  const name = String(n ?? '').trim().toLowerCase()
  if (!SPACE_NAME.test(name)) throw new HttpError(400, 'Invalid space name')
  return name.startsWith('@') ? name : `@${name}`
}
const positiveInt = (v, what) => {
  const n = Number(v)
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${what}`)
  return n
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const api = {
  'GET /api/status': async () => {
    const server = await rpc('getserverinfo')
    const hasWallet = await walletExists()
    const wallet = hasWallet ? await walletRpc('walletgetinfo', []).catch(() => null) : null
    return { network: NETWORK, server, hasWallet, wallet: wallet && { tip: wallet.tip, progress: wallet.progress, sync: wallet.sync } }
  },

  'GET /api/trust': async () => {
    const ids = await rpc('gettrustids')
    return { latest: ids[0] ?? null }
  },

  'GET /api/wallet': async () => {
    if (!(await walletExists())) return { hasWallet: false }
    const [balance, spaces, transactions] = await Promise.all([
      walletRpc('walletgetbalance'),
      walletRpc('walletlistspaces'),
      walletRpc('walletlisttransactions', [25, 0]),
    ])
    return { hasWallet: true, balance, spaces, transactions }
  },

  'POST /api/wallet/create': async () => {
    if (await walletExists()) throw new HttpError(409, 'The wallet already exists')
    const mnemonic = await rpc('walletcreate', [WALLET])
    return { mnemonic }
  },

  'POST /api/wallet/address': async () => ({
    address: await walletRpc('walletgetnewaddress', ['Coin']),
  }),

  'GET /api/auctions': async () => {
    const [rollout, estimate] = await Promise.all([
      rpc('getrollout', [0]),
      rpc('estimatebid', [0]).catch(() => null),
    ])
    return { rollout, estimate }
  },

  'GET /api/space': async (_body, query) => {
    const name = normalizeName(query.get('name'))
    return { name, space: await rpc('getspace', [name]) }
  },

  'POST /api/tx': async (body) => {
    const action = body?.action
    const name = normalizeName(body?.name)
    let request
    if (action === 'open' || action === 'bid') {
      request = { request: action, name, amount: positiveInt(body.amount, 'amount') }
    } else if (action === 'register') {
      request = { request: 'register', name }
    } else {
      throw new HttpError(400, 'Unknown action')
    }
    // spaced takes fee rates in sat/kwu; 1 sat/vB = 250 sat/kwu.
    const feeRate = body.feeRate ? positiveInt(body.feeRate, 'fee rate') * 250 : null
    const result = await walletRpc('walletsendrequest', [
      {
        requests: [request],
        fee_rate: feeRate,
        dust: null,
        force: false,
        confirmed_only: false,
        skip_tx_check: false,
      },
    ])
    return result
  },
}

// ---------- auth ----------

const hash = (s) => createHash('sha256').update(s).digest()
const passwordMatches = (given) =>
  PASSWORD.length > 0 && timingSafeEqual(hash(String(given ?? '')), hash(PASSWORD))

function sessionFrom(req) {
  const m = /(?:^|;\s*)spaces_session=([a-f0-9]{64})/.exec(req.headers.cookie ?? '')
  if (!m) return null
  const expiry = sessions.get(m[1])
  if (!expiry || expiry < Date.now()) {
    sessions.delete(m[1])
    return null
  }
  return m[1]
}

const loginAttempts = []
function tooManyAttempts() {
  const cutoff = Date.now() - 60_000
  while (loginAttempts.length && loginAttempts[0] < cutoff) loginAttempts.shift()
  return loginAttempts.length >= 10
}

function sessionCookie(req, token, maxAgeSec) {
  // StartOS terminates TLS, so trust its forwarded proto for the Secure flag.
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
  return `spaces_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${secure}`
}

// ---------- HTTP ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body)
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'cache-control': 'no-store',
    ...(isJson ? { 'content-type': 'application/json' } : {}),
    ...headers,
  })
  res.end(isJson ? JSON.stringify(body) : body)
}

async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 16 * 1024) throw new HttpError(413, 'Request too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1)
  const file = normalize(join(PUBLIC_DIR, rel))
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 404, 'Not found')
  try {
    const data = await readFile(file)
    send(res, 200, data, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  } catch {
    send(res, 404, 'Not found')
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const { pathname } = url
  try {
    if (!pathname.startsWith('/api/')) return await serveStatic(res, pathname)

    // Only JSON bodies are accepted on POST, which a cross-site form cannot send.
    if (req.method === 'POST' && !(req.headers['content-type'] ?? '').startsWith('application/json')) {
      throw new HttpError(415, 'Expected JSON')
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      if (tooManyAttempts()) throw new HttpError(429, 'Too many attempts. Wait a minute.')
      loginAttempts.push(Date.now())
      const { password } = await readJson(req)
      if (!passwordMatches(password)) throw new HttpError(401, 'Wrong password')
      const token = randomBytes(32).toString('hex')
      sessions.set(token, Date.now() + SESSION_TTL_MS)
      return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, token, SESSION_TTL_MS / 1000) })
    }

    const session = sessionFrom(req)
    if (pathname === '/api/logout' && req.method === 'POST') {
      if (session) sessions.delete(session)
      return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, '', 0) })
    }
    if (!session) throw new HttpError(401, 'Not logged in')

    const handler = api[`${req.method} ${pathname}`]
    if (!handler) throw new HttpError(404, 'Not found')
    const body = req.method === 'POST' ? await readJson(req) : undefined
    send(res, 200, await handler(body, url.searchParams))
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message })
    if (e instanceof RpcError) return send(res, 502, { error: e.message })
    console.error(e)
    send(res, 500, { error: 'Internal error' })
  }
})

if (!PASSWORD) console.warn('UI_PASSWORD is not set: every login will be refused.')
server.listen(PORT, () => console.log(`Spaces dashboard listening on :${PORT}`))
