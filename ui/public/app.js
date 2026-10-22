'use strict'

// Protocol timing (spaces protocol/src/constants.rs)
const ROLLOUT_INTERVAL = 144
const BLOCK_MINUTES = 10
const REFRESH_MS = 30_000

const $ = (id) => document.getElementById(id)
let state = { tip: null, network: 'mainnet', hasWallet: false }
let refreshTimer = null

// ---------- helpers ----------

/** Element builder. Children are nodes or strings (always inserted as text). */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'class') el.className = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue
    el.append(c instanceof Node ? c : String(c))
  }
  return el
}

const fmtSats = (n) => `${Number(n).toLocaleString()} sats`
const fmtBtc = (n) => (Number(n) / 1e8).toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })

function fmtDuration(blocks) {
  const mins = blocks * BLOCK_MINUTES
  if (mins < 90) return `~${mins} min`
  const hours = mins / 60
  if (hours < 48) return `~${Math.round(hours)} h`
  return `~${Math.round(hours / 24)} days`
}

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

function qrImage(text) {
  if (typeof qrcode !== 'function') return h('span')
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return h('div', { class: 'qr' }, h('img', { src: qr.createDataURL(4, 0), alt: 'QR code' }))
}

function copyButton(text) {
  const btn = h('button', { type: 'button', class: 'small secondary' }, 'Copy')
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text)
      btn.textContent = 'Copied'
    } catch {
      btn.textContent = 'Copy failed'
    }
    setTimeout(() => (btn.textContent = 'Copy'), 1500)
  })
  return btn
}

function txLink(txid) {
  if (state.network !== 'mainnet') return h('span', { class: 'mono' }, `${txid.slice(0, 10)}…`)
  return h('a', { href: `https://mempool.space/tx/${txid}`, target: '_blank', rel: 'noopener noreferrer', class: 'mono' }, `${txid.slice(0, 10)}…`)
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && path !== '/api/login') {
    showLogin()
    throw new Error('Not logged in')
  }
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data
}

// ---------- login ----------

function showLogin() {
  clearInterval(refreshTimer)
  $('app').hidden = true
  $('login').hidden = false
  $('password').focus()
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  $('login-error').textContent = ''
  try {
    await api('/api/login', { password: $('password').value })
    $('password').value = ''
    start()
  } catch (err) {
    $('login-error').textContent = err.message
  }
})

$('logout').addEventListener('click', async () => {
  await api('/api/logout', {}).catch(() => {})
  showLogin()
})

// ---------- modal ----------

/**
 * Opens the modal. `fields` are nodes for the body; `onConfirm` runs on the
 * primary button and may throw to show an error. Returns when closed.
 */
function openModal({ title, fields, confirmLabel = 'Confirm', onConfirm, cancelLabel = 'Cancel' }) {
  const modal = $('modal')
  $('modal-title').textContent = title
  $('modal-body').replaceChildren(...fields)
  $('modal-error').textContent = ''
  const actions = []
  if (cancelLabel) actions.push(h('button', { value: 'cancel', formnovalidate: true }, cancelLabel))
  if (onConfirm) {
    const ok = h('button', { class: 'primary', value: 'ok' }, confirmLabel)
    ok.addEventListener('click', async (e) => {
      e.preventDefault()
      if (!$('modal-form').reportValidity()) return
      ok.disabled = true
      $('modal-error').textContent = ''
      try {
        const keepOpen = await onConfirm()
        if (!keepOpen) modal.close()
      } catch (err) {
        $('modal-error').textContent = err.message
      } finally {
        ok.disabled = false
      }
    })
    actions.push(ok)
  }
  $('modal-actions').replaceChildren(...actions)
  modal.showModal()
}

// ---------- rendering ----------

