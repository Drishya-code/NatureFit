import { useState, useEffect } from 'react'

// ============================================================
// NatureFit — outdoor adventure game
// One task = nature discovery + movement. One XP system: Outdoor XP.
// ============================================================

// ==================== PWA HELPERS ====================
// Online/offline detection, install prompt handling, SW registration

const PWA_STORAGE = 'naturefit_pwa_v1'

const getPWAPrefs = () => {
  try {
    const item = localStorage.getItem(PWA_STORAGE)
    return item === null ? { installDismissed: false } : JSON.parse(item)
  } catch {
    return { installDismissed: false }
  }
}

const setPWAPrefs = (prefs) => {
  try {
    localStorage.setItem(PWA_STORAGE, JSON.stringify(prefs))
  } catch (e) {
    console.warn('PWA prefs write failed:', e)
  }
}

// Online/offline detection hook
const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

// Install prompt hook
const useInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [canInstall, setCanInstall] = useState(false)
  const prefs = getPWAPrefs()

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setCanInstall(true)
    }
    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setCanInstall(false)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const install = async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setCanInstall(false)
      return true
    }
    return false
  }

  const dismiss = () => {
    setCanInstall(false)
    setPWAPrefs({ ...prefs, installDismissed: true })
  }

  return { canInstall: canInstall && !prefs.installDismissed, install, dismiss }
}

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

