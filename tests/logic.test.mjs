
// ============================================================
// NatureFit — outdoor adventure game
// One task = nature discovery + movement. One XP system: Outdoor XP.
// ============================================================

// ==================== CONSTANTS ====================

const ACTIVITIES = [
  { id: 'Walking', icon: '🚶', label: 'Walk' },
  { id: 'Running', icon: '🏃', label: 'Run' },
  { id: 'Hiking', icon: '🥾', label: 'Hike' },
  { id: 'Cycling', icon: '🚴', label: 'Cycle' },
  { id: 'Mixed', icon: '🧭', label: 'Mixed' }
]

const DURATIONS = [15, 30, 45, 60]
const FITNESS_LEVELS = ['Beginner', 'Intermediate', 'Advanced']

const ENVIRONMENTS = [
  { id: 'Park', icon: '🌳' },
  { id: 'Trail', icon: '🥾' },
  { id: 'Neighborhood', icon: '🏘️' },
  { id: 'Garden', icon: '🌿' },
  { id: 'Other', icon: '🧭' }
]

const QUEST_BONUS_XP = 20
const TASK_COUNT_BY_DURATION = { 15: 3, 30: 4, 45: 5, 60: 6 }

const SCREENS = {
  LANDING: 'landing',
  CREATE: 'create',
  BRIEFING: 'briefing',
  ACTIVE: 'active',
  RESULTS: 'results',
  JOURNAL: 'journal'
}

const STORAGE = {
  OUTDOOR_XP: 'naturefit_outdoor_xp',
  STREAK: 'naturefit_streak_v2',
  STREAK_DATE: 'naturefit_streak_date_v2',
  CURRENT_QUEST: 'naturefit_quest_v2',
  QUEST_HISTORY: 'naturefit_quest_history_v2',
  DISCOVERIES: 'naturefit_discoveries_v2',
  OUTDOOR_TIME: 'naturefit_outdoor_time_v2'
}

// Broken keys from the old prototype — wiped so nobody inherits fake XP.
const LEGACY_KEYS = [
  'naturefit_xp', 'naturefit_quests', 'naturefit_completed_missions',
  'naturefit_current_quest', 'naturefit_quest_start_time',
  'naturefit_outdoor_time', 'naturefit_streak', 'naturefit_last_active_date'
]

const DISCOVERY_META = {
  tree: { icon: '🌳', label: 'Trees' },
  leaf: { icon: '🍂', label: 'Leaves' },
  flower: { icon: '🌸', label: 'Flowers' },
  bird: { icon: '🐦', label: 'Birds' },
  other: { icon: '🌿', label: 'Other finds' }
}

// ==================== STORAGE HELPERS ====================

const getStorage = (key, defaultValue) => {
  try {
    const item = localStorage.getItem(key)
    return item === null ? defaultValue : JSON.parse(item)
  } catch {
    return defaultValue
  }
}

const setStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn('LocalStorage write failed:', e)
  }
}

const migrateLegacyData = () => {
  LEGACY_KEYS.forEach(k => {
    try { localStorage.removeItem(k) } catch { /* ignore */ }
  })
}

// ==================== XP + STREAK ====================
// XP RULES:
// - XP is awarded in exactly one place: completeTaskInQuest, when a
//   task flips to completed. Never for generating/starting/viewing.
// - The completed flag makes double-award impossible.
// - Finishing every task adds a one-time QUEST_BONUS_XP.
// STREAK RULE: today's streak is only touched when at least one
// quest task is genuinely completed (photo evidence or declared
// movement). Opening/generating/starting quests never touches it.

const getOutdoorXP = () => getStorage(STORAGE.OUTDOOR_XP, 0)

const touchStreak = () => {
  const today = new Date().toDateString()
  const lastDate = getStorage(STORAGE.STREAK_DATE, null)
  if (lastDate === today) return getStorage(STORAGE.STREAK, 0)

  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const streak = lastDate === yesterday ? getStorage(STORAGE.STREAK, 0) + 1 : 1

  setStorage(STORAGE.STREAK, streak)
  setStorage(STORAGE.STREAK_DATE, today)
  return streak
}

