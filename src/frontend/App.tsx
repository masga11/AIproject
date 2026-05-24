import { useEffect, useRef, useState } from 'react'
import './App.css'

const EXAMPLE_TOPICS = [
  'Искусственный интеллект заменит программистов к 2030 году',
  'Бесплатное образование должно быть правом каждого',
  'Социальные сети приносят больше вреда, чем пользы',
]

const HISTORY_KEY = 'debate-history'
const MAX_HISTORY = 20

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
      })
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

    let debateMeta = { topic: trimmed, rounds, withJudge, model }
    let finalMessages = []
    let stopped = false

    try {
      const params = new URLSearchParams({
        topic: trimmed,
        rounds: String(rounds),
        withJudge: withJudge ? '1' : '0',
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

  function openHistoryItem(item) {
    setViewingHistoryId(item.id)
    setTopic(item.topic)
    setRounds(item.rounds)
    setWithJudge(item.withJudge)
    if (item.model) setModel(item.model)
    setMessages(item.messages)
    setMeta({ topic: item.topic, rounds: item.rounds, withJudge: item.withJudge, model: item.model })
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
        </div>

        {error && <div className="error">{error}</div>}
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
            <h2>История споров</h2>
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
    </div>
  )
}

export default App
