import { CriterionKeys, type CriterionKey } from '@/lib/writing-record-types'

export type Criterion = CriterionKey

const aliases: Record<string, Criterion> = {
  ta: 'taskAchievement',
  tr: 'taskResponse',
  cc: 'coherenceCohesion',
  lr: 'lexicalResource',
  gra: 'grammaticalRangeAccuracy',
  coherenceandcohesion: 'coherenceCohesion',
  grammaticalrangeandaccuracy: 'grammaticalRangeAccuracy',
  grammar: 'grammaticalRangeAccuracy'
}
for (const key of CriterionKeys) aliases[key.toLowerCase()] = key

export function normalizeCriterion(value: string): Criterion | undefined {
  const key = value.toLowerCase().replace(/[^a-z]/g, '')
  return Object.hasOwn(aliases, key) ? aliases[key] : undefined
}