function renderStatus(status) {
  state.tip = status.server.tip.height
  state.network = status.network
  state.hasWallet = status.hasWallet
  $('network').textContent = status.network
  const { tip, chain, ready } = status.server
  const pill = $('sync')
  if (ready && tip.height >= chain.headers) {
    pill.className = 'pill ok'
    pill.textContent = `Synced · block ${tip.height.toLocaleString()}`
  } else {
    pill.className = 'pill warn'
    pill.textContent = `Syncing · ${tip.height.toLocaleString()} / ${chain.headers.toLocaleString()}`
  }
}

function renderWallet(wallet) {
  const body = $('wallet-body')
  $('receive').hidden = !wallet.hasWallet
  if (!wallet.hasWallet) {
    body.replaceChildren(
      h('p', { class: 'muted' }, 'No wallet yet. Create one to receive bitcoin and bid on spaces.'),
      h('button', { class: 'primary', onclick: createWallet }, 'Create wallet'),
    )
    return
  }
  const { balance, details } = wallet.balance
  const pending = details.trusted_pending + details.untrusted_pending
  body.replaceChildren(
    h('div', { class: 'balance' }, fmtBtc(balance), ' ', h('small', {}, 'BTC')),
    h('div', { class: 'muted' }, fmtSats(balance)),
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, 'Confirmed'),
      h('dd', {}, fmtSats(details.confirmed)),
      h('dt', {}, 'Pending'),
      h('dd', {}, fmtSats(pending)),
      h('dt', {}, 'In bids & dust'),
      h('dd', {}, fmtSats(details.dust)),
    ),
    h('p', { class: 'hint' }, 'Incoming payments show up after one confirmation.'),
  )
}

function renderTrust(trust) {
  const body = $('trust-body')
  if (!trust.latest) {
    body.replaceChildren(h('p', { class: 'muted' }, 'Not available yet. The node is still building its root anchors.'))
    return
  }
  const hex = trust.latest.id
  const link = `veritas://scan?id=${hex}`
  body.replaceChildren(
    h(
      'div',
      { class: 'qr-block' },
      qrImage(link),
      h(
        'div',
        {},
        h('p', { class: 'hint' }, 'Scan in Nacho or another Spaces app so it verifies against this node.'),
        h('div', { class: 'copy-row' }, h('span', { class: 'mono' }, hex), copyButton(hex)),
        h('p', { class: 'hint' }, `From block ${trust.latest.block.height.toLocaleString()}`),
      ),
    ),
  )
}

function auctionStatus(cov) {
  if (cov.claim_height === null || cov.claim_height === undefined) {
    return { label: 'Waiting for rollout', cls: '', canRegister: false }
  }
  const left = cov.claim_height - state.tip
  if (left > 0) {
    return { label: `Ends in ${plural(left, 'block')} (${fmtDuration(left)})`, cls: 'warn', canRegister: false }
  }
  return { label: 'Ended: register now', cls: 'ok', canRegister: true }
}

