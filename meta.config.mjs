/** @type {import('./meta.config').Config} */
export const config = {
  dirs: {
    paths: {
      schemas: '/src/configuration/schemas',
      versions: '/versions',
    },
  },
  urls: {
    base: 'https://meta.erlete.dev',
    paths: {
      core: '/core',
      versions: '/versions',
    },
  },
  metadata: {
    repositoryUrl: 'https://github.com/erlete/meta',
    license: 'AGPL-3.0-only',
    authors: ['Paulo Sánchez (@erlete) <dev.szblzpaulo@gmail.com>'],
    owners: ['Paulo Sánchez (@erlete) <dev.szblzpaulo@gmail.com>'],
    defaultStatus: 'stable',
  },
};
