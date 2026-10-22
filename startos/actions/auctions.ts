import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { spaceCli, spaceNamePattern } from '../utils'
const { InputSpec, Value } = sdk

const spaceName = Value.text({
  name: i18n('Space name'),
  description: i18n('For example @bitcoin. The @ is optional.'),
  required: true,
  default: null,
  patterns: [spaceNamePattern],
})

const feeRate = Value.number({
  name: i18n('Fee rate'),
  description: i18n('Leave empty to let the wallet estimate a fee.'),
  required: false,
  default: null,
  min: 1,
  integer: true,
  units: 'sat/vB',
})

const feeArgs = (rate: number | null | undefined) =>
  rate ? ['--fee-rate', String(rate)] : []

const txResult = (title: string, out: string) => ({
  version: '1' as const,
  title,
  message: i18n(
    'Sent to the Bitcoin network. Check progress with the "My Spaces" action.',
  ),
  result: {
    type: 'multiline' as const,
    value: out,
    copyable: true,
    qr: false,
    masked: false,
    filename: null,
  },
})

export const openAuction = sdk.Action.withInput(
  'open-auction',

  async ({ effects }) => ({
    name: i18n('Open Auction'),
    description: i18n(
      'Open an auction for a space nobody has opened yet, with your first bid.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Auctions'),
    visibility: 'enabled',
  }),

  InputSpec.of({
    space: spaceName,
    amount: Value.number({
      name: i18n('Opening bid'),
      description: null,
      required: true,
      default: 1000,
      min: 1,
      integer: true,
      units: 'sats',
    }),
    feeRate,
  }),

  async ({ effects }) => {},

  async ({ effects, input }) => {
    const out = await spaceCli(
      effects,
      ['open', input.space, String(input.amount), ...feeArgs(input.feeRate)],
      { loadWallet: true },
    )
    return txResult(i18n('Auction Opened'), out)
  },
)

export const placeBid = sdk.Action.withInput(
  'place-bid',

  async ({ effects }) => ({
    name: i18n('Place Bid'),
    description: i18n('Bid on a space that is in auction.'),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Auctions'),
    visibility: 'enabled',
  }),

  InputSpec.of({
    space: spaceName,
    amount: Value.number({
      name: i18n('Bid'),
      description: i18n('Must be higher than the current winning bid.'),
      required: true,
      default: null,
      min: 1,
      integer: true,
      units: 'sats',
    }),
    feeRate,
  }),

  async ({ effects }) => {},

  async ({ effects, input }) => {
    const out = await spaceCli(
      effects,
      ['bid', input.space, String(input.amount), ...feeArgs(input.feeRate)],
      { loadWallet: true },
    )
    return txResult(i18n('Bid Placed'), out)
  },
)

export const registerSpace = sdk.Action.withInput(
  'register-space',

  async ({ effects }) => ({
    name: i18n('Register Space'),
    description: i18n(
      'Claim a space you won, once its auction has entered the claim period.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Auctions'),
    visibility: 'enabled',
  }),

  InputSpec.of({
    space: spaceName,
    feeRate,
  }),

  async ({ effects }) => {},

  async ({ effects, input }) => {
    const out = await spaceCli(
      effects,
      ['register', input.space, ...feeArgs(input.feeRate)],
      { loadWallet: true },
    )
    return txResult(i18n('Space Registered'), out)
  },
)
