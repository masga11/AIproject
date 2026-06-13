import { MemoryManager } from './memory/memoryManager.js'
import { globalMemory } from './memory/globalMemory.js'

export const DEFAULT_ROUNDS = 3
export const MIN_ROUNDS = 1
export const MAX_ROUNDS = 3

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

export function buildPrompt(agent, topic, round, side, hasHistory) {
  const sideLabel = side === 1 ? 'Сторона 1 (за)' : 'Сторона 2 (против)'
  const oppositeSideLabel = side === 1 ? 'Сторона 2 (против)' : 'Сторона 1 (за)'

  const base = `Ты ${agent.name} — ${agent.role}. Ты выступаешь как ${sideLabel} в дискуссии.
Тема: «${topic}».

ВАЖНЫЕ ПРАВИЛА:
- Ты ОБЯЗАН занимать строго противоположную позицию оппоненту. Если оппонент «за», ты «против», и наоборот.
- Не поддерживай аргументы оппонента — это запрещено.
- Отвечай на русском языке. Будь конкретным: факты, данные, примеры.
- Строго следуй структуре своего раунда. Не отклоняйся.`

  if (round === 1) {
    if (!hasHistory) {
      return `${base}

РАУНД 1 — ОТКРЫТИЕ ПОЗИЦИЙ (${sideLabel})

Выполни строго по порядку:
1. Обозначь тему дискуссии.
2. Займи свою позицию (${sideLabel}).
3. Введи определения ключевых терминов (если применимо).
4. Дай 3 аргумента в подтверждение своей позиции (кратко, без деталей).
5. Подведи кратко итог своего выступления.

Лимит: до 500 слов.`
    }
    return `${base}

РАУНД 1 — ОТКРЫТИЕ ПОЗИЦИЙ (${sideLabel})

Ты говоришь вторым. Сначала ознакомься с позицией ${oppositeSideLabel} выше.

Выполни строго по порядку:
1. Подчеркни свою позицию (${sideLabel}).
2. Введи дополнительные определения (если ${oppositeSideLabel} упустила что-то).
3. Кратко ответь на аргументы ${oppositeSideLabel} (в каждом покажи обратную сторону медали).
4. Дай 3 аргумента в подтверждение своей позиции (кратко, без деталей).
5. Подведи кратко итог своего выступления.

Лимит: до 500 слов.`
  }

  if (round === 2) {
    return `${base}

РАУНД 2 — АРГУМЕНТАЦИЯ И ВОПРОСЫ (${sideLabel})

Выполни строго по порядку:
1. Ответь на аргументы ${oppositeSideLabel} (в каждом покажи обратную сторону медали).
2. Приведи подтверждения и статистику своим аргументам (НОВЫЕ аргументы вводить НЕЛЬЗЯ — только развивай те, что были в Раунде 1).
3. Задай 1 каверзный вопрос ${oppositeSideLabel}.
4. Подведи кратко итог своей речи.

Лимит: до 500 слов.`
  }

  if (round === 3) {
    return `${base}

РАУНД 3 — ЗАКЛЮЧЕНИЕ (${sideLabel})

Выполни строго по порядку:
1. Ответь на вопрос ${oppositeSideLabel} из Раунда 2.
2. По возможности поставь под сомнение статистику или источники, используемые ${oppositeSideLabel} во втором раунде.
3. Подведи итог всей дискуссии: напомни судье о ключевых аргументах своей позиции, слабых местах ${oppositeSideLabel} и укажи, почему стоит отдать победу тебе.

Лимит: до 400 слов.`
  }

  return base
}

export function buildMessages(agent, topic, memory, round = 1, side = 1, globalContext = '') {
  const history = memory.toHistory()
  const systemContent = buildPrompt(agent, topic, round, side, history.length > 0)

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
        ? `Начни дискуссию по теме «${topic}». Ты — ${side === 1 ? 'Сторона 1 (за)' : 'Сторона 2 (против)'}.`
        : `Твоя очередь говорить (Раунд ${round}). Тема: «${topic}». Ты — ${side === 1 ? 'Сторона 1 (за)' : 'Сторона 2 (против)'}.`,
    },
  ]
}

export function buildJudgeMessages(topic, memory, agentNames) {
  const entries = memory.recall()

  const transcript = entries
    .map((entry) => `[Раунд ${entry.round}] ${entry.agent} (${entry.role}):\n${entry.text}`)
    .join('\n\n')

  const isMultiAgent = agentNames.length > 2
  
  let judgeInstruction = isMultiAgent
    ? `Тема дискуссии: «${topic}»

Транскрипт:
${transcript}

Подведи итог дискуссии:
1. Кратко перескажи ключевые аргументы каждого участника.
2. Распредели места между участниками (первое, второе, третье и т.д.).
3. Обоснуй распределение мест в 2–3 абзацах.
4. Верни результат в формате JSON:
{
  "summary": "краткое резюме",
  "rankings": [
    {"rank": 1, "agent": "ИмяАгента", "reason": "почему первое место"},
    {"rank": 2, "agent": "ИмяАгента", "reason": "почему второе место"}
  ]
}

Отвечай ТОЛЬКО JSON объектом без дополнительного текста.`
    : `Тема дискуссии: «${topic}»

Транскрипт:
${transcript}

Подведи итог дискуссии:
1. Кратко перескажи ключевые аргументы каждой стороны.
2. Назови победителя: ${agentNames.join(' или ')}.
3. Объясни решение в 2–3 абзацах.`

  return [
    {
      role: 'system',
      content: `Ты беспристрастный судья дискуссии. Оценивай аргументы, а не красноречие.
Отвечай на русском языке. Будь конкретным и справедливым.${isMultiAgent ? ' Верни результат в формате JSON.' : ''}`,
    },
    {
      role: 'user',
      content: judgeInstruction,
    },
  ]
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function streamCompletion(client, { model, messages, onToken, maxTokens = 800, temperature = 0.8 }, retries = 2) {
  let lastError

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const stream = await client.chat.completions.create({
        model,
        stream: true,
        max_tokens: maxTokens,
        temperature,
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
    } catch (err) {
      lastError = err
      const isRetryable = err?.message?.includes('429') || err?.message?.includes('503') || err?.message?.includes('ECONNRESET')
      if (isRetryable && attempt < retries) {
        const delay = 1000 * (attempt + 1)
        console.warn(`[LLM] Retry ${attempt + 1}/${retries} after ${delay}ms: ${err.message}`)
        await sleep(delay)
        continue
      }
      throw err
    }
  }

  throw lastError
}

export async function streamAgentReply(client, agent, topic, memory, onToken, globalContext = '', round = 1, side = 1) {
  return streamCompletion(client, {
    model: agent.model,
    messages: buildMessages(agent, topic, memory, round, side, globalContext),
    onToken,
    temperature: agent.temperature !== undefined ? agent.temperature : 0.8,
  })
}

export async function streamJudgeVerdict(client, judge, topic, memory, onToken, agentNames) {
  return streamCompletion(client, {
    model: judge.model,
    messages: buildJudgeMessages(topic, memory, agentNames),
    onToken,
    maxTokens: agentNames.length > 2 ? 1000 : 600,
  })
}