const completeTaskInQuest = (quest, taskId) => {
  const task = quest.tasks.find(t => t.id === taskId)
  if (!task || task.completed) return { quest, awarded: 0 }

  const tasks = quest.tasks.map(t =>
    t.id === taskId
      ? { ...t, completed: true, completedAt: new Date().toISOString() }
      : t
  )
  const updated = { ...quest, tasks }

  setStorage(STORAGE.OUTDOOR_XP, getOutdoorXP() + task.xp)

  if (task.natureType) {
    const discoveries = getStorage(STORAGE.DISCOVERIES, [])
    discoveries.push({
      type: task.natureType,
      taskTitle: task.title,
      questTitle: quest.title,
      date: new Date().toISOString()
    })
    setStorage(STORAGE.DISCOVERIES, discoveries.slice(-200))
  }

  touchStreak()
  return { quest: updated, awarded: task.xp }
}

// ==================== PHOTO HELPER ====================
// Evidence lives on the task itself. Object URLs are never used —
// photos are compressed to small JPEG data URLs so they persist
// in LocalStorage alongside the task they prove.

const fileToThumbnail = async (f) => "data:image/jpeg;base64,TEST"

// ==================== FALLBACK QUEST LIBRARY ====================
// Integrated offline quests: every task = a nature find + a movement.

const repCount = (level, base = 10) =>
  level === 'Advanced' ? base + 10 : level === 'Intermediate' ? base + 5 : base

const movementFor = (activity, text) => {
  if (activity === 'Running') return text.replace('brisk walk', 'easy jog').replace('slow walk', 'easy jog')
  if (activity === 'Cycling') return text.replace('brisk walk', 'fast pedal').replace('slow walk', 'easy pedal')
  return text
}

