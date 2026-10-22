import { FileHelper } from '@start9labs/start-sdk'
import { manifest as bitcoindManifest } from 'bitcoin-core-startos/startos/manifest'
import { dependencies } from './dependencies'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { sdk } from './sdk'
import {
  bitcoindCookie,
  bitcoindMountpoint,
  bitcoindRpc,
  chainDir,
  checkpointArchive,
  dataDir,
  spacedCookie,
  spacedRpcPort,
  uiPort,
} from './utils'

// With --output-format json, space-cli prints failures as { code, message }.
type ServerInfo = {
  tip?: { height?: number }
  chain?: { blocks?: number; headers?: number }
  ready?: boolean
  message?: string
}

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Spaces!'))

  // Null while Bitcoin publishes no rpc-local binding; .const() restarts main when it appears.
  const rpc = await bitcoindRpc(effects)
  if (!rpc) {
    return sdk.Daemons.of(effects).addHealthCheck('bitcoind-rpc', {
      ready: {
        display: i18n('Bitcoin RPC'),
        gracePeriod: 0,
        trigger: sdk.trigger.cooldownTrigger(60_000),
        fn: async () =>
          (await dependencies.check(effects, ['bitcoind'])).installedSatisfied(
            'bitcoind',
          )
            ? {
                result: 'failure',
                message: i18n(
                  'Bitcoin does not publish the local RPC endpoint Spaces connects to. Update Bitcoin Core to 31.1:17 or later.',
                ),
              }
            : { result: 'loading', message: i18n('Bitcoin is not installed') },
      },
      requires: [],
    })
  }

  const spacesContainer = sdk.SubContainer.of(
    effects,
    { imageId: 'spaces' },
    sdk.Mounts.of()
      .mountVolume({
        volumeId: 'main',
        subpath: null,
        mountpoint: dataDir,
        readonly: false,
      })
      .mountDependency<typeof bitcoindManifest>({
        dependencyId: 'bitcoind',
        volumeId: 'main',
        subpath: null,
        mountpoint: bitcoindMountpoint,
        readonly: true,
      }),
    'spaced',
  )

  // Restart when bitcoind writes a new cookie. An absent cookie means bitcoind
  // is down.
  const rootfs = await spacesContainer.rootfs
  const cookie = await FileHelper.string(`${rootfs}${bitcoindCookie}`)
    .read(
      (cookie) => cookie.trim(),
      (prev, next) => next === null || prev === next,
    )
    .const(effects)

  // spaced 0.5.0 sends --bitcoin-rpc-cookie as the Basic auth token without
  // base64-encoding it, which Bitcoin rejects with 401. It encodes a user and
  // password correctly, so hand it the cookie's two halves instead.
  const sep = cookie?.indexOf(':') ?? -1
  const bitcoinAuth =
    cookie && sep > 0
      ? {
          SPACED_BITCOIN_RPC_USER: cookie.slice(0, sep),
          SPACED_BITCOIN_RPC_PASSWORD: cookie.slice(sep + 1),
        }
      : {}

  // Restarts main when the password is set or rotated.
  const uiPassword = await storeJson.read((s) => s.uiPassword).const(effects)

  const getServerInfo = async (): Promise<ServerInfo | null> => {
    const res = await spacesContainer.exec([
      'space-cli',
      '--rpc-cookie',
      spacedCookie,
      '--output-format',
      'json',
      'getserverinfo',
    ])
    if (res.exitCode !== 0) return null
    try {
      return JSON.parse(res.stdout.toString()) as ServerInfo
    } catch {
      // space-cli prints errors as text, not JSON
      return null
    }
  }

  return sdk.Daemons.of(effects)
    .addOneshot('seed-checkpoint', {
      subcontainer: spacesContainer,
      // Start from the pinned checkpoint instead of scanning every block since
      // the Spaces launch. Only on a fresh data directory.
      exec: {
        command: [
          'sh',
          '-c',
          `[ -f ${chainDir}/root.sdb ] || { mkdir -p ${chainDir} && tar xzf ${checkpointArchive} -C ${chainDir} --no-same-owner; }`,
        ],
      },
      requires: [],
    })
    .addDaemon('spaced', {
      subcontainer: spacesContainer,
      exec: {
        command: [
          'spaced',
          '--data-dir',
          dataDir,
          '--rpc-bind',
          '127.0.0.1',
          '--rpc-port',
          String(spacedRpcPort),
          '--bitcoin-rpc-url',
          `http://${rpc}`,
        ],
        env: bitcoinAuth,
      },
      ready: {
        display: i18n('Spaces RPC'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, spacedRpcPort, {
            successMessage: i18n('spaced is running'),
            errorMessage: i18n('spaced is starting'),
          }),
      },
      requires: ['seed-checkpoint'],
    })
    .addHealthCheck('sync', {
      ready: {
        display: i18n('Sync Progress'),
        trigger: sdk.trigger.statusTrigger(30_000, { starting: 10_000 }),
        fn: async () => {
          const info = await getServerInfo()
          if (!info) {
            return {
              result: 'loading',
              message: i18n('Waiting for spaced to reach Bitcoin'),
            }
          }
          if (!info.tip && info.message) {
            return {
              result: 'loading',
              message: i18n('spaced reports: ${error}', {
                error: info.message,
              }),
            }
          }
          const height = info.tip?.height
          const blocks = info.chain?.blocks
          const headers = info.chain?.headers
          // `ready` means Bitcoin's own headers are synced; spaced is caught up
          // once its tip reaches them.
          if (
            info.ready &&
            typeof height === 'number' &&
            typeof headers === 'number' &&
            height >= headers
          ) {
            return { result: 'success', message: i18n('Fully synced') }
          }
          if (typeof height === 'number' && typeof blocks === 'number') {
            return {
              result: 'loading',
              message: i18n(
                'Scanned through block ${height}; Bitcoin is at block ${blocks}.',
                { height, blocks },
              ),
            }
          }
          return { result: 'loading', message: i18n('Syncing') }
        },
      },
      requires: ['spaced'],
    })
    .addDaemon('ui', {
      subcontainer: spacesContainer,
      exec: {
        command: ['node', '/opt/spaces-ui/server.mjs'],
        env: {
          PORT: String(uiPort),
          SPACED_URL: `http://127.0.0.1:${spacedRpcPort}`,
          SPACED_COOKIE: spacedCookie,
          ...(uiPassword ? { UI_PASSWORD: uiPassword } : {}),
        },
      },
      ready: {
        display: i18n('Dashboard'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, uiPort, {
            successMessage: uiPassword
              ? i18n('The dashboard is ready')
              : i18n('Run the Dashboard Password action to log in'),
            errorMessage: i18n('The dashboard is starting'),
          }),
      },
      requires: ['spaced'],
    })
})
