<p align="center">
  <img src="icon.svg" alt="Spaces Logo" width="21%">
</p>

# Spaces on StartOS

Unofficial StartOS package of [spaced](https://github.com/spacesprotocol/spaces), the Spaces protocol client. It is a personal sideload package, not published to a Start9 registry.

## Image and Container Runtime

| Property      | Value                                                               |
| ------------- | ------------------------------------------------------------------- |
| Image         | Built from `Dockerfile` on `debian:trixie-slim`                     |
| Binaries      | Official `spaced` and `space-cli` Linux release builds, SHA-256 pinned |
| Architectures | x86_64, aarch64                                                     |
| Commands      | `spaced`; `node /opt/spaces-ui/server.mjs` (dashboard)             |

The image also carries the Spaces checkpoint archive (`/opt/spaces/checkpoint.tar.gz`), verified against the hash the upstream release pins.

## Volume and Data Layout

| Volume    | Mount Point | Purpose                                                   |
| --------- | ----------- | --------------------------------------------------------- |
| `main`    | `/data`     | spaced state under `/data/mainnet`, wallets in `wallets/` |
| `startos` | (none)      | `store.json`: the dashboard password                      |

Bitcoin's `main` volume is mounted read-only at `/mnt/bitcoind`, only for its RPC cookie.

## Dependencies

| Dependency | Kind      | Requirement                                  |
| ---------- | --------- | -------------------------------------------- |
| `bitcoind` | `running` | `>=31.1:17`, `prune: 0` (enforced by a task) |

spaced connects to Bitcoin's `rpc-local` binding over the LXC bridge, in plain HTTP. main reads the cookie and passes it as `SPACED_BITCOIN_RPC_USER`/`PASSWORD`, because spaced 0.5.0 sends `--bitcoin-rpc-cookie` unencoded and gets 401. main restarts when the cookie changes.

## Network Access and Interfaces

| Interface | Id   | Type | Port | Description                     |
| --------- | ---- | ---- | ---- | ------------------------------- |
| Dashboard | `ui` | ui   | 8080 | The Spaces dashboard (Node app) |

spaced's JSON-RPC listens on `127.0.0.1:7225` inside the container and is never exported. The dashboard server (`ui/server.mjs`, no npm dependencies) and the actions are its only clients.

The dashboard requires the password in `store.json` (`UI_PASSWORD`), with in-memory sessions (HttpOnly, SameSite=Strict cookies, 12 h), JSON-only POSTs and a strict CSP. Fee rates are entered in sat/vB and sent to spaced as sat/kwu (x250).

## Installation and First-Run Flow

A `seed-checkpoint` oneshot extracts the checkpoint into `/data/mainnet` when `root.sdb` is absent, so the first sync scans only from the checkpoint height to the tip.

## Actions

| Id                   | Group    | Runs                                   |
| -------------------- | -------- | -------------------------------------- |
| `dashboard-password` |          | Generates the dashboard password       |
| `trust-id`        |          | `space-cli trust --no-qr`              |
| `create-wallet`   | Wallet   | `space-cli createwallet`               |
| `deposit-address` | Wallet   | `space-cli getnewaddress`              |
| `balance`         | Wallet   | `space-cli balance`                    |
| `list-spaces`     | Auctions | `space-cli listspaces`                 |
| `open-auction`    | Auctions | `space-cli open <space> <sats>`        |
| `place-bid`       | Auctions | `space-cli bid <space> <sats>`         |
| `register-space`  | Auctions | `space-cli register <space>`           |

Wallet actions run `space-cli loadwallet` first, because spaced does not reload wallets after a restart. space-cli exits 0 on failure and prints the error prefixed with `⚠️`; actions treat that prefix as a failure.

## Health Checks

| Id       | Shows                                                        |
| -------- | ------------------------------------------------------------ |
| `spaced` | spaced's RPC port is listening                               |
| `sync`   | spaced's tip against Bitcoin's height, from `getserverinfo` |
| `ui`     | the dashboard's port is listening                            |

## Backups and Restore

`sdk.Backups.ofVolumes('main', 'startos')`: the spaced data including the wallet, and the dashboard password. The Spaces database is about 50 MB.

## Limitations and Differences

- Mainnet only.
- No wallet recovery from a mnemonic yet (`recoverwallet` reads stdin).
- No access to spaced's RPC from outside the server; the dashboard is the remote interface.
- Incoming payments show only after one confirmation: spaced's wallet does not watch the mempool for them.