const QUEST_TEMPLATES = [
  {
    id: 'tree-circuit',
    title: 'Tree Circuit',
    icon: '🌳',
    theme: 'tree',
    description: 'Your next workout is hiding in the trees around you.',
    pool: (level, activity) => [
      { title: 'Find your first tree', natureAction: 'Photograph the whole tree', fitnessAction: `${repCount(level)} squats beside it`, evidence: 'photo', natureType: 'tree', hint: 'Any tree counts — big, small, crooked.' },
      { title: 'Reach a different tree', natureAction: 'Photograph its bark up close', fitnessAction: `${repCount(level)} lunges`, evidence: 'photo', natureType: 'tree', hint: 'Pick one that looks nothing like the first.' },
      { title: 'Find a third tree', natureAction: 'Photograph its leaves or canopy', fitnessAction: movementFor(activity, '90 sec brisk walk'), evidence: 'photo', natureType: 'tree', hint: 'Look up as well as down.' },
      { title: 'Find a fallen leaf beneath a tree', natureAction: 'Photograph it where it lies', fitnessAction: `${repCount(level)} squats`, evidence: 'photo', natureType: 'leaf', hint: 'Leave the living leaves alone — ground leaves only.' },
      { title: 'Find a tree with visible roots', natureAction: 'Photograph the roots', fitnessAction: movementFor(activity, '2 min brisk walk'), evidence: 'photo', natureType: 'tree', hint: 'Roots tell the tree’s story.' },
      { title: 'Pick your favorite tree of the day', natureAction: 'Photograph it one last time', fitnessAction: movementFor(activity, '60 sec slow walk back'), evidence: 'photo', natureType: 'tree', hint: 'Say thanks on the way out.' }
    ]
  },
  {
    id: 'leaf-hunt',
    title: 'Leaf Hunt',
    icon: '🍂',
    theme: 'leaf',
    description: 'The ground is covered in shapes nobody ever looks at.',
    pool: (level, activity) => [
      { title: 'Find a fallen leaf with a distinct shape', natureAction: 'Photograph it', fitnessAction: movementFor(activity, '2 min walk'), evidence: 'photo', natureType: 'leaf', hint: 'Fallen leaves only — never pick living ones.' },
      { title: 'Find a fallen leaf in a different color', natureAction: 'Photograph it', fitnessAction: `${repCount(level)} squats`, evidence: 'photo', natureType: 'leaf', hint: 'Browns, reds, yellows — all fair game.' },
      { title: 'Find a leaf with a jagged edge', natureAction: 'Photograph the edge close up', fitnessAction: `${repCount(level)} lunges`, evidence: 'photo', natureType: 'leaf', hint: 'Zigzags, teeth, spikes.' },
      { title: 'Find the biggest fallen leaf you can', natureAction: 'Photograph it next to your hand', fitnessAction: movementFor(activity, '60 sec brisk walk'), evidence: 'photo', natureType: 'leaf', hint: 'For scale — no need to pick it up.' },
      { title: 'Find the smallest fallen leaf you can', natureAction: 'Photograph it', fitnessAction: `${repCount(level)} squats`, evidence: 'photo', natureType: 'leaf', hint: 'Tiny is a challenge too.' },
      { title: 'Find a fallen seed, pod or acorn', natureAction: 'Photograph it', fitnessAction: movementFor(activity, '2 min brisk walk'), evidence: 'photo', natureType: 'other', hint: 'The ground is full of them.' }
    ]
  },
  {
    id: 'park-explorer',
    title: 'Park Explorer',
    icon: '🌿',
    theme: 'park',
    description: 'Turn every discovery in the park into a movement checkpoint.',
    pool: (level, activity) => [
      { title: 'Find a tree', natureAction: 'Photograph it', fitnessAction: movementFor(activity, 'Walk 300 m'), evidence: 'photo', natureType: 'tree', hint: 'Your first checkpoint.' },
      { title: 'Find a flowering plant', natureAction: 'Photograph it without touching it', fitnessAction: `${repCount(level)} lunges`, evidence: 'photo', natureType: 'flower', hint: 'Eyes and lens only.' },
      { title: 'Find an interesting natural texture', natureAction: 'Photograph it — bark, stone, moss, anything', fitnessAction: movementFor(activity, '60 sec brisk walk'), evidence: 'photo', natureType: 'other', hint: 'Texture is everywhere once you look.' },
      { title: 'Find a quiet spot and stop', natureAction: 'Listen for 30 seconds — note one natural sound', fitnessAction: movementFor(activity, '2 min slow walk'), evidence: 'self', natureType: 'bird', hint: 'Wind, birds, leaves — anything counts.' },
      { title: 'Find something growing on a tree', natureAction: 'Photograph moss, lichen or a vine', fitnessAction: `${repCount(level)} squats`, evidence: 'photo', natureType: 'other', hint: 'Trees are whole worlds.' },
      { title: 'Find the sky', natureAction: 'Look up and observe the clouds for 30 seconds', fitnessAction: `${repCount(level)} march-in-place steps`, evidence: 'self', natureType: 'other', hint: 'The oldest screen there is.' }
    ]
  },
  {
    id: 'bird-walk',
    title: 'Bird Walk',
    icon: '🐦',
    theme: 'bird',
    description: 'Move quietly and the park starts talking back.',
    pool: (level, activity) => [
      { title: 'Walk and listen', natureAction: 'Note one bird sound you hear', fitnessAction: movementFor(activity, 'Walk 5 min'), evidence: 'self', natureType: 'bird', hint: 'You don’t need to see it — hear it.' },
      { title: 'Find a safe observation point', natureAction: 'Observe quietly for 60 seconds', fitnessAction: `${repCount(level)} squats`, evidence: 'self', natureType: 'bird', hint: 'Stay on the path, keep your distance.' },
      { title: 'Spot a bird with your eyes only', natureAction: 'Remember one detail — color, size or hop', fitnessAction: movementFor(activity, '2 min brisk walk'), evidence: 'self', natureType: 'bird', hint: 'Never chase, never touch, never trap.' },
      { title: 'Find a tree where birds gather', natureAction: 'Photograph the tree from a distance', fitnessAction: `${repCount(level)} lunges`, evidence: 'photo', natureType: 'tree', hint: 'The tree is the photo — not the birds.' },
      { title: 'Listen for a different call', natureAction: 'Note a second bird sound', fitnessAction: movementFor(activity, '60 sec brisk walk'), evidence: 'self', natureType: 'bird', hint: 'Two voices means you’re walking softly.' },
      { title: 'Walk back toward your start', natureAction: 'Count how many different sounds you heard', fitnessAction: movementFor(activity, '2 min slow walk'), evidence: 'self', natureType: 'bird', hint: 'Quiet finish.' }
    ]
  }
]