function renderSpaces(wallet) {
  const body = $('spaces-body')
  $('open-new').hidden = !wallet.hasWallet
  if (!wallet.hasWallet) {
    body.replaceChildren(h('p', { class: 'empty' }, 'Create a wallet first.'))
    return
  }
  const { owned, winning, outbid, pending } = wallet.spaces
  const rows = []

  for (const s of winning) {
    const st = auctionStatus(s.covenant)
    rows.push(
      h(
        'tr',
        {},
        h('td', { class: 'name' }, s.name),
        h('td', {}, h('span', { class: 'status ok' }, 'Winning')),
        h('td', {}, h('span', { class: `status ${st.cls}` }, st.label)),
        h('td', { class: 'num' }, fmtSats(s.covenant.total_burned)),
        h(
          'td',
          { class: 'actions' },
          st.canRegister
            ? h('button', { class: 'small primary', onclick: () => txModal('register', s.name) }, 'Register')
            : h('button', { class: 'small secondary', onclick: () => txModal('bid', s.name, s.covenant.total_burned) }, 'Raise bid'),
        ),
      ),
    )
  }
  for (const s of outbid) {
    const st = auctionStatus(s.covenant)
    rows.push(
      h(
        'tr',
        {},
        h('td', { class: 'name' }, s.name),
        h('td', {}, h('span', { class: 'status bad' }, 'Outbid')),
        h('td', {}, h('span', { class: `status ${st.cls}` }, st.label)),
        h('td', { class: 'num' }, fmtSats(s.covenant.total_burned)),
        h('td', { class: 'actions' }, h('button', { class: 'small primary', onclick: () => txModal('bid', s.name, s.covenant.total_burned) }, 'Bid again')),
      ),
    )
  }
  for (const name of pending) {
    rows.push(
      h(
        'tr',
        {},
        h('td', { class: 'name' }, name),
        h('td', {}, h('span', { class: 'status' }, 'Pending')),
        h('td', {}, h('span', { class: 'status' }, 'Waiting for confirmation')),
        h('td', { class: 'num' }, '—'),
        h('td', {}),
      ),
    )
  }
  for (const s of owned) {
    const exp = s.covenant.expire_height
    const left = exp ? exp - state.tip : null
    rows.push(
      h(
        'tr',
        {},
        h('td', { class: 'name' }, s.name),
        h('td', {}, h('span', { class: 'status ok' }, 'Owned')),
        h('td', {}, left === null ? '' : h('span', { class: `status ${left < 144 * 30 ? 'warn' : ''}` }, `Renew within ${fmtDuration(left)}`)),
        h('td', { class: 'num' }, '—'),
        h('td', {}),
      ),
    )
  }

  if (!rows.length) {
    body.replaceChildren(h('p', { class: 'empty' }, 'No spaces or bids yet. Open an auction or bid on one below.'))
    return
  }
  body.replaceChildren(
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Space'), h('th', {}, 'State'), h('th', {}, 'Auction'), h('th', { class: 'num' }, 'Total bid'), h('th', {}))),
        h('tbody', {}, rows),
      ),
    ),
  )
}

function renderAuctions(auctions) {
  const next = Math.ceil((state.tip + 1) / ROLLOUT_INTERVAL) * ROLLOUT_INTERVAL
  const left = next - state.tip
  const rows = auctions.rollout.map((r) =>
    h(
      'tr',
      {},
      h('td', { class: 'name' }, r.space),
      h('td', { class: 'num' }, fmtSats(r.value)),
      h('td', { class: 'actions' }, state.hasWallet ? h('button', { class: 'small secondary', onclick: () => txModal('bid', r.space, r.value) }, 'Bid') : null),
    ),
  )
  $('auctions-body').replaceChildren(
    h(
      'div',
      { class: 'stats' },
      h('div', {}, h('span', { class: 'muted' }, 'Next rollout'), h('b', {}, `${plural(left, 'block')} (${fmtDuration(left)})`)),
      h('div', {}, h('span', { class: 'muted' }, 'Bid to make the next rollout'), h('b', {}, auctions.estimate === null ? '—' : fmtSats(auctions.estimate))),
    ),
    h('p', { class: 'section-label' }, 'Next 10 spaces to move into auction'),
    rows.length
      ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Space'), h('th', { class: 'num' }, 'Highest bid'), h('th', {}))), h('tbody', {}, rows)))
      : h('p', { class: 'empty' }, 'No spaces waiting for rollout.'),
  )
}

function describeSpace(name, space) {
  if (!space) {
    return { text: 'Available. Nobody has opened an auction for it yet.', action: 'open' }
  }
  const cov = space.covenant
  if (cov.type === 'bid') {
    const st = auctionStatus(cov)
    if (cov.claim_height === null || cov.claim_height === undefined) {
      return { text: `Waiting for rollout. Highest bid ${fmtSats(cov.total_burned)}.`, action: 'bid', min: cov.total_burned }
    }
    return { text: `In auction. Highest bid ${fmtSats(cov.total_burned)}. ${st.label.replace(': register now', '; the winner can register')}.`, action: 'bid', min: cov.total_burned }
  }
  if (cov.type === 'transfer') {
    return { text: `Registered. Expires at block ${cov.expire_height.toLocaleString()}.`, action: null }
  }
  return { text: `State: ${cov.type}.`, action: null }
}

