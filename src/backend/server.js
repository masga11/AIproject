import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import OpenAI from 'openai'
import {
  DEFAULT_ROUNDS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  clampRounds,
  createDebateSession,
  streamAgentReply,
  streamJudgeVerdict,
  extractKnowledgeFragments,
} from './debateEngine.js'
import { getAgentsForProvider, getJudgeForProvider, getModelPresets, resolveProvider } from './llmConfig.js'
import { globalMemory } from './memory/globalMemory.js'

const PORT = process.env.PORT || 3002
const app = express()
const provider = resolveProvider()
const defaultAgents = getAgentsForProvider(provider.name)

app.use(cors())
app.use(express.json())

const client = provider.ready
  ? new OpenAI({
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
    })
  : null

function sendEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function formatApiError(err) {
  const message = err?.message || 'Ошибка генерации ответа'

  if (message.includes('429')) {
    return 'Лимит запросов исчерпан. Подождите минуту и попробуйте снова.'
  }

  if (provider.name === 'ollama' && (message.includes('ECONNREFUSED') || message.includes('fetch failed'))) {
    return 'Ollama не запущена. Установите Ollama, выполните «ollama pull llama3.2:3b» и запустите приложение Ollama.'
  }

  if (message.includes('not found') || message.includes('404')) {
    return 'Модель не найдена в Ollama. Скачайте её: ollama pull <имя_модели>'
  }

  return message
}

function missingProviderMessage() {
  if (provider.name === 'groq') {
    return 'Не задан GROQ_API_KEY. Добавьте ключ в .env или переключитесь на Ollama: LLM_PROVIDER=ollama'
  }

  return 'ИИ-провайдер недоступен. Проверьте настройки в .env.'
}

function parseWithJudge(value) {
  if (value === '0' || value === 'false') return false
  return true
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    provider: provider.name,
    providerLabel: provider.label,
    model: provider.model,
    ready: Boolean(client),
  })
})

app.get('/agents', (_req, res) => {
  res.json({
    agents: defaultAgents,
    rounds: DEFAULT_ROUNDS,
    minRounds: MIN_ROUNDS,
    maxRounds: MAX_ROUNDS,
    provider: provider.name,
    model: provider.model,
    models: getModelPresets(provider.name),
  })
})

// Эндпоинт для получения статистики глобальной памяти
app.get('/memory/stats', async (_req, res) => {
  await globalMemory.init()
  res.json({
    stats: globalMemory.getStats(),
  })
})

// Эндпоинт для поиска релевантного контекста
app.get('/memory/search', async (req, res) => {
  const topic = (req.query.topic || '').trim()
  if (!topic) {
    return res.status(400).json({ error: 'Укажите тему для поиска' })
  }
  
  await globalMemory.init()
  const context = globalMemory.findRelevantContext(topic)
  res.json(context)
})

// Эндпоинт для получения истории дебатов из глобальной памяти
app.get('/memory/history', async (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10)
  await globalMemory.init()
  const debates = globalMemory.getAllDebates(limit)
  res.json({ debates })
})

// Эндпоинт для получения полного дебата по ID
app.get('/memory/debate/:id', async (req, res) => {
  await globalMemory.init()
  const debate = globalMemory.getDebateWithMessages(req.params.id)
  if (!debate) {
    return res.status(404).json({ error: 'Дебат не найден' })
  }
  res.json({ debate })
})

