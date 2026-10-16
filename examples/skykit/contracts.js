export const tools = [
  { name: 'get_view', description: 'Read the current observer coordinates in parsecs and look direction.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'look_at', description: 'Look toward ICRS right ascension and declination, in degrees.', parameters: {
    type: 'object', properties: { right_ascension_degrees: { type: 'number', minimum: 0, maximum: 360 }, declination_degrees: { type: 'number', minimum: -90, maximum: 90 } },
    required: ['right_ascension_degrees', 'declination_degrees'], additionalProperties: false,
  } },
];
