import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.5.0:4',
  releaseNotes: {
    en_US:
      'Transaction links open your own Mempool when it is installed, and every transaction ID, address and Trust ID has a copy button.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
