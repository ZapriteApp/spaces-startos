import { dashboardPassword } from '../actions/dashboardPassword'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const watchPassword = sdk.setupOnInit(async (effects) => {
  const store = await storeJson.read().const(effects)

  if (!store?.uiPassword) {
    await sdk.action.createOwnTask(effects, dashboardPassword, 'critical', {
      reason: i18n('Set a dashboard password before logging in'),
    })
  }
})
