import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { spaceCli } from '../utils'

export const depositAddress = sdk.Action.withoutInput(
  'deposit-address',

  async ({ effects }) => ({
    name: i18n('Deposit Address'),
    description: i18n('Show a bitcoin address to fund the Spaces wallet.'),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Wallet'),
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    const address = await spaceCli(effects, ['getnewaddress'], {
      loadWallet: true,
    })

    return {
      version: '1',
      title: i18n('Deposit Address'),
      message: i18n('Send bitcoin to this address to fund bids.'),
      result: {
        type: 'single',
        value: address,
        copyable: true,
        qr: true,
        masked: false,
        launchable: false,
      },
    }
  },
)

export const balance = sdk.Action.withoutInput(
  'balance',

  async ({ effects }) => ({
    name: i18n('Balance'),
    description: i18n('Show the Spaces wallet balance.'),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Wallet'),
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    const out = await spaceCli(effects, ['balance'], { loadWallet: true })

    return {
      version: '1',
      title: i18n('Balance'),
      message: null,
      result: {
        type: 'multiline',
        value: out,
        copyable: true,
        qr: false,
        masked: false,
        filename: null,
      },
    }
  },
)

export const listSpaces = sdk.Action.withoutInput(
  'list-spaces',

  async ({ effects }) => ({
    name: i18n('My Spaces'),
    description: i18n(
      'List the spaces you own, and auctions where you hold the winning bid.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Auctions'),
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    const out = await spaceCli(effects, ['listspaces'], { loadWallet: true })

    return {
      version: '1',
      title: i18n('My Spaces'),
      message: null,
      result: {
        type: 'multiline',
        value: out || i18n('No spaces or winning bids yet.'),
        copyable: true,
        qr: false,
        masked: false,
        filename: null,
      },
    }
  },
)