$('lookup-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const out = $('lookup-result')
  const raw = $('lookup-name').value.trim()
  if (!raw) return out.replaceChildren()
  out.replaceChildren(h('p', { class: 'muted' }, 'Looking up…'))
  try {
    const { name, space } = await api(`/api/space?name=${encodeURIComponent(raw)}`)
    const d = describeSpace(name, space)
    const btn =
      d.action && state.hasWallet
        ? h('button', { class: 'primary small', onclick: () => txModal(d.action, name, d.min) }, d.action === 'open' ? 'Open auction' : 'Bid')
        : null
    out.replaceChildren(h('div', { class: 'lookup-card' }, h('div', {}, h('div', { class: 'name' }, name), h('div', { class: 'muted' }, d.text)), btn))
  } catch (err) {
    out.replaceChildren(h('p', { class: 'error' }, err.message))
  }
})

function eventText(ev) {
  switch (ev.type) {
    case 'open':
      return `Opened ${ev.space} (${fmtSats(ev.initial_bid)})`
    case 'bid':
      return `Bid on ${ev.space}${ev.total_burned ? ` (${fmtSats(ev.total_burned)})` : ''}`
    case 'register':
      return `Registered ${ev.space}`
    case 'renew':
      return `Registered ${ev.space}`
    case 'commit':
      return `Prepared ${ev.space}`
    case 'bidout':
      return `Prepared ${plural(ev.count, 'bid output')}`
    default:
      return ev.space ? `${ev.type} ${ev.space}` : ev.type
  }
}

function renderActivity(wallet) {
  const body = $('activity-body')
  if (!wallet.hasWallet) return body.replaceChildren(h('p', { class: 'empty' }, 'No wallet yet.'))
  const txs = wallet.transactions
  if (!txs.length) return body.replaceChildren(h('p', { class: 'empty' }, 'No transactions yet.'))
  const rows = txs.map((tx) => {
    const net = tx.received - tx.sent
    const what = tx.events.length ? tx.events.map(eventText).join(' · ') : net >= 0 ? 'Received' : 'Sent'
    return h(
      'tr',
      {},
      h('td', {}, tx.block_height === null ? h('span', { class: 'status warn' }, 'Unconfirmed') : h('span', { class: 'muted' }, `#${tx.block_height.toLocaleString()}`)),
      h('td', {}, what),
      h('td', { class: 'num' }, `${net >= 0 ? '+' : '−'}${fmtSats(Math.abs(net))}`),
      h('td', { class: 'num muted' }, tx.fee === null ? '' : `fee ${tx.fee.toLocaleString()}`),
      h('td', { class: 'actions' }, txLink(tx.txid)),
    )
  })
  body.replaceChildren(h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, rows))))
}

// ---------- actions ----------

function createWallet() {
  openModal({
    title: 'Create wallet',
    fields: [
      h('p', {}, 'Your recovery phrase is shown once, on the next screen. Have pen and paper ready.'),
      h('p', { class: 'hint' }, 'StartOS backups include the wallet, but the phrase is the only way to recover it if the server and its backups are lost.'),
    ],
    confirmLabel: 'Create wallet',
    onConfirm: async () => {
      const { mnemonic } = await api('/api/wallet/create', {})
      showMnemonic(mnemonic)
      return true
    },
  })
}

function showMnemonic(mnemonic) {
  const check = h('input', { type: 'checkbox', required: true, id: 'saved-check' })
  openModal({
    title: 'Write down your recovery phrase',
    fields: [
      h('div', { class: 'callout warn' }, 'This is the only time it is shown. Keep it offline.'),
      h('div', { class: 'mnemonic' }, mnemonic),
      h('label', { class: 'check', for: 'saved-check' }, check, 'I have written it down'),
    ],
    confirmLabel: 'Done',
    cancelLabel: null,
    onConfirm: async () => {
      refresh()
    },
  })
}

