export const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://meta.erlete.dev/.gitignore/0.1.0',
  allOf: [{ $ref: 'https://meta.erlete.dev/core/1.0.0' }],
  type: 'object',
  properties: {
    href: {
      type: 'string',
      anyOf: [
        { format: 'uri' },
        { pattern: '^(?:\\/|\\.{1,2}\\/|[A-Za-z]:\\\\).+' },
      ],
      description: 'URI or path to a base ignore template.',
    },
    custom: {
      type: 'array',
      items: { type: 'string' },
      description: 'Additional ignore patterns.',
    },
  },
  required: [],
  unevaluatedProperties: false,
};