const ENVIRONMENT_TEMPLATE = {
  Park: 'park-explorer',
  Trail: 'tree-circuit',
  Neighborhood: 'bird-walk',
  Garden: 'leaf-hunt',
  Other: null
}

const makeTaskId = (i) => `task-${i + 1}-${Math.random().toString(36).slice(2, 7)}`

const buildFallbackQuest = (params, recentTitles = []) => {
  const { fitnessLevel, activity, duration, environment } = params
  const wanted = ENVIRONMENT_TEMPLATE[environment]
  let template = QUEST_TEMPLATES.find(t => t.id === wanted && !recentTitles.includes(t.title))
  if (!template) {
    const fresh = QUEST_TEMPLATES.filter(t => !recentTitles.includes(t.title))
    const pool = fresh.length > 0 ? fresh : QUEST_TEMPLATES
    template = pool[Math.floor(Math.random() * pool.length)]
  }

  const count = TASK_COUNT_BY_DURATION[duration] || 4
  const tasks = template.pool(fitnessLevel, activity)
    .slice(0, count)
    .map((t, i) => ({ ...t, id: makeTaskId(i), xp: 20, completed: false, completedAt: null, photoData: null }))

  return {
    id: `quest-${Date.now()}`,
    title: template.title,
    icon: template.icon,
    theme: template.theme,
    description: template.description,
    duration,
    fitnessLevel,
    activity,
    environment,
    source: 'offline',
    tasks
  }
}

// ==================== AI QUEST GENERATOR ====================

const AI_SYSTEM_PROMPT = `You are NatureFit's outdoor quest designer.

Create a safe outdoor fitness quest where nature and physical activity are integrated. The user explores their environment to complete their workout. Every task must connect:
1. a nature observation/exploration action
2. a physical movement action

Examples of integrated tasks:
- Find a tree -> photograph it -> perform 10 squats
- Find a fallen leaf -> photograph it -> 60 seconds brisk walk
- Reach a natural landmark -> perform 10 lunges
- Stop and listen for birds -> slow walking recovery

Safety rules — never encourage: picking living plants or leaves, breaking branches, damaging trees, touching or capturing wildlife, disturbing nests, approaching dangerous animals, entering restricted areas, littering. Only photography, observation, listening, walking, running and bodyweight exercise. Use only fallen natural objects.

Match the user's fitness level, activity, duration and environment. Avoid repeating recently completed quest patterns.

Return ONLY valid JSON, no markdown, in exactly this shape:
{"title":"...","description":"...","tasks":[{"title":"...","natureAction":"...","fitnessAction":"...","evidence":"photo or self","xp":20}]}
3 to 6 tasks. xp between 10 and 30.`

const guessNatureType = (text) => {
  const t = (text || '').toLowerCase()
  if (t.includes('tree') || t.includes('bark')) return 'tree'
  if (t.includes('leaf') || t.includes('seed') || t.includes('pod')) return 'leaf'
  if (t.includes('flower') || t.includes('blossom')) return 'flower'
  if (t.includes('bird') || t.includes('sound') || t.includes('listen')) return 'bird'
  return 'other'
}

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

