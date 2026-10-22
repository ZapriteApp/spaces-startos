import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { spaceCli } from '../utils'

export const trustId = sdk.Action.withoutInput(
  'trust-id',

  async ({ effects }) => ({
    name: i18n('Show Trust ID'),
    description: i18n(
      'Show the Trust ID of this node, to scan into Nacho or another Spaces app so it verifies against your own node.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    const out = await spaceCli(effects, ['trust', '--no-qr'])
    // "<hex id>  height <n>", or a notice while root anchors are still syncing
    const match = out.match(/^([0-9a-f]{64})\s+height\s+(\d+)/)
    if (!match) {
      return {
        version: '1',
        title: i18n('Trust ID'),
        message: out,
        result: null,
      }
    }
    const [, id, height] = match

    return {
      version: '1',
      title: i18n('Trust ID'),
      message: i18n(
        'Scan the code in a Spaces app. This ID is from block ${height}.',
        {
          height,
        },
      ),
      result: {
        type: 'group',
        value: [
          {
            type: 'single',
            name: i18n('Scan link'),
            description: null,
            value: `veritas://scan?id=${id}`,
            copyable: true,
            qr: true,
            masked: false,
            launchable: false,
          },
          {
            type: 'single',
            name: i18n('Trust ID'),
            description: null,
            value: id,
            copyable: true,
            qr: false,
            masked: false,
            launchable: false,
          },
        ],
      },
    }
  },
)
