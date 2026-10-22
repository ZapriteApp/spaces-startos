import { existsSync } from 'fs'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { spaceCli, walletFile } from '../utils'

export const createWallet = sdk.Action.withoutInput(
  'create-wallet',

  async ({ effects }) => ({
    name: i18n('Create Wallet'),
    description: i18n(
      'Create the Spaces wallet that holds your bitcoin for bids and the spaces you win.',
    ),
    warning: i18n(
      'Your recovery phrase is shown once, on the next screen. Write it down before closing it.',
    ),
    allowedStatuses: 'only-running',
    group: i18n('Wallet'),
    visibility: existsSync(walletFile)
      ? { disabled: i18n('The wallet already exists.') }
      : 'enabled',
  }),

  async ({ effects }) => {
    // Its success output also starts with a warning sign, so read it raw.
    const out = await spaceCli(effects, ['createwallet'], { raw: true })
    const lines = out.split('\n').map((l) => l.trim())
    if (!lines.some((l) => l.includes('recovery phrase'))) {
      throw new Error(out.replace(/^⚠️\s*/, ''))
    }
    const phrase = lines[lines.length - 1]

    return {
      version: '1',
      title: i18n('Wallet Created'),
      message: i18n(
        'This is the only time the recovery phrase is shown. Write it down and keep it offline: it is the only way to recover the wallet if this server and its backups are lost.',
      ),
      result: {
        type: 'single',
        value: phrase,
        copyable: true,
        qr: false,
        masked: true,
        launchable: false,
      },
    }
  },
)
