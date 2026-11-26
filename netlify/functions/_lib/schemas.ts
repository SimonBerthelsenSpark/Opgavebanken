import { AREAS, DIFFICULTIES } from '../../../src/shared/domain'

/** JSON Schemas for OpenAI Structured Outputs (strict mode: every key required, no extra keys). */

const str = { type: 'string' }
const int = { type: 'integer' }
const num = { type: 'number' }
const bool = { type: 'boolean' }
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})
const arr = (items: unknown) => ({ type: 'array', items })

export const planJsonSchema = obj({
  fit: obj({
    status: { type: 'string', enum: ['passer', 'for_svaert', 'for_let', 'uklart'] },
    explanation: str,
    suggestedGrades: arr(int),
  }),
  items: arr(
    obj({
      title: str,
      angle: str,
      difficulty: { type: 'string', enum: [...DIFFICULTIES] },
      area: { type: 'string', enum: [...AREAS] },
      topic: str,
      needsFigure: bool,
    }),
  ),
})

const shape = obj({
  kind: { type: 'string', enum: ['polygon', 'circle', 'segment'] },
  points: arr(arr(num)),
  radius: num,
  sideLabels: arr(str),
  rightAngles: arr(int),
  dashed: bool,
  label: str,
})

const figure = obj({
  unit: str,
  grid: bool,
  shapes: arr(shape),
  caption: str,
})

const part = obj({
  question: str,
  answer: str,
  solution: str,
  points: int,
  criteria: arr(obj({ points: int, description: str })),
  check: obj({
    expression: str,
    value: { type: ['number', 'null'] },
    unit: str,
  }),
})

export const tasksJsonSchema = obj({
  tasks: arr(
    obj({
      title: str,
      intro: str,
      figure: { anyOf: [figure, { type: 'null' }] },
      parts: arr(part),
      area: { type: 'string', enum: [...AREAS] },
      topic: str,
      difficulty: { type: 'string', enum: [...DIFFICULTIES] },
    }),
  ),
})
