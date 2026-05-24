export const OLLAMA_MODEL_PRESETS = [
  {
    id: 'llama3.2:3b',
    label: 'Быстрая (3B)',
    hint: '5–15 сек на реплику · для слабого ПК',
  },
  {
    id: 'llama3.1:8b',
    label: 'Умнее (8B)',
    hint: '20–60 сек · ollama pull llama3.1:8b',
  },
  {
    id: 'qwen2.5:7b',
    label: 'Умная + русский (7B)',
    hint: '20–60 сек · ollama pull qwen2.5:7b',
  },
]

export const GROQ_MODEL_PRESETS = [
  {
    id: 'llama-3.1-8b-instant',
    label: 'Быстрая (8B)',
    hint: 'Облако Groq, почти мгновенно',
  },
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Умнее (70B)',
    hint: 'Лучшие аргументы · лимит ~1000 запросов/день',
  },
]

export const PROVIDERS = {
  groq: {
    name: 'groq',
    label: 'Groq Cloud',
    baseURL: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-8b-instant',
    needsKey: true,
  },
  ollama: {
    name: 'ollama',
    label: 'Ollama (локально)',
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
    needsKey: false,
  },
}

export function resolveProvider() {
  const requested = (process.env.LLM_PROVIDER || '').trim().toLowerCase()

  if (requested && PROVIDERS[requested]) {
    return buildProviderConfig(requested)
  }

  if (process.env.GROQ_API_KEY) {
    return buildProviderConfig('groq')
  }

  return buildProviderConfig('ollama')
}

function buildProviderConfig(name) {
  const provider = PROVIDERS[name]
  const apiKey = name === 'groq' ? process.env.GROQ_API_KEY : 'ollama'

  return {
    ...provider,
    apiKey,
    ready: name === 'groq' ? Boolean(process.env.GROQ_API_KEY) : true,
  }
}

export function getModelPresets(providerName) {
  if (providerName === 'groq') return GROQ_MODEL_PRESETS
  return OLLAMA_MODEL_PRESETS
}

export function resolveModel(providerName, modelOverride) {
  const presets = getModelPresets(providerName)
  const fallback = PROVIDERS[providerName]?.model || PROVIDERS.ollama.model
  const requested = (modelOverride || '').trim()

  if (!requested) return fallback

  const allowed = presets.some((preset) => preset.id === requested)
  return allowed ? requested : fallback
}

export function getAgentsForProvider(providerName, modelOverride) {
  const model = resolveModel(providerName, modelOverride)

  return [
    {
      id: 'philosopher',
      name: 'Philosopher',
      model,
      role: 'Философ и аналитик',
      color: '#818cf8',
    },
    {
      id: 'skeptic',
      name: 'Skeptic',
      model,
      role: 'Скептик и критик',
      color: '#fb7185',
    },
  ]
}

export function getJudgeForProvider(providerName, modelOverride) {
  const model = resolveModel(providerName, modelOverride)

  return {
    id: 'judge',
    name: 'Judge',
    model,
    role: 'Беспристрастный судья',
    color: '#fbbf24',
  }
}
