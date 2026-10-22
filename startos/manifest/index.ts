import { setupManifest } from '@start9labs/start-sdk'
import { long, short } from './i18n'

export const manifest = setupManifest({
  id: 'spaces',
  title: 'Spaces',
  license: 'MIT',
  packageRepo: 'https://github.com/ZapriteApp/spaces-startos',
  upstreamRepo: 'https://github.com/spacesprotocol/spaces',
  marketingUrl: 'https://spacesprotocol.org/',
  donationUrl: null,
  description: { short, long },
  volumes: ['main', 'startos'],
  images: {
    spaces: {
      source: {
        dockerBuild: {
          dockerfile: 'Dockerfile',
          workdir: '.',
        },
      },
      arch: ['x86_64', 'aarch64'],
      emulateMissing: false,
    },
  },
})
