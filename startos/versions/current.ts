import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.5.0:3',
  releaseNotes: {
    en_US:
      'Adds the Spaces dashboard (Launch UI), protected by a password from the Dashboard Password action.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