const fileToThumbnail = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 420
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.6))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

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

  const UNSAFE_PATTERNS = [
    'pick a living', 'pick a flower', 'pick living', 'pick the leaf',
    'break a branch', 'break branch', 'damage a tree', 'damage the tree',
    'disturb a nest', 'disturb nest', 'capture a bird', 'capture bird',
    'touch wildlife', 'touch the wildlife', 'destroy a plant', 'destroy plant',
    'pluck a', 'pluck the', 'remove a', 'remove the', 'take a', 'take the',
    'collect a living', 'collect living', 'harvest a', 'harvest the',
    'pull up', 'pull out', 'dig up', 'cut a', 'cut the', 'chop a', 'chop the'
  ]

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

  const generateQuest = async (params) => {
  const apiUrl = import.meta.env.VITE_AI_API_URL
  const apiKey = import.meta.env.VITE_AI_API_KEY

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
      const candidate = parseAIQuestJSON(content, params)
      if (!validateQuestStructure(candidate)) {
        throw new Error('AI quest failed structure validation')
      }
      if (hasUnsafeContent(candidate)) {
        throw new Error('AI quest contained unsafe nature instructions')
      }
      return candidate
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

// ==================== APP ====================

function App() {
  const [screen, setScreen] = useState(SCREENS.LANDING)
  const [quest, setQuest] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const isOnline = useOnlineStatus()
  const { canInstall, install, dismiss } = useInstallPrompt()
  const [updateReady, setUpdateReady] = useState(false)

  // Wipe the old broken prototype data once, then restore any in-progress quest.
  useEffect(() => {
    migrateLegacyData()
    const saved = getStorage(STORAGE.CURRENT_QUEST, null)
    if (saved && Array.isArray(saved.tasks)) {
      let q = saved
      if (q.timer && timerElapsedMs(q.timer) > (q.duration || 30) * 120000) {
        q = { ...q, timer: newTimer() }
      }
      setQuest(q)
      setScreen(q.timer ? SCREENS.ACTIVE : SCREENS.BRIEFING)
    }
  }, [])

  // Service worker update flow: never force-refresh mid-quest.
  useEffect(() => {
    const onUpdateReady = () => setUpdateReady(true)
    window.addEventListener('naturefit-update-ready', onUpdateReady)
    return () => window.removeEventListener('naturefit-update-ready', onUpdateReady)
  }, [])

  const persistQuest = (q) => {
    setQuest(q)
    setStorage(STORAGE.CURRENT_QUEST, q)
  }

  const handleGenerate = async (params, forceOffline = false) => {
    setGenerating(true)
    setGenError(false)
    try {
      let newQuest
      if (forceOffline) {
        const history = getStorage(STORAGE.QUEST_HISTORY, [])
        newQuest = buildFallbackQuest(params, history.slice(0, 3).map(q => q.title))
      } else {
        newQuest = await generateQuest(params)
      }
      persistQuest(newQuest)
      setScreen(SCREENS.BRIEFING)
    } catch (e) {
      console.error(e)
      setGenError(true)
    } finally {
      setGenerating(false)
    }
  }

  const startQuest = () => {
    persistQuest({ ...quest, timer: newTimer() })
    setScreen(SCREENS.ACTIVE)
  }

  // Award bonus, archive the quest, record honest outdoor time, clear state.
  const finishQuest = () => {
    const q = quest
    if (!q || q.tasks.some(t => !t.completed)) return

    const elapsedMs = timerElapsedMs(q.timer)
    const taskXP = q.tasks.reduce((sum, t) => sum + t.xp, 0)

    setStorage(STORAGE.OUTDOOR_XP, getOutdoorXP() + QUEST_BONUS_XP)

    const history = getStorage(STORAGE.QUEST_HISTORY, [])
    history.unshift({
      id: q.id,
      title: q.title,
      icon: q.icon,
      date: new Date().toISOString(),
      elapsedMinutes: Math.round(elapsedMs / 60000),
      xpEarned: taskXP + QUEST_BONUS_XP,
      tasksCompleted: q.tasks.length,
      tasksTotal: q.tasks.length,
      photosTaken: q.tasks.filter(t => t.photoData).length
    })
    setStorage(STORAGE.QUEST_HISTORY, history.slice(0, 30))

    setStorage(STORAGE.OUTDOOR_TIME, getStorage(STORAGE.OUTDOOR_TIME, 0) + Math.round(elapsedMs / 60000))

    setLastResult({
      title: q.title,
      icon: q.icon,
      xpEarned: taskXP + QUEST_BONUS_XP,
      bonus: QUEST_BONUS_XP,
      elapsedMs,
      tasks: q.tasks,
      streak: getStorage(STORAGE.STREAK, 0)
    })

    persistQuest(null)
    setScreen(SCREENS.RESULTS)
  }

  const abandonQuest = () => {
    persistQuest(null)
    setScreen(SCREENS.JOURNAL)
  }

  const pwa = { isOnline, canInstall, install, dismiss, updateReady }

  if (screen === SCREENS.LANDING) {
    return (
      <>
        <PWAStatusBar {...pwa} />
        <Landing onStart={() => setScreen(SCREENS.CREATE)} onJournal={() => setScreen(SCREENS.JOURNAL)} />
      </>
    )
  }

  if (screen === SCREENS.CREATE) {
    return (
      <>
        <PWAStatusBar {...pwa} />
        <CreateQuest
          isOnline={isOnline}
          onGenerate={handleGenerate}
          generating={generating}
          error={genError}
          onOffline={(params) => handleGenerate(params, true)}
          onBack={() => { setGenError(false); setScreen(SCREENS.LANDING) }}
        />
      </>
    )
  }

  if (screen === SCREENS.BRIEFING && quest) {
    return (
      <>
        <PWAStatusBar {...pwa} />
        <QuestBriefing quest={quest} onStart={startQuest} onBack={() => setScreen(SCREENS.CREATE)} onAbandon={abandonQuest} />
      </>
    )
  }

  if (screen === SCREENS.ACTIVE && quest) {
    return (
      <>
        <PWAStatusBar {...pwa} />
        <ActiveQuest quest={quest} onUpdate={persistQuest} onFinish={finishQuest} onAbandon={abandonQuest} />
      </>
    )
  }

  if (screen === SCREENS.RESULTS && lastResult) {
    return (
      <>
        <PWAStatusBar {...pwa} />
        <Results result={lastResult} onNewQuest={() => setScreen(SCREENS.CREATE)} onJournal={() => setScreen(SCREENS.JOURNAL)} />
      </>
    )
  }

  if (screen === SCREENS.JOURNAL) {
    return (
      <>
        <PWAStatusBar {...pwa} />
        <Journal quest={quest} onNewQuest={() => setScreen(SCREENS.CREATE)} onContinue={() => setScreen(SCREENS.ACTIVE)} onBack={() => setScreen(SCREENS.LANDING)} />
      </>
    )
  }

  return (
    <>
      <PWAStatusBar {...pwa} />
      <Landing onStart={() => setScreen(SCREENS.CREATE)} onJournal={() => setScreen(SCREENS.JOURNAL)} />
    </>
  )
}

// ==================== PWA STATUS BAR ====================
// Subtle online/offline + install + update indicators. The app itself
// stays fully usable regardless of these states.

function PWAStatusBar({ isOnline, canInstall, install, dismiss, updateReady }) {
  return (
    <>
      {!isOnline && (
        <div className="pwa-offline" role="status">
          <span className="pwa-dot pwa-dot-off" aria-hidden="true">○</span>
          <span><strong>Offline</strong> — AI quests unavailable. Ready-made quests are available.</span>
        </div>
      )}
      {updateReady && (
        <div className="pwa-update" role="status">
          <span>A new version of NatureFit is available. Refresh when you're ready.</span>
        </div>
      )}
      {canInstall && (
        <div className="pwa-install" role="dialog" aria-label="Install NatureFit">
          <div>
            <strong>🌿 Take NatureFit with you</strong>
            <p>Install for quick access to your outdoor quests.</p>
          </div>
          <div className="pwa-install-actions">
            <button className="btn btn-small" onClick={install}>Install app</button>
            <button className="btn-link" onClick={dismiss}>Maybe later</button>
          </div>
        </div>
      )}
    </>
  )
}

// ==================== LANDING ====================

function Landing({ onStart, onJournal }) {
  const hasHistory = getStorage(STORAGE.QUEST_HISTORY, []).length > 0

  return (
    <div className="screen landing">
      <div className="landing-inner">
        <div className="hero">
          <div className="hero-leaf" aria-hidden="true">🌿</div>
          <h1 className="hero-title">NatureFit</h1>
          <p className="hero-line">Your surroundings are your gym.</p>
          <p className="hero-sub">
            AI creates outdoor quests that turn trees, trails, leaves and
            natural discoveries into movement challenges.
          </p>
          <button className="btn btn-primary btn-hero" onClick={onStart}>
            Start a Quest →
          </button>
          {hasHistory && (
            <button className="btn btn-ghost" onClick={onJournal}>View my progress</button>
          )}
        </div>

        <div className="how-it-works">
          <h2 className="how-title">How it works</h2>
          <ol className="how-steps">
            <li className="how-step">
              <span className="how-num">01</span>
              <span className="how-icon" aria-hidden="true">🌿</span>
              <div><strong>Explore</strong><p>Find something in nature.</p></div>
            </li>
            <li className="how-step">
              <span className="how-num">02</span>
              <span className="how-icon" aria-hidden="true">🏃</span>
              <div><strong>Move</strong><p>Turn the discovery into a movement challenge.</p></div>
            </li>
            <li className="how-step">
              <span className="how-num">03</span>
              <span className="how-icon" aria-hidden="true">📸</span>
              <div><strong>Prove it</strong><p>Capture your observation.</p></div>
            </li>
            <li className="how-step">
              <span className="how-num">04</span>
              <span className="how-icon" aria-hidden="true">⭐</span>
              <div><strong>Earn</strong><p>Complete your quest and earn Outdoor XP.</p></div>
            </li>
          </ol>
          <p className="privacy-note">Your outdoor activity history can stay on your device.</p>
        </div>
      </div>
    </div>
  )
}

// ==================== CREATE QUEST ====================

function CreateQuest({ onGenerate, generating, error, onOffline, onBack, isOnline = true }) {
  const [activity, setActivity] = useState('Walking')
  const [duration, setDuration] = useState(30)
  const [fitnessLevel, setFitnessLevel] = useState('Beginner')
  const [environment, setEnvironment] = useState('Park')

  const params = { activity, duration, fitnessLevel, environment }

  if (generating) {
    return (
      <div className="screen generating">
        <div className="generating-inner">
          <div className="generating-leaf" aria-hidden="true">🌿</div>
          <p className="generating-text">Planning your outdoor adventure…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen create">
      <button className="btn-back" onClick={onBack} aria-label="Back">←</button>

      <div className="create-inner">
        <header className="section-header">
          <h2>Create your quest</h2>
        </header>

        <section className="pick-section">
          <h3 className="pick-label">How are you moving?</h3>
          <div className="option-grid">
            {ACTIVITIES.map(a => (
              <button
                key={a.id}
                type="button"
                className={`option-card ${activity === a.id ? 'active' : ''}`}
                onClick={() => setActivity(a.id)}
                aria-pressed={activity === a.id}
              >
                <span className="option-icon" aria-hidden="true">{a.icon}</span>
                <span className="option-label">{a.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="pick-section">
          <h3 className="pick-label">Time outside</h3>
          <div className="segment-row" role="group" aria-label="Duration">
            {DURATIONS.map(d => (
              <button
                key={d}
                type="button"
                className={`segment ${duration === d ? 'active' : ''}`}
                onClick={() => setDuration(d)}
                aria-pressed={duration === d}
              >
                {d} min
              </button>
            ))}
          </div>
        </section>

        <section className="pick-section">
          <h3 className="pick-label">Your level</h3>
          <div className="segment-row" role="group" aria-label="Fitness level">
            {FITNESS_LEVELS.map(l => (
              <button
                key={l}
                type="button"
                className={`segment ${fitnessLevel === l ? 'active' : ''}`}
                onClick={() => setFitnessLevel(l)}
                aria-pressed={fitnessLevel === l}
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        <section className="pick-section">
          <h3 className="pick-label">Where are you going?</h3>
          <div className="option-grid option-grid-env">
            {ENVIRONMENTS.map(e => (
              <button
                key={e.id}
                type="button"
                className={`option-card ${environment === e.id ? 'active' : ''}`}
                onClick={() => setEnvironment(e.id)}
                aria-pressed={environment === e.id}
              >
                <span className="option-icon" aria-hidden="true">{e.icon}</span>
                <span className="option-label">{e.id}</span>
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div className="error-box" role="alert">
            <p><strong>We couldn’t create your quest.</strong></p>
            <p>Your model connection isn’t available right now.</p>
            <div className="error-actions">
              <button className="btn btn-secondary" onClick={() => onGenerate(params)}>Try again</button>
              <button className="btn btn-primary" onClick={() => onOffline(params)}>Use offline quest</button>
            </div>
          </div>
        )}

        <button className="btn btn-primary btn-generate" onClick={() => onGenerate(params)}>
          Generate my quest →
        </button>
      </div>
    </div>
  )
}

// ==================== QUEST BRIEFING ====================

function QuestBriefing({ quest, onStart, onBack, onAbandon }) {
  return (
    <div className="screen briefing">
      <button className="btn-back" onClick={onBack} aria-label="Back">←</button>

      <div className="briefing-inner">
        <p className="kicker">Today’s quest</p>
        <div className={`quest-hero quest-theme-${quest.theme}`}>
          <span className="quest-hero-icon" aria-hidden="true">{quest.icon}</span>
          <h2 className="quest-hero-title">{quest.title}</h2>
          <p className="quest-hero-meta">{quest.duration} minutes · {quest.fitnessLevel} · {quest.environment}</p>
          <p className="quest-hero-desc">“{quest.description}”</p>
          <span className={`badge ${quest.source === 'ai' ? 'badge-ai' : 'badge-offline'}`}>
            {quest.source === 'ai' ? 'AI-designed quest' : 'Offline quest'}
          </span>
        </div>

        <ol className="checkpoint-list">
          {quest.tasks.map((task, i) => (
            <li key={task.id} className={`checkpoint ${task.completed ? 'done' : ''}`}>
              <div className="checkpoint-left">
                <span className="checkpoint-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="checkpoint-line" aria-hidden="true" />
              </div>
              <div className="checkpoint-body">
                <h4 className="checkpoint-title">{task.title}</h4>
                <p className="checkpoint-nature">📸 {task.natureAction}</p>
                <p className="checkpoint-fitness">🏃 Then: {task.fitnessAction}</p>
                {task.completed
                  ? <span className="checkpoint-done">✓ Complete</span>
                  : <span className="checkpoint-xp">+{task.xp} Outdoor XP</span>}
              </div>
            </li>
          ))}
        </ol>

        <button className="btn btn-primary btn-hero" onClick={onStart}>
          {quest.tasks.every(t => t.completed) ? 'Finish the quest →' : 'Start quest →'}
        </button>
        <button className="btn btn-ghost" onClick={onAbandon}>Discard this quest</button>
      </div>
    </div>
  )
}

// ==================== ACTIVE QUEST ====================

function ActiveQuest({ quest, onUpdate, onFinish, onAbandon }) {
  const [, forceTick] = useState(0)
  const [phoneAway, setPhoneAway] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [completedFlash, setCompletedFlash] = useState(null)
  const [movementDone, setMovementDone] = useState({})
  const [moveTimer, setMoveTimer] = useState(null) // {taskId, remainMs, running}
  const [photoBusy, setPhotoBusy] = useState(false)

  const currentIndex = quest.tasks.findIndex(t => !t.completed)
  const currentTask = currentIndex === -1 ? null : quest.tasks[currentIndex]
  const doneCount = quest.tasks.filter(t => t.completed).length
  const allDone = doneCount === quest.tasks.length
  const timer = quest.timer || newTimer()

  // wall-clock tick for the quest timer
  useEffect(() => {
    const id = setInterval(() => forceTick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // reset the movement timer whenever the current task changes
  useEffect(() => {
    if (moveTimer && moveTimer.taskId !== currentTask?.id) setMoveTimer(null)
  }, [currentTask?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // movement countdown
  useEffect(() => {
    if (!moveTimer || !moveTimer.running || moveTimer.remainMs <= 0) return
    const id = setTimeout(() => {
      const remain = moveTimer.remainMs - 1000
      if (remain <= 0) {
        setMoveTimer(t => (t && t.taskId === moveTimer.taskId ? { ...t, remainMs: 0, running: false } : t))
        setMovementDone(m => ({ ...m, [moveTimer.taskId]: true }))
      } else {
        setMoveTimer(t => (t && t.taskId === moveTimer.taskId ? { ...t, remainMs: remain } : t))
      }
    }, 1000)
    return () => clearTimeout(id)
  }, [moveTimer])

  const togglePause = () => {
    onUpdate({ ...quest, timer: timer.paused ? timerResume(timer) : timerPause(timer) })
  }

  const handlePhoto = async (file) => {
    if (!file || !currentTask) return
    setPhotoBusy(true)
    try {
      const thumb = await fileToThumbnail(file)
      const tasks = quest.tasks.map(t => t.id === currentTask.id ? { ...t, photoData: thumb } : t)
      onUpdate({ ...quest, tasks })
    } finally {
      setPhotoBusy(false)
    }
  }

  const evidenceReady = (task) => {
    if (!task) return false
    const photoOk = task.evidence !== 'photo' || Boolean(task.photoData)
    return photoOk && Boolean(movementDone[task.id])
  }

  const completeCurrentTask = () => {
    if (!currentTask || !evidenceReady(currentTask)) return
    const { quest: updated, awarded } = completeTaskInQuest(quest, currentTask.id)
    onUpdate(updated)
    setCompletedFlash({ title: currentTask.title, xp: awarded, natureType: currentTask.natureType })
  }

  const movementSeconds = currentTask ? parseMovementSeconds(currentTask.fitnessAction) : null
  const movementActive = currentTask ? Boolean(movementDone[currentTask.id]) : false

  // ---------- phone-away mode ----------
  if (phoneAway) {
    return (
      <div className="screen phone-away" onClick={() => setPhoneAway(false)}>
        <div className="phone-away-inner">
          <p className="phone-away-emoji" aria-hidden="true">{quest.icon}</p>
          <p className="phone-away-title">{quest.title}</p>
          <p className="phone-away-clock">{formatClock(timerElapsedMs(timer))}</p>
          <p className="phone-away-hint">{doneCount} of {quest.tasks.length} done. The rest happens out there.</p>
          <p className="phone-away-tap">Tap anywhere when you’re back</p>
        </div>
      </div>
    )
  }

  // ---------- task-complete flash ----------
  if (completedFlash) {
    const meta = DISCOVERY_META[completedFlash.natureType] || DISCOVERY_META.other
    const nextIndex = quest.tasks.findIndex(t => !t.completed)
    return (
      <div className="screen flash" role="status">
        <div className="flash-inner">
          <p className="flash-check" aria-hidden="true">✓</p>
          <h2>Task complete</h2>
          <p className="flash-discovery">{meta.icon} {completedFlash.title}</p>
          <p className="flash-xp">+{completedFlash.xp} Outdoor XP</p>
          <div className="flash-progress">
            {quest.tasks.map((t, i) => (
              <span key={t.id} className={`flash-dot ${t.completed ? 'on' : ''}`} aria-label={`Task ${i + 1}`} />
            ))}
          </div>
          <p className="flash-count">{quest.tasks.filter(t => t.completed).length} / {quest.tasks.length} complete</p>
          <button className="btn btn-primary btn-hero" onClick={() => setCompletedFlash(null)}>
            {nextIndex === -1 ? 'See the results →' : 'Next mission →'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen active">
      <header className="active-top">
        <div className="active-title-wrap">
          <span className="active-icon" aria-hidden="true">{quest.icon}</span>
          <div>
            <h2 className="active-title">{quest.title}</h2>
            <p className="active-meta">
              {timer.paused ? 'Paused' : 'Quest active'} · {formatClock(timerElapsedMs(timer))}
            </p>
          </div>
        </div>
        <button className="btn btn-tiny" onClick={togglePause}>{timer.paused ? 'Resume' : 'Pause'}</button>
      </header>

      <div className="active-progress" role="progressbar" aria-label="Quest progress" aria-valuemin="0" aria-valuemax={quest.tasks.length} aria-valuenow={doneCount}>
        {quest.tasks.map((t, i) => (
          <span key={t.id} className={`trail-dot ${t.completed ? 'on' : ''} ${i === currentIndex ? 'now' : ''}`} />
        ))}
      </div>

      {allDone ? (
        <div className="all-done">
          <p className="all-done-emoji" aria-hidden="true">🌿</p>
          <h3>All tasks complete</h3>
          <p>You explored, moved and earned every checkpoint. Time to log the quest.</p>
          <button className="btn btn-primary btn-hero" onClick={onFinish}>
            Complete quest · +{QUEST_BONUS_XP} XP →
          </button>
        </div>
      ) : (
        <article className="task-card">
          <p className="task-kicker">Task {currentIndex + 1} of {quest.tasks.length}</p>
          <h3 className="task-title">{currentTask.title}</h3>
          {currentTask.hint && <p className="task-hint">{currentTask.hint}</p>}

          <div className="task-block task-nature">
            <p className="task-block-label">🌿 Nature</p>
            <p className="task-action">📸 {currentTask.natureAction}</p>

            {currentTask.evidence === 'photo' && (
              currentTask.photoData ? (
                <div className="task-photo-accept">
                  <img src={currentTask.photoData} alt="Your observation" />
                  <p className="photo-accept-note">✓ Photo evidence added</p>
                </div>
              ) : (
                <label className={`photo-drop ${photoBusy ? 'busy' : ''}`}>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={e => handlePhoto(e.target.files?.[0])}
                    disabled={photoBusy}
                  />
                  <span className="photo-drop-icon" aria-hidden="true">📸</span>
                  <span>{photoBusy ? 'Saving your discovery…' : 'Take / upload photo'}</span>
                </label>
              )
            )}

            {currentTask.evidence === 'self' && (
              <p className="self-note">No photo needed — observation only.</p>
            )}
          </div>

          <div className="task-block task-movement">
            <p className="task-block-label">🏃 Movement</p>
            <p className="task-action">{currentTask.fitnessAction}</p>

            {movementActive ? (
              <p className="movement-done-note">✓ Movement done</p>
            ) : movementSeconds ? (
              <>
                {moveTimer && moveTimer.running ? (
                  <p className="countdown">{formatClock(moveTimer.remainMs)}</p>
                ) : (
                  <button
                    type="button"
                    className="btn btn-movement"
                    onClick={() => setMoveTimer({ taskId: currentTask.id, remainMs: movementSeconds * 1000, running: true })}
                  >
                    Start movement timer · {formatClock(movementSeconds * 1000)}
                  </button>
                )}
                <button type="button" className="btn btn-skip" onClick={() => setMovementDone(m => ({ ...m, [currentTask.id]: true }))}>
                  Skip timer — I already did it
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-movement"
                onClick={() => setMovementDone(m => ({ ...m, [currentTask.id]: true }))}
                aria-pressed={false}
              >
                I did the movement
              </button>
            )}
            <p className="self-reported">Self-reported — NatureFit can’t count your reps (yet).</p>
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={completeCurrentTask}
            disabled={!evidenceReady(currentTask)}
          >
            Complete task · +{currentTask.xp} XP
          </button>
          {!evidenceReady(currentTask) && (
            <p className="gate-note">
              {currentTask.evidence === 'photo' && !currentTask.photoData
                ? 'Add your photo evidence to unlock this.'
                : 'Confirm the movement to unlock this.'}
            </p>
          )}
        </article>
      )}

      <div className="active-bottom">
        <button className="btn btn-phone-away" onClick={() => setPhoneAway(true)}>
          📵 Put phone away
        </button>
        <button className="btn btn-ghost" onClick={() => setConfirmLeave(true)}>Leave quest</button>
      </div>

      {confirmLeave && (
        <div className="modal-backdrop" onClick={() => setConfirmLeave(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h3>Leave this quest?</h3>
            <p>Completed tasks already earned their XP. The unfinished ones will be lost.</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmLeave(false)}>Keep going</button>
              <button className="btn btn-danger" onClick={onAbandon}>Leave quest</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== RESULTS ====================

function Results({ result, onNewQuest, onJournal }) {
  const counts = {}
  result.tasks.forEach(t => {
    if (t.completed && t.natureType) counts[t.natureType] = (counts[t.natureType] || 0) + 1
  })

  return (
    <div className="screen results">
      <div className="results-inner">
        <p className="kicker">Quest complete</p>
        <div className="results-hero">
          <span className="results-emoji" aria-hidden="true">{result.icon}</span>
          <h2>{result.title}</h2>
          <p className="results-time">{formatMinutes(result.elapsedMs)} outside</p>
        </div>

        <div className="xp-banner">
          <p className="xp-banner-value">+{result.xpEarned}</p>
          <p className="xp-banner-label">Outdoor XP earned</p>
          <p className="xp-banner-note">includes +{result.bonus} quest bonus</p>
        </div>

        <div className="results-grid">
          <div className="result-cell">
            <span className="result-num">{result.tasks.filter(t => t.completed).length}</span>
            <span className="result-label">movement tasks</span>
          </div>
          <div className="result-cell">
            <span className="result-num">{result.tasks.filter(t => t.photoData).length}</span>
            <span className="result-label">photo observations</span>
          </div>
        </div>

        {Object.keys(counts).length > 0 && (
          <div className="results-discoveries">
            <h3>Today you discovered</h3>
            <ul>
              {Object.entries(counts).map(([type, n]) => (
                <li key={type}>
                  <span aria-hidden="true">{DISCOVERY_META[type]?.icon}</span> {n} × {DISCOVERY_META[type]?.label.toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="results-streak">
          <span aria-hidden="true">🔥</span> {result.streak} day streak
        </div>

        <p className="results-quote">“Your surroundings did the programming today.”</p>

        <div className="results-actions">
          <button className="btn btn-secondary" onClick={onNewQuest}>New quest</button>
          <button className="btn btn-primary" onClick={onJournal}>View progress</button>
        </div>
      </div>
    </div>
  )
}

// ==================== JOURNAL (progress) ====================

function Journal({ quest, onNewQuest, onContinue, onBack }) {
  const history = getStorage(STORAGE.QUEST_HISTORY, [])
  const discoveries = getStorage(STORAGE.DISCOVERIES, [])
  const outdoorXP = getOutdoorXP()
  const streak = getStorage(STORAGE.STREAK, 0)

  const weekAgo = Date.now() - 7 * 86400000
  const week = history.filter(q => new Date(q.date).getTime() >= weekAgo)
  const weekMinutes = week.reduce((s, q) => s + q.elapsedMinutes, 0)
  const weekDiscoveries = discoveries.filter(d => new Date(d.date).getTime() >= weekAgo).length

  const weekLabel = weekMinutes >= 60
    ? `${Math.floor(weekMinutes / 60)}h ${weekMinutes % 60}m`
    : `${weekMinutes} min`

  const discoveryCounts = {}
  discoveries.forEach(d => { discoveryCounts[d.type] = (discoveryCounts[d.type] || 0) + 1 })

  const questReadyToFinish = quest && quest.tasks && quest.tasks.every(t => t.completed)
  const questInProgress = quest && quest.tasks && !questReadyToFinish
  const activeProgress = quest ? quest.tasks.filter(t => t.completed).length : 0
  const activeTotal = quest ? quest.tasks.length : 0

  return (
    <div className="screen journal">
      <button className="btn-back" onClick={onBack} aria-label="Back">←</button>

      <div className="journal-inner">
        <header className="journal-header">
          <p className="kicker">Good morning 🌿</p>
          <h2>Your outdoor journey</h2>
        </header>

        <div className="journal-hero">
          <div className="journal-stat-main">
            <span className="journal-xp">⭐ {outdoorXP}</span>
            <span className="journal-xp-label">Outdoor XP</span>
          </div>
          <div className="journal-streak">
            <span aria-hidden="true">🔥</span> {streak} day streak
          </div>
        </div>

        {quest && (
          <section className="current-quest-card">
            <p className="kicker">{questReadyToFinish ? 'Ready to finish' : 'Today’s quest'}</p>
            <h3><span aria-hidden="true">{quest.icon}</span> {quest.title}</h3>
            <p className="cq-progress">{activeProgress} / {activeTotal} tasks</p>
            <div className="cq-bar">
              <div className="cq-fill" style={{ width: `${(activeProgress / activeTotal) * 100}%` }} />
            </div>
            <button className="btn btn-primary btn-full" onClick={onContinue}>
              {questReadyToFinish ? 'Complete quest →' : 'Continue quest →'}
            </button>
          </section>
        )}

        <section className="week-stats">
          <h3>This week</h3>
          <div className="week-grid">
            <div className="week-cell">
              <span className="week-num">{weekLabel}</span>
              <span className="week-label">outdoors</span>
            </div>
            <div className="week-cell">
              <span className="week-num">{weekDiscoveries}</span>
              <span className="week-label">discoveries</span>
            </div>
            <div className="week-cell">
              <span className="week-num">{week.length}</span>
              <span className="week-label">quests done</span>
            </div>
          </div>
        </section>

        {discoveries.length > 0 && (
          <section className="discoveries">
            <h3>Your discoveries</h3>
            <ul className="discovery-list">
              {Object.entries(DISCOVERY_META).map(([type, meta]) => (
                discoveryCounts[type] ? (
                  <li key={type}>
                    <span className="discovery-icon" aria-hidden="true">{meta.icon}</span>
                    <span className="discovery-label">{meta.label}</span>
                    <span className="discovery-count">{discoveryCounts[type]}</span>
                  </li>
                ) : null
              ))}
            </ul>
          </section>
        )}

        <section className="adventures">
                  <h3>Recent adventures</h3>
                  {history.length === 0 ? (
                    <div className="empty-state">
                      <p className="empty-emoji" aria-hidden="true">🧭</p>
                      <p><strong>No adventures yet</strong></p>
                      <p>Your first quest is waiting.</p>
                      <button className="btn btn-primary" onClick={onNewQuest}>Create my first quest</button>
                    </div>
                  ) : (
                    <>
                      <ul className="adventure-list">
                        {history.slice(0, 6).map(q => (
                          <li key={q.id} className="adventure-item">
                            <span className="adventure-icon" aria-hidden="true">{q.icon}</span>
                            <div className="adventure-info">
                              <span className="adventure-title">{q.title}</span>
                              <span className="adventure-meta">{q.elapsedMinutes} min · {q.tasksCompleted} tasks</span>
                            </div>
                            <span className="adventure-xp">+{q.xpEarned} XP</span>
                          </li>
                        ))}
                      </ul>
                      <button className="btn btn-primary btn-full journal-new-quest" onClick={onNewQuest}>
                        + Start another quest
                      </button>
                    </>
                  )}
                </section>

                {questInProgress && (
                  <button className="btn btn-primary btn-full" onClick={onContinue}>Continue today's quest →</button>
                )}
      </div>
    </div>
  )
}

export default App