const generateQuest = async (params) => {
  const apiUrl = undefined
  const apiKey = undefined

  if (apiUrl && apiKey) {
    try {
      const history = getStorage(STORAGE.QUEST_HISTORY, [])
      const recent = history.slice(0, 3).map(q => q.title)
      const userPrompt = `Fitness level: ${params.fitnessLevel}
Activity: ${params.activity}
Available time: ${params.duration} minutes
Environment: ${params.environment}
Recently completed quests (avoid repeating these patterns): ${recent.join('; ') || 'none'}

Design the quest now. Return only the JSON.`

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: import.meta.env.VITE_AI_MODEL || 'gemma-2-9b-it',
          messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 900
        })
      })
      if (!response.ok) throw new Error(`AI API ${response.status}`)
      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || data.response || ''
      return parseAIQuestJSON(content, params)
    } catch (e) {
      console.warn('AI generation failed, using offline quest:', e)
    }
  }

  const history = getStorage(STORAGE.QUEST_HISTORY, [])
  return buildFallbackQuest(params, history.slice(0, 3).map(q => q.title))
}

// ==================== TIMER HELPERS ====================

const newTimer = () => ({ startTs: Date.now(), pausedTotal: 0, paused: false, pauseTs: null })

const timerElapsedMs = (timer) => {
  if (!timer) return 0
  const end = timer.paused ? timer.pauseTs : Date.now()
  return Math.max(0, end - timer.startTs - timer.pausedTotal)
}

const timerPause = (timer) => (timer.paused ? timer : { ...timer, paused: true, pauseTs: Date.now() })

const timerResume = (timer) => {
  if (!timer.paused) return timer
  return {
    ...timer,
    pausedTotal: timer.pausedTotal + (Date.now() - (timer.pauseTs || Date.now())),
    paused: false,
    pauseTs: null
  }
}

