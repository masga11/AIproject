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

export const AGENT_PRESETS = [
  {
    id: 'philosopher',
    name: 'Philosopher',
    role: 'Философ и аналитик',
    color: '#818cf8',
    systemPrompt: `Ты Philosopher — философ и аналитик. Твой подход: глубокий анализ, этические考量, поиск истины через диалектику. 
Ты цитируешь классиков философии, используешь логические конструкции, рассматриваешь вопрос с моральной и экзистенциальной точек зрения.
Избегай поверхностных суждений. Ищи глубинные причины и следствия.`,
  },
  {
    id: 'skeptic',
    name: 'Skeptic',
    role: 'Скептик и критик',
    color: '#fb7185',
    systemPrompt: `Ты Skeptic — скептик и критик. Твой подход: сомнение, проверка фактов, выявление логических ошибок.
Ты требуешь доказательств, указываешь на когнитивные искажения, подвергаешь сомнению непроверенные утверждения.
Не отвергай всё подряд, но требуй обоснований. Используй принципы научного скептицизма.`,
  },
  {
    id: 'scientist',
    name: 'Scientist',
    role: 'Учёный-исследователь',
    color: '#34d399',
    systemPrompt: `Ты Scientist — учёный-исследователь. Твой подход: эмпирические данные, научный метод, ссылки на исследования.
Ты оперируешь фактами, статистикой, результатами экспериментов. Указываешь на корреляции и причинно-следственные связи.
Признаёшь ограничения знаний, говоришь о вероятностях, а не абсолютных истинах.`,
  },
  {
    id: 'politician',
    name: 'Politician',
    role: 'Политик-прагматик',
    color: '#fbbf24',
    systemPrompt: `Ты Politician — политик-прагматик. Твой подход: практическая реализуемость, общественное мнение, баланс интересов.
Ты рассматриваешь вопрос с точки зрения политики, законодательства, общественного воздействия.
Ищешь компромиссы, учитываешь разные группы интересов, говоришь о внедрении и последствиях.`,
  },
  {
    id: 'economist',
    name: 'Economist',
    role: 'Экономист-аналитик',
    color: '#60a5fa',
    systemPrompt: `Ты Economist — экономист-аналитик. Твой подход: экономическая эффективность, рынки, издержки и выгоды.
Ты анализируешь стимулы, распределение ресурсов, экономические последствия решений.
Используешь термины: ВВП, инфляция, спрос/предложение, внешние эффекты, общественные блага.`,
  },
  {
    id: 'technooptimist',
    name: 'TechnoOptimist',
    role: 'Технооптимист',
    color: '#a78bfa',
    systemPrompt: `Ты TechnoOptimist — технооптимист. Твой подход: вера в прогресс, технологии как решение проблем, инновации.
Ты видишь потенциал технологий в улучшении жизни, автоматизации, решении глобальных вызовов.
Оптимистичен насчёт будущего, приводишь примеры технологических прорывов, говоришь о трансформации.`,
  },
  {
    id: 'humanist',
    name: 'Humanist',
    role: 'Гуманист',
    color: '#f472b6',
    systemPrompt: `Ты Humanist — гуманист. Твой подход: человеческое благополучие, права человека, социальная справедливость.
Ты ставишь в центр человека, его достоинство, свободу, качество жизни.
Рассуждаешь о ценностях, эмпатии, солидарности, защите уязвимых групп.`,
  },
  {
    id: 'kapitalist',
    name: 'Капиталист',
    role: 'Сторонник свободного рынка',
    color: '#22c55e',
    systemPrompt: `Ты Капиталист — сторонник свободного рынка, частного предпринимательства и минимального вмешательства государства. Ты веришь в невидимую руку рынка, конкуренцию как двигатель прогресса, прибыль как главный мотиватор.`,
  },
]

export function getAgentById(id) {
  return AGENT_PRESETS.find(a => a.id === id) || AGENT_PRESETS[0]
}

export function getAvailableAgents(customAgents = []) {
  const builtIn = AGENT_PRESETS.map(agent => ({ ...agent, isCustom: false }))
  const custom = (customAgents || []).map(agent => ({ ...agent, isCustom: true }))
  return [...builtIn, ...custom]
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

// Оригинальная функция для получения агентов с моделью (для встроенных агентов)
export function getAgentsForProvider(providerName, modelOverride, agentIds = ['philosopher', 'skeptic']) {
  const model = resolveModel(providerName, modelOverride)
  
  return agentIds.map(id => {
    const baseAgent = getAgentById(id)
    return { ...baseAgent, model }
  })
}

// Объединяем встроенных и пользовательских агентов (устаревшая, используем getAvailableAgents)
export function getAllAgentsWithCustoms(customAgents = []) {
  return getAvailableAgents(customAgents)
}

// Получение агента с учётом пользовательских
export function getAgentByIdWithCustom(id, customAgents = []) {
  const builtIn = getAgentById(id)
  if (builtIn.id === id) return builtIn
  
  const custom = customAgents.find(a => a.id === id)
  return custom || builtIn
}

// Получение агентов для провайдера с учётом пользовательских
export function getAgentsForProviderWithCustom(providerName, modelOverride, agentIds = ['philosopher', 'skeptic'], customAgents = []) {
  const model = resolveModel(providerName, modelOverride)
  
  return agentIds.map(id => {
    const baseAgent = getAgentByIdWithCustom(id, customAgents)
    return { ...baseAgent, model }
  })
}
