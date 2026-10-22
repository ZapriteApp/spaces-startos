# Spaces

Spaces runs `spaced`, the Spaces protocol client, against your own Bitcoin node. Use it from the dashboard (**Launch UI**) or from this service's actions.

## Dashboard

Run the **Dashboard Password** action to get the password, then open the dashboard with **Launch UI**. It shows sync status, your wallet and Trust ID, your spaces with auction countdowns, the next spaces to move into auction, and your transaction history. You can receive bitcoin, open auctions, bid and register spaces from it. Running **Dashboard Password** again replaces the password.

## Before you start

- Bitcoin Core 31.1:17 or later must be installed, running and fully synced.
- Bitcoin must keep every block (pruning off). If yours is pruned, StartOS asks you to turn pruning off, which makes Bitcoin download the chain again.

## First run

Spaces starts from a verified snapshot of the Spaces state at block 967,068, then scans the blocks since then from your node. The **Sync Progress** check shows how far it has got. Wallet and auction actions need it to be fully synced.

## Actions

- **Show Trust ID**: a QR code to scan into Nacho or another Spaces app, so it verifies against your node.
- **Wallet → Create Wallet**: creates the wallet and shows its recovery phrase once. Write it down.
- **Wallet → Deposit Address**: an address to send bitcoin to for bids.
- **Wallet → Balance**: the wallet balance.
- **Auctions → My Spaces**: spaces you own, and auctions where you hold the winning bid.
- **Auctions → Open Auction**: open an auction for a space nobody has opened yet.
- **Auctions → Place Bid**: bid on a space in auction, in sats.
- **Auctions → Register Space**: claim a space you won once its claim period starts.

## Backups

StartOS backups include the wallet. Your recovery phrase is still the only way to recover it if the server and its backups are lost.
