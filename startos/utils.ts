import { T } from '@start9labs/start-sdk'
import {
  rpcLocalHostId,
  rpcPortLocal,
} from 'bitcoin-core-startos/startos/utils'
import { i18n } from './i18n'
import { sdk } from './sdk'

/** spaced's JSON-RPC port on mainnet. Bound to localhost only, never exported. */
export const spacedRpcPort = 7225

/** The dashboard's HTTP port; StartOS adds TLS in front of it. */
export const uiPort = 8080

/** spaced appends the chain name to --data-dir, so mainnet state lives here. */
export const dataDir = '/data'
export const chainDir = `${dataDir}/mainnet`
export const spacedCookie = `${chainDir}/.cookie`

/** Baked into the image by the Dockerfile, verified against its pinned SHA-256. */
export const checkpointArchive = '/opt/spaces/checkpoint.tar.gz'

export const bitcoindMountpoint = '/mnt/bitcoind'
export const bitcoindCookie = `${bitcoindMountpoint}/.cookie`

export const mainMounts = sdk.Mounts.of().mountVolume({
  volumeId: 'main',
  subpath: null,
  mountpoint: dataDir,
  readonly: false,
})

/** Bitcoin's direct RPC endpoint over the LXC bridge, plaintext HTTP. */
export const bitcoindRpc = (effects: T.Effects) =>
  sdk.host
    .getBridgeAddress(effects, {
      packageId: 'bitcoind',
      hostId: rpcLocalHostId,
      internalPort: rpcPortLocal,
    })
    .const()

/**
 * Runs space-cli in a throwaway subcontainer. It reaches spaced on localhost
 * because every subcontainer of this package shares one network namespace.
 *
 * space-cli exits 0 even when the call fails, printing the error to stdout
 * prefixed with a warning sign, so that prefix is what marks a failure here.
 */
export async function spaceCli(
  effects: T.Effects,
  args: string[],
  opts: { loadWallet?: boolean; raw?: boolean } = {},
): Promise<string> {
  return sdk.SubContainer.withTemp(
    effects,
    { imageId: 'spaces' },
    mainMounts,
    'space-cli',
    async (subc) => {
      const base = ['space-cli', '--rpc-cookie', spacedCookie]
      // spaced forgets loaded wallets on restart; loading an already-loaded
      // wallet is a no-op.
      if (opts.loadWallet) {
        const load = await subc.execFail([...base, 'loadwallet'])
        const loadOut = load.stdout.toString().trim()
        if (loadOut.includes('Wallet does not exist')) {
          throw new Error(
            i18n('No wallet yet. Run the "Create Wallet" action first.'),
          )
        }
        assertOk(loadOut)
      }
      const res = await subc.execFail([...base, ...args])
      const out = res.stdout.toString().trim()
      if (!opts.raw) assertOk(out)
      return out
    },
  )
}

function assertOk(out: string) {
  if (out.startsWith('⚠️')) {
    throw new Error(out.replace(/^⚠️\s*/, ''))
  }
}

/** Host path of the default wallet, which spaced creates on `createwallet`. */
export const walletFile = sdk.volumes.main.subpath(
  'mainnet/wallets/default/wallet.json',
)

/** Space names are given with or without the leading @; space-cli takes either. */
export const spaceNamePattern = {
  regex: '@?[a-zA-Z0-9-]{1,62}',
  description: i18n('Letters, digits and hyphens, optionally starting with @'),
}