app.get('/autonomous-debate-stream', async (req, res) => {
  const topic = (req.query.topic || '').trim()
  const rounds = clampRounds(req.query.rounds)
  const withJudge = parseWithJudge(req.query.withJudge ?? '1')
  const model = (req.query.model || '').trim()

  const agents = getAgentsForProvider(provider.name, model)
  const judge = getJudgeForProvider(provider.name, model)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  let aborted = false
  req.on('close', () => {
    aborted = true
  })

  if (!topic) {
    sendEvent(res, { type: 'error', message: 'Укажите тему дебатов.' })
    res.end()
    return
  }

  if (!client) {
    sendEvent(res, { type: 'error', message: missingProviderMessage() })
    res.end()
    return
  }

  // Инициализация глобальной памяти и поиск контекста
  await globalMemory.init()
  const globalContext = globalMemory.formatContextForPrompt(topic)
  
  const session = createDebateSession(topic)
  session.debateId = globalMemory.saveDebate(topic, provider.name, agents[0].model, rounds)

  sendEvent(res, { type: 'debate_start', topic, rounds, withJudge, model: agents[0].model, agents })

  try {
    for (let round = 1; round <= rounds; round += 1) {
      if (aborted) break

      sendEvent(res, { type: 'round_start', round, total: rounds })

      for (const agent of agents) {
        if (aborted) break

        const messageId = `${agent.id}-r${round}-${Date.now()}`

        sendEvent(res, {
          type: 'agent_start',
          id: messageId,
          agent: agent.name,
          role: agent.role,
          color: agent.color,
          round,
        })

        const answer = await streamAgentReply(
          client,
          agent,
          session.topic,
          session.memory,
          (token) => {
            if (!aborted) {
              sendEvent(res, { type: 'token', id: messageId, text: token })
            }
          },
          globalContext,
        )

        if (aborted) break

        if (!answer) {
          sendEvent(res, {
            type: 'error',
            message: `Пустой ответ от ${agent.name}. Попробуйте другую тему.`,
          })
          res.end()
          return
        }

        session.memory.add({
          agent: agent.name,
          role: agent.role,
          round,
          text: answer,
        })
        
        // Сохраняем сообщение в глобальную память
        globalMemory.saveMessage(session.debateId, agent.name, agent.role, round, answer)

        sendEvent(res, { type: 'agent_end', id: messageId })
      }

      if (!aborted) {
        sendEvent(res, { type: 'round_end', round })
      }
    }

    if (aborted) {
      sendEvent(res, { type: 'stopped' })
      res.end()
      return
    }

    if (withJudge && session.memory.recall().length > 0) {
      const messageId = `judge-${Date.now()}`

      sendEvent(res, {
        type: 'agent_start',
        id: messageId,
        agent: judge.name,
        role: judge.role,
        color: judge.color,
        round: 'verdict',
        isJudge: true,
      })

      const verdict = await streamJudgeVerdict(
        client,
        judge,
        session.topic,
        session.memory,
        (token) => {
          if (!aborted) {
            sendEvent(res, { type: 'token', id: messageId, text: token })
          }
        },
      )

      if (aborted) {
        sendEvent(res, { type: 'stopped' })
        res.end()
        return
      }

      if (verdict) {
        sendEvent(res, { type: 'agent_end', id: messageId, verdict })
        
        // Обновляем победителя и извлекаем знания
        globalMemory.updateWinner(session.debateId, verdict.includes('Philosopher') ? 'Philosopher' : 'Skeptic')
        
        // Извлекаем знания из дебата (асинхронно, не блокируя поток)
        extractKnowledgeFragments(client, judge.model, session.topic, 
          session.memory.recall().map(e => `[${e.agent} (${e.role}), Раунд ${e.round}]: ${e.text}`).join('\n\n'),
          verdict
        ).then(fragments => {
          if (fragments.length > 0) {
            for (const fragment of fragments) {
              globalMemory.saveKnowledgeFragment(session.debateId, fragment.type, fragment.content, session.topic, fragment.relevance)
            }
            console.log(`[GlobalMemory] Извлечено ${fragments.length} фрагментов знаний`)
          }
        }).catch(err => {
          console.error('[GlobalMemory] Ошибка при извлечении знаний:', err)
        })
      }
    }

    sendEvent(res, { type: 'done' })
  } catch (err) {
    console.error(err)
    sendEvent(res, {
      type: 'error',
      message: formatApiError(err),
    })
  }

  res.end()
})

app.listen(PORT, () => {
  console.log(`Arena backend started on ${PORT} (${provider.label}, ${provider.model})`)
  if (!client) {
    console.warn(missingProviderMessage())
  }
})
