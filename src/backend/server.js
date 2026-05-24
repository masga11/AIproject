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
} from './debateEngine.js'
import { getAgentsForProvider, getJudgeForProvider, getModelPresets, resolveProvider } from './llmConfig.js'

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

  const session = createDebateSession(topic)

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
