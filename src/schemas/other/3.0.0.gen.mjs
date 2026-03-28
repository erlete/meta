export const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://meta.erlete.dev/other/3.0.0',
  allOf: [{ $ref: 'https://meta.erlete.dev/core/1.0.0' }],
  type: 'object',
  properties: { extra: { type: 'string' } },
  required: ['extra'],
  unevaluatedProperties: false,
};
