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
import { getAgentsForProvider, getJudgeForProvider, getModelPresets, getAvailableAgents, resolveProvider, resolveModel, getAgentsForProviderWithCustom, getAgentByIdWithCustom } from './llmConfig.js'
import { globalMemory } from './memory/globalMemory.js'
import { customAgentManager } from './memory/customAgentManager.js'

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

app.get('/agents', async (_req, res) => {
  await customAgentManager.init()
  const customAgents = customAgentManager.getAllActiveAgents()
  
  res.json({
    agents: defaultAgents,
    allAgents: getAvailableAgents(customAgents),
    customAgents,
    rounds: DEFAULT_ROUNDS,
    minRounds: MIN_ROUNDS,
    maxRounds: MAX_ROUNDS,
    provider: provider.name,
    model: provider.model,
    models: getModelPresets(provider.name),
  })
})

// Эндпоинты для управления пользовательскими агентами
app.get('/custom-agents', async (_req, res) => {
  await customAgentManager.init()
  const agents = customAgentManager.getAllActiveAgents()
  res.json({ agents })
})

app.post('/custom-agents', async (req, res) => {
  await customAgentManager.init()
  
  const { name, role, systemPrompt, color } = req.body
  
  if (!name?.trim() || !role?.trim() || !systemPrompt?.trim()) {
    return res.status(400).json({ error: 'Имя, роль и системный промт обязательны' })
  }
  
  try {
    const agent = customAgentManager.createAgent(name, role, systemPrompt, color || '#8b5cf6')
    res.json({ agent })
  } catch (err) {
    console.error('Ошибка создания агента:', err)
    res.status(500).json({ error: err.message })
  }
})

app.put('/custom-agents/:id', async (req, res) => {
  await customAgentManager.init()
  
  const { id } = req.params
  const { name, role, systemPrompt, color } = req.body
  
  if (!name?.trim() || !role?.trim() || !systemPrompt?.trim()) {
    return res.status(400).json({ error: 'Имя, роль и системный промт обязательны' })
  }
  
  try {
    const agent = customAgentManager.updateAgent(id, name, role, systemPrompt, color)
    if (!agent) {
      return res.status(404).json({ error: 'Агент не найден' })
    }
    res.json({ agent })
  } catch (err) {
    console.error('Ошибка обновления агента:', err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/custom-agents/:id', async (req, res) => {
  await customAgentManager.init()
  
  const { id } = req.params
  
  try {
    customAgentManager.deleteAgent(id)
    res.json({ success: true })
  } catch (err) {
    console.error('Ошибка удаления агента:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/custom-agents/stats', async (_req, res) => {
  await customAgentManager.init()
  res.json({ stats: customAgentManager.getStats() })
})

// Эндпоинт для запуска дебатов с произвольными агентами
app.get('/autonomous-debate-stream', async (req, res) => {
  const topic = (req.query.topic || '').trim()
  const rounds = clampRounds(req.query.rounds)
  const withJudge = parseWithJudge(req.query.withJudge ?? '1')
  const model = (req.query.model || '').trim()
  
  // Поддержка множественных агентов через agent[]=id1&agent[]=id2...
  const agentIds = req.query.agents 
    ? (Array.isArray(req.query.agents) ? req.query.agents : [req.query.agents])
    : ['philosopher', 'skeptic']
  
  // Индивидуальные настройки для каждого агента
  const agentModels = []
  const agentTemps = []
  const agentProviders = []
  
  for (let i = 0; i < agentIds.length; i++) {
    agentModels.push((req.query[`agent${i}Model`] || model || '').trim())
    agentTemps.push(parseFloat(req.query[`agent${i}Temp`] || '0.8'))
    agentProviders.push((req.query[`agent${i}Provider`] || provider.name).trim())
  }

  // Получаем пользовательских агентов
  await customAgentManager.init()
  const customAgents = customAgentManager.getAllActiveAgents()
  
  // Создаём конфигурации агентов с индивидуальными настройками
  const buildAgentConfig = (agentId, customModel, customTemp, customProvider) => {
    const baseAgent = getAgentByIdWithCustom(agentId, customAgents)
    const effectiveModel = customModel || model || resolveModel(customProvider, null)
    const effectiveProvider = customProvider || provider.name
    
    return {
      ...baseAgent,
      model: effectiveModel,
      temperature: customTemp,
      provider: effectiveProvider,
    }
  }
  
  const agents = agentIds.map((id, i) => 
    buildAgentConfig(id, agentModels[i], agentTemps[i], agentProviders[i])
  )
  
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

      const agentNames = agents.map(a => a.name)
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
        agentNames,
      )

      if (aborted) {
        sendEvent(res, { type: 'stopped' })
        res.end()
        return
      }

      if (verdict) {
        sendEvent(res, { type: 'agent_end', id: messageId, verdict })
        
        // Обработка вердикта для множественных агентов
        const isMultiAgent = agents.length > 2
        let rankings = null
        
        if (isMultiAgent) {
          // Пытаемся распарсить JSON вердикт
          try {
            const jsonMatch = verdict.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0])
              if (parsed.rankings && Array.isArray(parsed.rankings)) {
                rankings = parsed.rankings
                // Сохраняем ранжирование как строку в поле winner
                const rankingStr = rankings.map(r => `${r.rank}. ${r.agent}`).join(', ')
                globalMemory.updateWinner(session.debateId, rankingStr)
              }
            }
          } catch (e) {
            console.error('[Judge] Ошибка парсинга JSON вердикта:', e.message)
            // Fallback: сохраняем весь вердикт
            globalMemory.updateWinner(session.debateId, 'См. вердикт судьи')
          }
        } else {
          // Для двух агентов - обычный поиск победителя
          const winnerMatch = verdict.match(/Победитель:\s*(\w+)/i) || verdict.match(/winner:\s*(\w+)/i)
          const winner = winnerMatch ? winnerMatch[1] : (verdict.includes(agents[0].name) ? agents[0].name : agents[1].name)
          globalMemory.updateWinner(session.debateId, winner)
        }
        
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

// Эндпоинт для получения расширенной статистики
app.get('/memory/analytics', async (_req, res) => {
  await globalMemory.init()
  res.json({
    analytics: globalMemory.getAnalytics(),
  })
})

app.listen(PORT, () => {
  console.log(`Arena backend started on ${PORT} (${provider.label}, ${provider.model})`)
  if (!client) {
    console.warn(missingProviderMessage())
  }
})
