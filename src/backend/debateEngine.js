import { MemoryManager } from './memory/memoryManager.js'
import { globalMemory } from './memory/globalMemory.js'

export const DEFAULT_ROUNDS = 3
export const MIN_ROUNDS = 1
export const MAX_ROUNDS = 5

export function clampRounds(value) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return DEFAULT_ROUNDS
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, parsed))
}

export function createDebateSession(topic) {
  return {
    topic: topic.trim(),
    memory: new MemoryManager(),
    round: 0,
    debateId: null,
  }
}

// Извлечение знаний из дебата с помощью LLM
export async function extractKnowledgeFragments(client, model, topic, transcript, verdict) {
  const prompt = `Ты система извлечения знаний из дебатов. Проанализируй транскрипт и вердикт судьи.
Извлеки 3-5 ключевых фактов, аргументов или инсайтов, которые могут быть полезны в будущих дебатах.

Тема: «${topic}»

Транскрипт:
${transcript}

Вердикт судьи:
${verdict}

Верни JSON массив объектов:
[
  {"type": "fact|argument|counterargument|insight", "content": "текст фрагмента", "relevance": 0.8},
  ...
]

Отвечай ТОЛЬКО JSON массивом без дополнительного текста.`

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'Ты JSON API. Отвечай только валидным JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
    })

    const text = response.choices?.[0]?.message?.content || '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const jsonStr = jsonMatch ? jsonMatch[0] : '[]'
    
    return JSON.parse(jsonStr)
  } catch (err) {
    console.error('[GlobalMemory] Ошибка извлечения знаний:', err.message)
    return []
  }
}

export function buildPrompt(agent, topic, hasHistory) {
  const base = `Ты ${agent.name} — ${agent.role}. Тема дебатов: «${topic}».
Отвечай на русском языке. Будь конкретным: аргументы, примеры, контраргументы.
Пиши 2–4 абзаца. Не повторяй дословно то, что уже сказали другие.`

  if (!hasHistory) {
    return `${base}\n\nНачни дебаты: выскажи свою позицию первым.`
  }

  return `${base}\n\nПродолжай дебаты: ответь на аргументы оппонентов и развивай свою позицию.`
}

export function buildMessages(agent, topic, memory, globalContext = '') {
  const history = memory.toHistory()

  const systemContent = buildPrompt(agent, topic, history.length > 0)
  
  // Добавляем глобальный контекст из прошлых дебатов
  const fullSystemContent = globalContext 
    ? `${systemContent}\n\n${globalContext}`
    : systemContent

  return [
    {
      role: 'system',
      content: fullSystemContent,
    },
    ...history,
    {
      role: 'user',
      content: history.length === 0
        ? `Начни дебаты по теме «${topic}».`
        : `Твоя очередь говорить. Тема: «${topic}».`,
    },
  ]
}

export function buildJudgeMessages(topic, memory) {
  const entries = memory.recall()

  const transcript = entries
    .map((entry) => `[Раунд ${entry.round}] ${entry.agent} (${entry.role}):\n${entry.text}`)
    .join('\n\n')

  return [
    {
      role: 'system',
      content: `Ты беспристрастный судья дебатов. Оценивай аргументы, а не красноречие.
Отвечай на русском языке. Будь конкретным и справедливым.`,
    },
    {
      role: 'user',
      content: `Тема дебатов: «${topic}»

Транскрипт:
${transcript}

Подведи итог спора:
1. Кратко перескажи ключевые аргументы каждой стороны.
2. Назови победителя: Philosopher или Skeptic.
3. Объясни решение в 2–3 абзацах.`,
    },
  ]
}

async function streamCompletion(client, { model, messages, onToken, maxTokens = 800 }) {
  const stream = await client.chat.completions.create({
    model,
    stream: true,
    max_tokens: maxTokens,
    temperature: 0.8,
    messages,
  })

  let fullText = ''

  for await (const chunk of stream) {
    const token = chunk.choices?.[0]?.delta?.content || ''
    fullText += token

    if (token && onToken) {
      onToken(token)
    }
  }

  return fullText.trim()
}

export async function streamAgentReply(client, agent, topic, memory, onToken, globalContext = '') {
  return streamCompletion(client, {
    model: agent.model,
    messages: buildMessages(agent, topic, memory, globalContext),
    onToken,
  })
}

export async function streamJudgeVerdict(client, judge, topic, memory, onToken) {
  return streamCompletion(client, {
    model: judge.model,
    messages: buildJudgeMessages(topic, memory),
    onToken,
    maxTokens: 600,
  })
}