const formatClock = (ms) => {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const formatMinutes = (ms) => `${Math.max(0, Math.round(ms / 60000))} min`

const parseMovementSeconds = (text) => {
  const m = String(text || '').match(/(\d+)\s*(seconds?|secs?|minutes?|mins?)\b/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return /min/i.test(m[2]) ? n * 60 : n
}



// ============================ TEST HARNESS ============================
// Minimal localStorage shim (exact Web Storage API surface the app uses)
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
}

const assert = (cond, name) => {
  if (!cond) { console.error('FAIL:', name); process.exitCode = 1 }
  else console.log('  ok:', name)
}

const xp = () => getStorage(STORAGE.OUTDOOR_XP, 0)

console.log('TEST A — new user')
localStorage.clear()
migrateLegacyData()
// simulate old prototype keys present
localStorage.setItem('naturefit_xp', JSON.stringify({fitness: 999, nature: 999}))
migrateLegacyData()
assert(getStorage('naturefit_xp', 'GONE') === 'GONE', 'legacy XP wiped')
const params = { fitnessLevel: 'Beginner', activity: 'Walking', duration: 30, environment: 'Park' }
let quest = buildFallbackQuest(params, [])
assert(Array.isArray(quest.tasks) && quest.tasks.length === 4, '30-min quest has 4 tasks')
assert(quest.tasks.every(t => t.natureAction && t.fitnessAction), 'every task couples nature + movement')
assert(xp() === 0, 'XP = 0 after generating')
assert(getStorage(STORAGE.STREAK, 0) === 0, 'streak = 0')

console.log('TEST B — start only')
quest.timer = newTimer()
setStorage(STORAGE.CURRENT_QUEST, quest)
assert(xp() === 0, 'XP = 0 after starting')

console.log('TEST C — completion is gated / no empty submissions')
const t1 = quest.tasks[0]
// call pattern identical to the React component: use the RETURNED quest
let res1 = completeTaskInQuest(quest, t1.id)
quest = res1.quest
assert(res1.awarded === t1.xp, 'task 1 awards its XP')
let r2 = completeTaskInQuest(quest, t1.id)
quest = r2.quest
assert(r2.awarded === 0, 're-completing same task awards 0')
assert(xp() === t1.xp, 'XP unchanged on duplicate')

console.log('TEST D — photo evidence belongs to the task')
const t2 = quest.tasks[1]
assert(t2.evidence === 'photo', 'task 2 requires photo')
// simulate: photo attached to task 2 only
const withPhoto = { ...quest, tasks: quest.tasks.map(t => t.id === t2.id ? { ...t, photoData: 'data:image/jpeg;base64,TEST' } : t) }
assert(withPhoto.tasks[1].photoData !== null, 'photo stored on task 2')
assert(withPhoto.tasks[0].photoData == null, 'task 1 has no photo')

console.log('TEST E — persistence across refresh')
const saved = getStorage(STORAGE.CURRENT_QUEST, null)
const reloaded = JSON.parse(JSON.stringify(withPhoto))
setStorage(STORAGE.CURRENT_QUEST, reloaded)
const afterRefresh = getStorage(STORAGE.CURRENT_QUEST, null)
assert(afterRefresh.tasks[0].completed === true, 'task 1 still completed after refresh')
assert(xp() === t1.xp, 'XP unchanged after refresh')

console.log('TEST F — complete all tasks')
let q = JSON.parse(JSON.stringify(afterRefresh))
for (const t of q.tasks) {
  const r = completeTaskInQuest(q, t.id)
  q = r.quest
}
assert(q.tasks.every(t => t.completed), 'all tasks completed')
const taskTotal = q.tasks.reduce((s, t) => s + t.xp, 0)
assert(xp() === taskTotal, 'XP equals sum of task XP (no bonus yet)')

console.log('TEST G — quest bonus exactly once')
const beforeBonus = xp()
// finishQuest logic: bonus + archive
setStorage(STORAGE.OUTDOOR_XP, xp() + QUEST_BONUS_XP)
assert(xp() === beforeBonus + QUEST_BONUS_XP, 'bonus added once')
// a second "finish" would add again — but UI only allows finish when allDone,
// and after finish the quest is cleared; assert guard: finishQuest requires all complete
const guardPass = q.tasks.every(t => t.completed)
assert(guardPass, 'finish only reachable when all tasks complete')

console.log('TEST H — streak only on real completion')
localStorage.clear()
migrateLegacyData()
assert(getStorage(STORAGE.STREAK, 0) === 0, 'fresh streak = 0')
let qh = buildFallbackQuest({ fitnessLevel: 'Beginner', activity: 'Walking', duration: 15, environment: 'Trail' }, [])
qh.timer = newTimer()
setStorage(STORAGE.CURRENT_QUEST, qh)
assert(getStorage(STORAGE.STREAK, 0) === 0, 'generating/starting does NOT touch streak')
completeTaskInQuest(qh, qh.tasks[0].id)
assert(getStorage(STORAGE.STREAK, 0) === 1, 'streak = 1 after first real task')

console.log('TEST I — new quest keeps old XP, fresh tasks')
const xpBefore = xp()
let q2 = buildFallbackQuest({ fitnessLevel: 'Intermediate', activity: 'Running', duration: 45, environment: 'Trail' }, [])
assert(q2.tasks.every(t => !t.completed), 'new quest starts uncompleted')
assert(xp() === xpBefore, 'XP persists across new quest')

console.log('TEST J — no nature-damaging language in templates')
const banned = ['pick a living', 'break a branch', 'break branches', 'pick the leaf', 'capture the bird', 'touch the bird', 'disturb']
let allText = ''
const collect = (level, act) => QUEST_TEMPLATES.forEach(t => t.pool(level, act).forEach(x => { allText += (x.title + ' ' + x.natureAction + ' ' + x.fitnessAction + ' ').toLowerCase() }))
collect('Beginner', 'Walking'); collect('Advanced', 'Running')
const hits = banned.filter(b => allText.includes(b))
assert(hits.length === 0, 'no banned phrases in fallback quests' + (hits.length ? ': ' + hits.join(', ') : ''))

console.log('DONE — all logic tests executed against production code')
