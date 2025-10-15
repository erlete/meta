import { parsedConfig } from '../../config/parsed-config.mjs';

export const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${parsedConfig.urls.base}${parsedConfig.urls.paths.core}/1.0.0`,
  title: 'Source schemas base contract',
  description:
    'Authoring and shape of files in the schema configuration directory (source files).',
  type: 'object',
  required: ['name', 'version', 'title', 'description', 'domain'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', pattern: '^[A-Za-z0-9._-]+$' },
    version: {
      type: 'string',
      pattern:
        '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z-.]+)?(?:\\+[0-9A-Za-z-.]+)?$',
    },
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    draft: {
      type: 'string',
      enum: [
        'https://json-schema.org/draft/2020-12/schema',
        'https://json-schema.org/draft/2019-09/schema',
        'http://json-schema.org/draft-07/schema#',
      ],
      default: 'https://json-schema.org/draft/2020-12/schema',
    },
    authors: { type: 'array', items: { type: 'string' }, minItems: 1 },
    owners: { type: 'array', items: { type: 'string' } },
    source: { type: 'string', format: 'uri' },
    license: { type: 'string', default: 'AGPL-3.0-only' },
    status: {
      type: 'string',
      enum: ['draft', 'stable', 'deprecated'],
      default: 'stable',
    },
    domain: {
      type: 'object',
      description: 'User validation rules.',
      minProperties: 1,
    },
  },
};
