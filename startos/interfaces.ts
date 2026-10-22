import { i18n } from './i18n'
import { sdk } from './sdk'
import { uiPort } from './utils'

// Only the dashboard is exported. spaced's RPC holds the wallet, so it stays on
// localhost, reached by the dashboard server and the actions.
export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const uiMulti = sdk.MultiHost.of(effects, 'ui-multi')
  const uiOrigin = await uiMulti.bindPort(uiPort, {
    protocol: 'http',
  })
  const ui = sdk.createInterface(effects, {
    name: i18n('Dashboard'),
    id: 'ui',
    description: i18n('The Spaces dashboard: wallet, your spaces and auctions'),
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  return [await uiOrigin.export([ui])]
})