$('receive').addEventListener('click', async () => {
  try {
    const { address } = await api('/api/wallet/address', {})
    openModal({
      title: 'Receive bitcoin',
      fields: [
        h('div', { class: 'qr-block' }, qrImage(`bitcoin:${address}`), h('div', { class: 'copy-row' }, h('span', { class: 'mono' }, address), copyButton(address))),
        h('p', { class: 'hint' }, 'It shows in your balance after one confirmation.'),
      ],
      cancelLabel: 'Close',
    })
  } catch (err) {
    showBanner(err.message)
  }
})

$('open-new').addEventListener('click', () => txModal('open'))

function txModal(action, name = '', currentBid = 0) {
  const titles = { open: 'Open auction', bid: 'Place bid', register: 'Register space' }
  const nameInput = h('input', { name: 'name', required: true, value: name, placeholder: '@name', pattern: '@?[A-Za-z0-9-]{1,62}', autocomplete: 'off', spellcheck: 'false' })
  if (name) nameInput.readOnly = true
  const defaultAmount = action === 'open' ? 1000 : currentBid ? currentBid + 1000 : ''
  const amountInput = h('input', { name: 'amount', type: 'number', min: action === 'bid' && currentBid ? currentBid + 1 : 1, step: 1, required: true, value: defaultAmount })
  const feeInput = h('input', { name: 'fee', type: 'number', min: 1, step: 1, placeholder: 'Estimate automatically' })

  const fields = [h('label', {}, 'Space', nameInput)]
  if (action !== 'register') {
    fields.push(h('label', {}, action === 'open' ? 'Opening bid (sats)' : `Bid (sats)${currentBid ? `, currently ${fmtSats(currentBid)}` : ''}`, amountInput))
  }
  fields.push(h('label', {}, 'Fee rate (sat/vB, optional)', feeInput))
  fields.push(
    h(
      'div',
      { class: 'callout' },
      action === 'register'
        ? 'Registers the space to this wallet. Until you do, others can still outbid you.'
        : 'The winning bid is burned. If you are outbid, your bid is returned to your wallet. Network fees are paid either way.',
    ),
  )

  openModal({
    title: titles[action],
    fields,
    confirmLabel: titles[action],
    onConfirm: async () => {
      const body = { action, name: nameInput.value, feeRate: feeInput.value ? Number(feeInput.value) : null }
      if (action !== 'register') body.amount = Number(amountInput.value)
      const result = await api('/api/tx', body)
      const txids = (result.result ?? []).map((r) => r.txid)
      openModal({
        title: 'Sent',
        fields: [
          h('p', {}, `Broadcast ${plural(txids.length, 'transaction')}. It shows as unconfirmed in Activity until it is mined.`),
          ...txids.map((t) => h('div', {}, txLink(t))),
        ],
        cancelLabel: 'Close',
      })
      refresh()
      return true
    },
  })
}

// ---------- refresh loop ----------

function showBanner(msg) {
  $('banner').textContent = msg
  $('banner').hidden = !msg
}

async function refresh() {
  try {
    const status = await api('/api/status')
    renderStatus(status)
    showBanner('')
    const [wallet, trust, auctions] = await Promise.all([
      api('/api/wallet'),
      api('/api/trust').catch(() => ({ latest: null })),
      api('/api/auctions').catch(() => ({ rollout: [], estimate: null })),
    ])
    renderWallet(wallet)
    renderSpaces(wallet)
    renderActivity(wallet)
    renderTrust(trust)
    renderAuctions(auctions)
  } catch (err) {
    if (err.message !== 'Not logged in') {
      $('sync').className = 'pill bad'
      $('sync').textContent = 'Unavailable'
      showBanner(err.message)
    }
  }
}

function start() {
  $('login').hidden = true
  $('app').hidden = false
  refresh()
  clearInterval(refreshTimer)
  refreshTimer = setInterval(refresh, REFRESH_MS)
}

// Probe the session: a 401 shows the login form.
api('/api/status')
  .then(start)
  .catch(() => {})
