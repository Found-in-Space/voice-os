export const tools = [{
  name: 'set_scale',
  description: 'Change the displayed scale and return the committed value.',
  parameters: { type: 'object', properties: { scale: { type: 'number', exclusiveMinimum: 0 } }, required: ['scale'], additionalProperties: false },
}];
