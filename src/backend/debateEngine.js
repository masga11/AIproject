import { MemoryManager } from './memory/memoryManager.js'

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

export function buildMessages(agent, topic, memory) {
  const history = memory.toHistory()

  return [
    {
      role: 'system',
      content: buildPrompt(agent, topic, history.length > 0),
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

export async function streamAgentReply(client, agent, topic, memory, onToken) {
  return streamCompletion(client, {
    model: agent.model,
    messages: buildMessages(agent, topic, memory),
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
