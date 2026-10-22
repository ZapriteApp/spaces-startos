import { utils } from '@start9labs/start-sdk'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const dashboardPassword = sdk.Action.withoutInput(
  'dashboard-password',

  async ({ effects }) => ({
    name: i18n('Dashboard Password'),
    description: i18n(
      'Generate a new password for the Spaces dashboard. Replaces any existing password.',
    ),
    warning: (await storeJson.read((s) => s.uiPassword).const(effects))
      ? i18n('Replaces the current dashboard password.')
      : null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    const uiPassword = utils.getDefaultString({
      charset: 'a-z,A-Z,0-9',
      len: 24,
    })
    await storeJson.merge(effects, { uiPassword })

    return {
      version: '1',
      title: i18n('Dashboard Password'),
      message: i18n(
        'Use this password to log in to the Spaces dashboard. Open it with Launch UI.',
      ),
      result: {
        type: 'single',
        value: uiPassword,
        copyable: true,
        qr: false,
        masked: true,
        launchable: false,
      },
    }
  },
)
