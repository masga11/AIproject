import { useEffect, useRef, useState } from 'react'
import './App.css'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const EXAMPLE_TOPICS = [
  'Искусственный интеллект заменит программистов к 2030 году',
  'Бесплатное образование должно быть правом каждого',
  'Социальные сети приносят больше вреда, чем пользы',
]

const HISTORY_KEY = 'debate-history-local'
const MAX_HISTORY = 10

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHistory(entry) {
  const prev = loadHistory()
  const next = [entry, ...prev].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  return next
}

// Загрузка истории из глобальной памяти
async function loadGlobalHistory() {
  try {
    const res = await fetch('/api/memory/history?limit=50')
    const data = await res.json()
    return data.debates || []
  } catch {
    return []
  }
}

// Загрузка полного дебата из глобальной памяти
async function loadGlobalDebate(id) {
  try {
    const res = await fetch(`/api/memory/debate/${id}`)
    const data = await res.json()
    return data.debate || null
  } catch {
    return null
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function App() {
  const [topic, setTopic] = useState('')
  const [rounds, setRounds] = useState(3)
  const [withJudge, setWithJudge] = useState(true)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [history, setHistory] = useState([])
  const [viewingHistoryId, setViewingHistoryId] = useState(null)
  const [model, setModel] = useState('')
  const [modelOptions, setModelOptions] = useState([])
  const [memoryStats, setMemoryStats] = useState(null)
  const [globalHistory, setGlobalHistory] = useState([])
  const [availableAgents, setAvailableAgents] = useState([])
  const [customAgents, setCustomAgents] = useState([])
  const [agent1, setAgent1] = useState('philosopher')
  const [agent2, setAgent2] = useState('skeptic')
  const [analytics, setAnalytics] = useState(null)
  const [showAnalytics, setShowAnalytics] = useState(false)
  
  // Состояние для управления кастомными агентами
  const [showCustomAgentForm, setShowCustomAgentForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState(null)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentRole, setNewAgentRole] = useState('')
  const [newAgentPrompt, setNewAgentPrompt] = useState('')
  const [newAgentColor, setNewAgentColor] = useState('#8b5cf6')
  const [customAgentStats, setCustomAgentStats] = useState(null)
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json'>('markdown')

  const abortRef = useRef(null)
  const messagesEndRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)

  useEffect(() => {
    setHistory(loadHistory())

    fetch('/api/agents')
      .then((res) => res.json())
      .then((data) => {
        if (data.models?.length) {
          setModelOptions(data.models)
          setModel(data.model || data.models[0].id)
        }
        if (data.allAgents?.length) {
          setAvailableAgents(data.allAgents)
        }
        if (data.customAgents?.length) {
          setCustomAgents(data.customAgents)
        }
      })
      .catch(() => {})
    
    // Загрузка статистики глобальной памяти
    fetch('/api/memory/stats')
      .then((res) => res.json())
      .then((data) => setMemoryStats(data.stats))
      .catch(() => {})
    
    // Загрузка глобальной истории дебатов
    loadGlobalHistory().then(setGlobalHistory)
    
    // Загрузка статистики кастомных агентов
    fetch('/api/custom-agents/stats')
      .then((res) => res.json())
      .then((data) => setCustomAgentStats(data.stats))
      .catch(() => {})
    
    // Загрузка расширенной аналитики
    fetch('/api/memory/analytics')
      .then((res) => res.json())
      .then((data) => setAnalytics(data.analytics))
      .catch(() => {})
  }, [])

  useEffect(() => {
    function updateAutoScroll() {
      const distanceFromBottom =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      shouldAutoScrollRef.current = distanceFromBottom < 120
    }

    updateAutoScroll()
    window.addEventListener('scroll', updateAutoScroll, { passive: true })
    return () => window.removeEventListener('scroll', updateAutoScroll)
  }, [])

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [messages])

  function stopDebate() {
    abortRef.current?.abort()
  }

  // Функции для управления кастомными агентами
  async function saveCustomAgent() {
    if (!newAgentName.trim() || !newAgentRole.trim() || !newAgentPrompt.trim()) {
      setError('Заполните все поля')
      return
    }

    try {
      const url = editingAgent 
        ? `/api/custom-agents/${editingAgent.id}` 
        : '/api/custom-agents'
      
      const method = editingAgent ? 'PUT' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAgentName,
          role: newAgentRole,
          systemPrompt: newAgentPrompt,
          color: newAgentColor,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка сохранения')
      }

      // Перезагружаем список агентов
      const agentsRes = await fetch('/api/agents')
      const data = await agentsRes.json()
      if (data.customAgents) {
        setCustomAgents(data.customAgents)
      }

      // Сбрасываем форму
      resetAgentForm()
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteCustomAgent(id) {
    try {
      const res = await fetch(`/api/custom-agents/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Ошибка удаления')

      // Перезагружаем список
      const agentsRes = await fetch('/api/agents')
      const data = await agentsRes.json()
      if (data.customAgents) {
        setCustomAgents(data.customAgents)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  function editCustomAgent(agent) {
    setEditingAgent(agent)
    setNewAgentName(agent.name)
    setNewAgentRole(agent.role)
    setNewAgentPrompt(agent.systemPrompt)
    setNewAgentColor(agent.color)
    setShowCustomAgentForm(true)
  }

  function resetAgentForm() {
    setEditingAgent(null)
    setNewAgentName('')
    setNewAgentRole('')
    setNewAgentPrompt('')
    setNewAgentColor('#8b5cf6')
    setShowCustomAgentForm(false)
  }

  // Функция экспорта дебатов
  function exportDebate(format: 'markdown' | 'json' = 'markdown') {
    if (messages.length === 0 || !meta) return
    
    let content = ''
    const filename = `debate-${Date.now()}`
    
    if (format === 'json') {
      content = JSON.stringify({
        topic: meta.topic,
        date: new Date().toISOString(),
        rounds: meta.rounds,
        model: meta.model,
        messages: messages.map(m => ({
          agent: m.agent,
          role: m.role,
          round: m.round,
          isJudge: m.isJudge,
          message: m.message
        }))
      }, null, 2)
    } else {
      // Markdown формат
      content = `# Дебаты: ${meta.topic}\n\n`
      content += `**Дата:** ${new Date().toLocaleString('ru-RU')}\n`
      content += `**Модель:** ${meta.model}\n`
      content += `**Раундов:** ${meta.rounds}\n\n`
      content += `---\n\n`
      
      for (let i = 1; i <= meta.rounds; i++) {
        content += `## Раунд ${i}\n\n`
        const roundMessages = messages.filter(m => m.round === i && !m.isJudge)
        for (const msg of roundMessages) {
          content += `### ${msg.agent} (${msg.role})\n\n${msg.message}\n\n`
        }
      }
      
      const judgeMessage = messages.find(m => m.isJudge)
      if (judgeMessage) {
        content += `## Вердикт судьи\n\n${judgeMessage.message}\n`
      }
    }
    
    // Скачивание файла
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.${format === 'json' ? 'json' : 'md'}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function persistDebate(status, finalMessages, debateMeta) {
    if (!debateMeta?.topic || finalMessages.length === 0) return

    const entry = {
      id: `${Date.now()}`,
      topic: debateMeta.topic,
      rounds: debateMeta.rounds,
      withJudge: debateMeta.withJudge,
      model: debateMeta.model,
      status,
      createdAt: new Date().toISOString(),
      messages: finalMessages,
    }

    const next = saveHistory(entry)
    setHistory(next)
  }

  async function runDebate() {
    const trimmed = topic.trim()
    if (!trimmed || loading) return

    setViewingHistoryId(null)
    shouldAutoScrollRef.current = true
    setLoading(true)
    setError(null)
    setMessages([])
    setMeta(null)
    setCurrentRound(0)

    const controller = new AbortController()
    abortRef.current = controller

    let debateMeta = { topic: trimmed, rounds, withJudge, model, agent1, agent2 }
    let finalMessages = []
    let stopped = false

    try {
      const params = new URLSearchParams({
        topic: trimmed,
        rounds: String(rounds),
        withJudge: withJudge ? '1' : '0',
        agent1,
        agent2,
      })

      if (model) params.set('model', model)

      const response = await fetch(
        `/api/autonomous-debate-stream?${params.toString()}`,
        { signal: controller.signal },
      )

      if (!response.ok) {
        throw new Error('Сервер недоступен. Запустите npm run dev.')
      }

      if (!response.body) {
        throw new Error('Браузер не поддерживает потоковый ответ.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''

        for (const chunk of chunks) {
          const line = chunk.trim()
          if (!line.startsWith('data: ')) continue

          const event = JSON.parse(line.slice(6))

          switch (event.type) {
            case 'debate_start':
              debateMeta = {
                topic: event.topic,
                rounds: event.rounds,
                withJudge: event.withJudge,
                model: event.model,
              }
              setMeta(debateMeta)
              break

            case 'round_start':
              setCurrentRound(event.round)
              break

            case 'agent_start':
              finalMessages = [
                ...finalMessages,
                {
                  id: event.id,
                  agent: event.agent,
                  role: event.role,
                  color: event.color,
                  round: event.round,
                  isJudge: event.isJudge || false,
                  message: '',
                },
              ]
              setMessages(finalMessages)
              break

            case 'token':
              finalMessages = finalMessages.map((item) =>
                item.id === event.id
                  ? { ...item, message: item.message + event.text }
                  : item,
              )
              setMessages(finalMessages)
              break

            case 'error':
              setError(event.message)
              break

            case 'stopped':
              stopped = true
              break

            case 'done':
              break

            default:
              break
          }
        }
      }

      if (finalMessages.length > 0) {
        persistDebate(stopped ? 'stopped' : 'completed', finalMessages, debateMeta)
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (finalMessages.length > 0) {
          persistDebate('stopped', finalMessages, debateMeta)
        }
      } else {
        setError(err.message || 'Не удалось запустить дебаты')
      }
    } finally {
      abortRef.current = null
      setLoading(false)
    }
  }

  async function openHistoryItem(item) {
    setViewingHistoryId(item.id)
    setTopic(item.topic)
    setRounds(item.rounds)
    setWithJudge(item.withJudge !== undefined ? item.withJudge : true)
    if (item.model) setModel(item.model)
    
    // Пытаемся загрузить из глобальной памяти сначала
    const globalDebate = await loadGlobalDebate(item.id)
    if (globalDebate && globalDebate.messages) {
      const formattedMessages = globalDebate.messages.map((msg, idx) => ({
        id: `${msg.agentName}-r${msg.round}-${idx}`,
        agent: msg.agentName,
        role: msg.agentRole,
        color: msg.agentRole === 'Философ' || msg.agentName === 'Philosopher' ? '#8b5cf6' : '#f97316',
        round: msg.round,
        isJudge: false,
        message: msg.content,
      }))
      setMessages(formattedMessages)
      setMeta({ 
        topic: globalDebate.topic, 
        rounds: globalDebate.rounds, 
        withJudge: !!globalDebate.winner, 
        model: globalDebate.model 
      })
    } else if (item.messages) {
      setMessages(item.messages)
      setMeta({ topic: item.topic, rounds: item.rounds, withJudge: item.withJudge, model: item.model })
    }
    
    setError(null)
    setCurrentRound(0)
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY)
    setHistory([])
    setViewingHistoryId(null)
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Автономные ИИ-дебаты</p>
          <h1>AI Debate Arena</h1>
          <p className="subtitle">
            Два агента спорят в несколько раундов, судья подводит итог.
          </p>
          {memoryStats && (
            <p className="memory-stats">
              🧠 Глобальная память: <strong>{memoryStats.totalDebates}</strong> дебатов,{' '}
              <strong>{memoryStats.totalMessages}</strong> реплик,{' '}
              <strong>{memoryStats.totalKnowledge}</strong> знаний
            </p>
          )}
        </div>
      </header>

      <section className="panel">
        <label className="label" htmlFor="topic">
          Тема спора
        </label>
        <input
          id="topic"
          className="input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Например: нужен ли универсальный базовый доход?"
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runDebate()
          }}
        />

        <div className="examples">
          {EXAMPLE_TOPICS.map((example) => (
            <button
              key={example}
              type="button"
              className="chip"
              disabled={loading}
              onClick={() => setTopic(example)}
            >
              {example}
            </button>
          ))}
        </div>

        <div className="settings">
          {availableAgents.length > 0 && (
            <>
              <label className="setting">
                <span>Агент 1</span>
                <select
                  className="select"
                  value={agent1}
                  disabled={loading}
                  onChange={(e) => setAgent1(e.target.value)}
                >
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} — {agent.role}
                    </option>
                  ))}
                </select>
              </label>

              <label className="setting">
                <span>Агент 2</span>
                <select
                  className="select"
                  value={agent2}
                  disabled={loading}
                  onChange={(e) => setAgent2(e.target.value)}
                >
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} — {agent.role}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {customAgents.length > 0 && (
            <>
              <label className="setting">
                <span>Агент 1 (кастомные)</span>
                <select
                  className="select"
                  value={agent1}
                  disabled={loading}
                  onChange={(e) => setAgent1(e.target.value)}
                >
                  {customAgents.map((agent) => (
                    <option key={agent.id} value={agent.id} style={{ color: agent.color }}>
                      🎨 {agent.name} — {agent.role}
                    </option>
                  ))}
                </select>
              </label>

              <label className="setting">
                <span>Агент 2 (кастомные)</span>
                <select
                  className="select"
                  value={agent2}
                  disabled={loading}
                  onChange={(e) => setAgent2(e.target.value)}
                >
                  {customAgents.map((agent) => (
                    <option key={agent.id} value={agent.id} style={{ color: agent.color }}>
                      🎨 {agent.name} — {agent.role}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {modelOptions.length > 0 && (
            <label className="setting">
              <span>Модель</span>
              <select
                className="select"
                value={model}
                disabled={loading}
                onChange={(e) => setModel(e.target.value)}
              >
                {modelOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="setting-hint">
                {modelOptions.find((option) => option.id === model)?.hint}
              </span>
            </label>
          )}

          <label className="setting">
            <span>Раундов: <strong>{rounds}</strong></span>
            <input
              type="range"
              min={1}
              max={5}
              value={rounds}
              disabled={loading}
              onChange={(e) => setRounds(Number(e.target.value))}
            />
          </label>

          <label className="setting checkbox">
            <input
              type="checkbox"
              checked={withJudge}
              disabled={loading}
              onChange={(e) => setWithJudge(e.target.checked)}
            />
            <span>Судья в конце</span>
          </label>
        </div>

        <div className="actions">
          <button
            type="button"
            className="primary"
            onClick={runDebate}
            disabled={loading || !topic.trim()}
          >
            {loading ? 'Идёт спор…' : 'Запустить автономный спор'}
          </button>

          {loading && (
            <button type="button" className="secondary" onClick={stopDebate}>
              Стоп
            </button>
          )}
          
          {!loading && messages.length > 0 && (
            <button 
              type="button" 
              className="secondary" 
              onClick={() => exportDebate(exportFormat)}
              title={`Экспорт в ${exportFormat === 'json' ? 'JSON' : 'Markdown'}`}
            >
              📥 Экспорт
            </button>
          )}
          
          {!loading && messages.length > 0 && (
            <select
              className="select"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'markdown' | 'json')}
              style={{ width: 'auto', minWidth: '120px' }}
            >
              <option value="markdown">📄 Markdown</option>
              <option value="json">📋 JSON</option>
            </select>
          )}
        </div>

        {error && <div className="error">{error}</div>}
        
        {/* Секция управления кастомными агентами */}
        <div className="custom-agents-section">
          <div className="custom-agents-header">
            <h3>🎨 Мои агенты</h3>
            <button
              type="button"
              className="link-btn"
              onClick={() => setShowCustomAgentForm(!showCustomAgentForm)}
            >
              {showCustomAgentForm ? 'Скрыть' : 'Создать агента'}
            </button>
          </div>
          
          {customAgentStats && (
            <p className="custom-agents-stats">
              Создано: <strong>{customAgentStats.totalAgents}</strong> · Активно: <strong>{customAgentStats.activeAgents}</strong>
            </p>
          )}
          
          {showCustomAgentForm && (
            <div className="custom-agent-form panel">
              <h4>{editingAgent ? 'Редактировать агента' : 'Новый агент'}</h4>
              
              <label className="label">
                Имя агента
                <input
                  className="input"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="Например: Капиталист"
                />
              </label>
              
              <label className="label">
                Роль / описание
                <input
                  className="input"
                  value={newAgentRole}
                  onChange={(e) => setNewAgentRole(e.target.value)}
                  placeholder="Например: Сторонник свободного рынка"
                />
              </label>
              
              <label className="label">
                Системный промт
                <textarea
                  className="textarea"
                  value={newAgentPrompt}
                  onChange={(e) => setNewAgentPrompt(e.target.value)}
                  placeholder="Опишите поведение агента, его принципы и стиль аргументации..."
                  rows={5}
                />
              </label>
              
              <label className="setting">
                <span>Цвет аватара</span>
                <input
                  type="color"
                  value={newAgentColor}
                  onChange={(e) => setNewAgentColor(e.target.value)}
                />
              </label>
              
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  onClick={saveCustomAgent}
                >
                  {editingAgent ? 'Сохранить' : 'Создать'}
                </button>
                {editingAgent && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={resetAgentForm}
                  >
                    Отмена
                  </button>
                )}
              </div>
            </div>
          )}
          
          {customAgents.length > 0 && (
            <div className="custom-agents-list">
              {customAgents.map((agent) => (
                <div key={agent.id} className="custom-agent-item">
                  <div className="custom-agent-info">
                    <span className="avatar" style={{ backgroundColor: agent.color }}>
                      {agent.name[0]}
                    </span>
                    <div>
                      <strong>{agent.name}</strong>
                      <p>{agent.role}</p>
                    </div>
                  </div>
                  <div className="custom-agent-actions">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => editCustomAgent(agent)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() => deleteCustomAgent(agent.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {(meta || loading) && (
        <section className="status">
          {meta && (
            <span>
              Тема: <strong>{meta.topic}</strong>
              {meta.model && <> · модель: <strong>{meta.model}</strong></>}
            </span>
          )}
          {loading && currentRound > 0 && (
            <span>
              Раунд {currentRound} из {meta?.rounds || rounds}
            </span>
          )}
          {viewingHistoryId && !loading && (
            <span className="history-badge">Просмотр из истории</span>
          )}
        </section>
      )}

      <section className="messages">
        {messages.length === 0 && !loading && (
          <div className="empty">
            Введите тему и нажмите кнопку — агенты начнут спор в реальном времени.
          </div>
        )}

        {messages.map((item) => (
          <article
            key={item.id}
            className={`message ${item.isJudge ? 'message-judge' : ''}`}
            style={{ '--accent': item.color }}
          >
            <div className="message-head">
              <span className="avatar">{item.agent[0]}</span>
              <div>
                <strong>{item.agent}</strong>
                <p>{item.role}</p>
              </div>
              <span className="round-badge">
                {item.isJudge ? 'Вердикт' : `Раунд ${item.round}`}
              </span>
            </div>
            <p className="message-body">
              {item.message || (loading ? 'Печатает…' : '')}
            </p>
          </article>
        ))}
        <div ref={messagesEndRef} />
      </section>

      {history.length > 0 && (
        <section className="history panel">
          <div className="history-head">
            <h2>Локальная история</h2>
            <button type="button" className="link-btn" onClick={clearHistory}>
              Очистить
            </button>
          </div>
          <div className="history-list">
            {history.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`history-item ${viewingHistoryId === item.id ? 'active' : ''}`}
                onClick={() => openHistoryItem(item)}
              >
                <strong>{item.topic}</strong>
                <span>
                  {formatDate(item.createdAt)} · {item.messages.length} реплик
                  {item.status === 'stopped' ? ' · прерван' : ''}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {globalHistory.length > 0 && (
        <section className="history panel">
          <div className="history-head">
            <h2>🌍 Глобальная память</h2>
            <span className="memory-badge">{globalHistory.length} дебатов</span>
          </div>
          <div className="history-list">
            {globalHistory.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`history-item ${viewingHistoryId === item.id ? 'active' : ''}`}
                onClick={() => openHistoryItem(item)}
              >
                <strong>{item.topic}</strong>
                <span>
                  {new Date(item.createdAt).toLocaleDateString('ru-RU')} · {item.provider}/{item.model}
                  {item.winner ? ` · Победитель: ${item.winner}` : ''}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default App
