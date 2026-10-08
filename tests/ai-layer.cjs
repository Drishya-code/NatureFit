//==================== TESTABLE AI LAYER ====================
// Extracted VERBATIM from src/App.jsx by tests/extract-ai-layer.py
// (re-run that script after editing the AI layer in App.jsx)
// Do not hand-edit.

"use strict"


const makeTaskId = (i) => `task-${i + 1}-${Math.random().toString(36).slice(2, 7)}`

const guessNatureType = (text) => {
  const t = (text || '').toLowerCase()
  if (t.includes('tree') || t.includes('bark')) return 'tree'
  if (t.includes('leaf') || t.includes('seed') || t.includes('pod')) return 'leaf'
  if (t.includes('flower') || t.includes('blossom')) return 'flower'
  if (t.includes('bird') || t.includes('sound') || t.includes('listen')) return 'bird'
  return 'other'
}

const UNSAFE_PATTERNS = [
    'pick a living', 'pick a flower', 'pick living', 'pick the leaf',
    'break a branch', 'break branch', 'damage a tree', 'damage the tree',
    'disturb a nest', 'disturb nest', 'capture a bird', 'capture bird',
    'touch wildlife', 'touch the wildlife', 'destroy a plant', 'destroy plant',
    'pluck a', 'pluck the', 'remove a', 'remove the', 'take a', 'take the',
    'collect a living', 'collect living', 'harvest a', 'harvest the',
    'pull up', 'pull out', 'dig up', 'cut a', 'cut the', 'chop a', 'chop the'
  ]

const parseAIQuestJSON = (content, params) => {
let text = String(content || '').trim()
const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
if (fence) text = fence[1].trim()
const start = text.indexOf('{')
const end = text.lastIndexOf('}')
if (start === -1 || end === -1) throw new Error('No JSON in AI response')
const raw = JSON.parse(text.slice(start, end + 1))

if (!raw.title || !Array.isArray(raw.tasks) || raw.tasks.length < 2) {
  throw new Error('AI quest missing title or tasks')
}

const tasks = raw.tasks.slice(0, 6).map((t, i) => ({
  id: makeTaskId(i),
  title: String(t.title || `Checkpoint ${i + 1}`).slice(0, 80),
  natureAction: String(t.natureAction || 'Observe something in nature').slice(0, 140),
  fitnessAction: String(t.fitnessAction || 'Walk for 1 minute').slice(0, 140),
  evidence: t.evidence === 'self' ? 'self' : 'photo',
  natureType: guessNatureType(`${t.title} ${t.natureAction}`),
  xp: Math.min(30, Math.max(10, Number(t.xp) || 20)),
  hint: 'Look around — the checkpoint is out there.',
  completed: false,
  completedAt: null,
  photoData: null
}))

return {
    id: `quest-${Date.now()}`,
    title: String(raw.title).slice(0, 60),
    icon: '🌿',
    theme: 'ai',
    description: String(raw.description || 'An AI-crafted outdoor adventure.').slice(0, 160),
    duration: params.duration,
    fitnessLevel: params.fitnessLevel,
    activity: params.activity,
    environment: params.environment,
    source: 'ai',
    tasks
  }
}

const validateQuestStructure = (quest) => {
    if (!quest || typeof quest !== 'object') return false
    if (!quest.title || !String(quest.title).trim()) return false
    if (!quest.description || !String(quest.description).trim()) return false
    if (typeof quest.duration !== 'number' || quest.duration <= 0) return false
    if (!Array.isArray(quest.tasks) || quest.tasks.length < 2) return false

    const allowedEvidence = new Set(['photo', 'self'])
    const allowedNatureType = new Set(['tree', 'leaf', 'flower', 'bird', 'other'])

    for (const task of quest.tasks) {
      if (!task.title || !String(task.title).trim()) return false
      if (!task.natureAction || !String(task.natureAction).trim()) return false
      if (!task.fitnessAction || !String(task.fitnessAction).trim()) return false
      if (!allowedEvidence.has(task.evidence)) return false
      if (!allowedNatureType.has(task.natureType)) return false
      if (typeof task.xp !== 'number' || task.xp < 10 || task.xp > 50) return false
    }
    return true
  }

const hasUnsafeContent = (quest) => {
    const text = `${quest.title} ${quest.description} ${quest.tasks.map(t => t.natureAction + ' ' + t.fitnessAction).join(' ')}`.toLowerCase()
    return UNSAFE_PATTERNS.some(p => text.includes(p))
  }

module.exports = {
  UNSAFE_PATTERNS,
  makeTaskId,
  guessNatureType,
  parseAIQuestJSON,
  validateQuestStructure,
  hasUnsafeContent
}
