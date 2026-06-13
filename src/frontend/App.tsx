import { useEffect, useRef, useState } from 'react'
import './App.css'
import type { Agent, DebateMessage, DebateMeta, HistoryEntry, GlobalDebateEntry, MemoryStats, Analytics, AgentStats } from './types'
import {
  loadHistory,
  saveHistory,
  clearHistory as clearLocalHistory,
  loadGlobalHistory,
  loadGlobalDebate,
  loadTournamentHistory,
  fetchAgents,
  fetchMemoryStats,
  fetchAnalytics,
  fetchCustomAgentStats,
} from './api'
import { Header } from './components/Header'
import { DebateSettings } from './components/DebateSettings'
import { CustomAgentPanel } from './components/CustomAgentPanel'
import { DebateMessages } from './components/DebateMessages'
import { DebateHistory } from './components/DebateHistory'
import { AnalyticsModal } from './components/AnalyticsModal'
import { ProgressBar } from './components/ProgressBar'
import { ElapsedTimer } from './components/ElapsedTimer'
import { TournamentSetup } from './components/TournamentSetup'
import { TournamentBracket } from './components/TournamentBracket'
import { TournamentArchive } from './components/TournamentArchive'
import { exportPdf } from './pdfExport'

export default function App() {
  const [topic, setTopic] = useState('')
  const [rounds, setRounds] = useState(3)
  const [withJudge, setWithJudge] = useState(true)
  const [messages, setMessages] = useState<DebateMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<DebateMeta | null>(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null)
  const [model, setModel] = useState('')
  const [modelOptions, setModelOptions] = useState<{ id: string; label: string; hint: string }[]>([])
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null)
  const [globalHistory, setGlobalHistory] = useState<GlobalDebateEntry[]>([])
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([])
  const [customAgents, setCustomAgents] = useState<Agent[]>([])
  const [agentCount, setAgentCount] = useState(2)
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['philosopher', 'skeptic'])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [agentModels, setAgentModels] = useState<string[]>(['', ''])
  const [agentTemps, setAgentTemps] = useState<number[]>([0.8, 0.8])
  const [agentProviders, setAgentProviders] = useState<string[]>(['', ''])
  const [provider, setProvider] = useState({ name: 'ollama' })
  const [customAgentStats, setCustomAgentStats] = useState<AgentStats | null>(null)
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json'>('markdown')
  const [pdfStyle, setPdfStyle] = useState<'minimal' | 'detailed'>('minimal')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark'
  })
  const [appMode, setAppMode] = useState<'debate' | 'tournament'>('debate')
  const [tournamentRounds, setTournamentRounds] = useState<any[][]>([])
  const [tournamentChampion, setTournamentChampion] = useState<string | null>(null)
  const [tournamentStatus, setTournamentStatus] = useState<string>('pending')
  const [tournamentLoading, setTournamentLoading] = useState(false)
  const [tournamentMessages, setTournamentMessages] = useState<DebateMessage[]>([])
  const [tournamentHistory, setTournamentHistory] = useState<GlobalDebateEntry[]>([])

  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const shouldAutoScrollRef = useRef(true)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && loading) {
        stopDebate()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [loading])

  useEffect(() => {
    setHistory(loadHistory())

    fetchAgents()
      .then((data) => {
        if (data.models?.length) {
          setModelOptions(data.models)
          setModel(data.model || data.models[0].id)
        }
        if (data.allAgents?.length) setAvailableAgents(data.allAgents)
        if (data.customAgents?.length) setCustomAgents(data.customAgents)
        if (data.provider) setProvider({ name: data.provider })
      })
      .catch(() => {})

    fetchMemoryStats().then((data) => setMemoryStats(data.stats)).catch(() => {})
    loadGlobalHistory().then(setGlobalHistory)
    loadTournamentHistory().then(setTournamentHistory)
    fetchCustomAgentStats().then((data) => setCustomAgentStats(data.stats)).catch(() => {})
    fetchAnalytics().then((data) => setAnalytics(data.analytics)).catch(() => {})
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
          agent: m.agent, role: m.role, round: m.round, isJudge: m.isJudge, message: m.message,
        })),
      }, null, 2)
    } else {
      content = `# Дебаты: ${meta.topic}\n\n`
      content += `**Дата:** ${new Date().toLocaleString('ru-RU')}\n`
      content += `**Модель:** ${meta.model}\n`
      content += `**Раундов:** ${meta.rounds}\n\n---\n\n`

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

  async function handlePdfExport() {
    if (messages.length === 0 || !meta) return
    try {
      await exportPdf({ topic: meta.topic, messages, meta, style: pdfStyle })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка экспорта PDF')
    }
  }

  async function importDebates(files: FileList | null) {
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        let data: any

        if (file.name.endsWith('.json')) {
          data = JSON.parse(text)
        } else if (file.name.endsWith('.md')) {
          const messages = []
          const lines = text.split('\n')
          let currentTopic = ''
          let currentAgent = ''
          let currentRole = ''
          let currentRound = 1
          let content = ''

          for (const line of lines) {
            if (line.startsWith('# Дебаты:')) {
              currentTopic = line.replace('# Дебаты:', '').trim()
            } else if (line.startsWith('### ')) {
              if (currentAgent && content.trim()) {
                messages.push({ agent: currentAgent, role: currentRole, round: currentRound, content: content.trim() })
              }
              const match = line.replace('### ', '').match(/(.+?)\s*\((.+?)\)/)
              if (match) {
                currentAgent = match[1].trim()
                currentRole = match[2].trim()
              }
              content = ''
            } else if (line.startsWith('## Раунд ')) {
              if (currentAgent && content.trim()) {
                messages.push({ agent: currentAgent, role: currentRole, round: currentRound, content: content.trim() })
                currentAgent = ''
                content = ''
              }
              currentRound = parseInt(line.replace('## Раунд ', '')) || currentRound
            } else if (line.startsWith('## Вердикт судьи')) {
              if (currentAgent && content.trim()) {
                messages.push({ agent: currentAgent, role: currentRole, round: currentRound, content: content.trim() })
              }
              currentAgent = 'Judge'
              currentRole = 'Беспристрастный судья'
              content = ''
            } else {
              content += line + '\n'
            }
          }
          if (currentAgent && content.trim()) {
            messages.push({ agent: currentAgent, role: currentRole, round: currentRound, content: content.trim() })
          }

          data = { topic: currentTopic || file.name.replace(/\.\w+$/, ''), messages, rounds: currentRound }
        } else {
          setError(`Неподдерживаемый формат: ${file.name}`)
          continue
        }

        const debates = Array.isArray(data) ? data : [data]

        const res = await fetch('/api/memory/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ debates }),
        })

        if (!res.ok) throw new Error('Ошибка импорта')

        const result = await res.json()
        if (result.imported > 0) {
          loadGlobalHistory().then(setGlobalHistory)
          fetchMemoryStats().then((data) => setMemoryStats(data.stats))
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Ошибка чтения файла')
      }
    }
  }

  function persistDebate(status: string, finalMessages: DebateMessage[], debateMeta: DebateMeta) {
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

    let debateMeta: DebateMeta & { agents?: string[] } = { topic: trimmed, rounds, withJudge, model, agents: selectedAgents }
    let finalMessages: DebateMessage[] = []
    let stopped = false

    try {
      const params = new URLSearchParams({
        topic: trimmed,
        rounds: String(rounds),
        withJudge: withJudge ? '1' : '0',
      })

      for (const agentId of selectedAgents) {
        params.append('agents', agentId)
      }

      if (model) params.set('model', model)

      for (let i = 0; i < selectedAgents.length; i++) {
        if (agentModels[i]) params.set(`agent${i}Model`, agentModels[i])
        if (agentTemps[i] !== 0.8) params.set(`agent${i}Temp`, String(agentTemps[i]))
        if (agentProviders[i]) params.set(`agent${i}Provider`, agentProviders[i])
      }

      const response = await fetch(
        `/api/autonomous-debate-stream?${params.toString()}`,
        { signal: controller.signal },
      )

      if (!response.ok) throw new Error('Сервер недоступен. Запустите npm run dev.')
      if (!response.body) throw new Error('Браузер не поддерживает потоковый ответ.')

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
              debateMeta = { topic: event.topic, rounds: event.rounds, withJudge: event.withJudge, model: event.model }
              setMeta(debateMeta)
              break
            case 'round_start':
              setCurrentRound(event.round)
              break
            case 'agent_start':
              finalMessages = [...finalMessages, {
                id: event.id, agent: event.agent, role: event.role, color: event.color,
                round: event.round, side: event.side || '', isJudge: event.isJudge || false, message: '',
              }]
              setMessages(finalMessages)
              break
            case 'token':
              finalMessages = finalMessages.map((item) =>
                item.id === event.id ? { ...item, message: item.message + event.text } : item,
              )
              setMessages(finalMessages)
              break
            case 'error':
              setError(event.message)
              break
            case 'stopped':
              stopped = true
              break
          }
        }
      }

      if (finalMessages.length > 0) {
        persistDebate(stopped ? 'stopped' : 'completed', finalMessages, debateMeta)
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (finalMessages.length > 0) persistDebate('stopped', finalMessages, debateMeta)
      } else {
        setError(err instanceof Error ? err.message || 'Не удалось запустить дебаты' : 'Не удалось запустить дебаты')
      }
    } finally {
      abortRef.current = null
      setLoading(false)
    }
  }

  async function openHistoryItem(item: HistoryEntry | GlobalDebateEntry) {
    setViewingHistoryId(item.id)
    setTopic(item.topic)
    setRounds(item.rounds)
    setWithJudge('withJudge' in item ? (item.withJudge ?? true) : true)
    if ('model' in item && item.model) setModel(item.model)

    const globalDebate = await loadGlobalDebate(item.id)
    if (globalDebate && globalDebate.messages) {
      const formattedMessages = globalDebate.messages.map((msg: Record<string, unknown>, idx: number) => ({
        id: `${msg.agentName}-r${msg.round}-${idx}`,
        agent: msg.agentName as string,
        role: msg.agentRole as string,
        color: (msg.agentRole === 'Философ' || msg.agentName === 'Philosopher') ? '#8b5cf6' : '#f97316',
        round: msg.round as number,
        isJudge: false,
        message: msg.content as string,
      }))
      setMessages(formattedMessages)
      setMeta({ topic: globalDebate.topic, rounds: globalDebate.rounds, withJudge: !!globalDebate.winner, model: globalDebate.model })
    } else if ('messages' in item && item.messages) {
      setMessages(item.messages)
      setMeta({ topic: item.topic, rounds: item.rounds, withJudge: item.withJudge, model: item.model })
    }

    setError(null)
    setCurrentRound(0)
  }

  async function openTournamentItem(item: GlobalDebateEntry) {
    setViewingHistoryId(item.id)
    setTopic(item.topic)
    setAppMode('debate')

    const globalDebate = await loadGlobalDebate(item.id)
    if (globalDebate && globalDebate.messages) {
      const formattedMessages = globalDebate.messages.map((msg: Record<string, unknown>, idx: number) => ({
        id: `${msg.agentName}-r${msg.round}-${idx}`,
        agent: msg.agentName as string,
        role: msg.agentRole as string,
        color: (msg.agentRole === 'Философ' || msg.agentName === 'Philosopher') ? '#8b5cf6'
          : (msg.agentRole === 'Скептик' || msg.agentName === 'Skeptic') ? '#fb7185'
          : '#60a5fa',
        round: msg.round as number,
        isJudge: false,
        message: msg.content as string,
      }))
      setMessages(formattedMessages)
      setMeta({ topic: globalDebate.topic, rounds: globalDebate.rounds, withJudge: !!globalDebate.winner, model: globalDebate.model })
    }

    setError(null)
    setCurrentRound(0)
  }

  function handleClearHistory() {
    clearLocalHistory()
    setHistory([])
    setViewingHistoryId(null)
  }

  async function refreshAgents() {
    try {
      const data = await fetchAgents()
      if (data.customAgents) setCustomAgents(data.customAgents)
      if (data.allAgents) setAvailableAgents(data.allAgents)
    } catch {}
  }

  async function startTournament(agentIds: string[], topic: string) {
    setTournamentLoading(true)
    setTournamentRounds([])
    setTournamentChampion(null)
    setTournamentStatus('running')
    setTournamentMessages([])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/tournament/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: agentIds, topic }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка запуска турнира')
      }

      const { tournamentId, bracket } = await res.json()
      setTournamentRounds(bracket.rounds)

      const streamRes = await fetch(`/api/tournament/${tournamentId}/stream`, {
        signal: controller.signal,
      })

      if (!streamRes.ok) throw new Error('Ошибка подключения к турниру')
      if (!streamRes.body) throw new Error('Браузер не поддерживает SSE')

      const reader = streamRes.body.getReader()
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
            case 'tournament_round':
              break

            case 'match_start':
              setTournamentRounds(prev => {
                const updated = prev.map(r => r.map(m => ({ ...m })))
                for (const round of updated) {
                  const match = round.find((m: any) => m.id === event.matchId)
                  if (match) {
                    match.status = 'running'
                    if (event.agent1) match.agent1 = { name: event.agent1, color: match.agent1?.color || '#818cf8' }
                    if (event.agent2) match.agent2 = { name: event.agent2, color: match.agent2?.color || '#fb7185' }
                    break
                  }
                }
                return updated
              })
              break

            case 'agent_start':
              setTournamentMessages(prev => [...prev, {
                id: event.id,
                agent: event.agent,
                role: event.role,
                color: event.color,
                round: event.round,
                side: event.side || '',
                isJudge: event.isJudge || false,
                message: '',
              }])
              break

            case 'token':
              setTournamentMessages(prev => prev.map(m =>
                m.id === event.id ? { ...m, message: m.message + event.text } : m
              ))
              break

            case 'match_end':
              setTournamentRounds(prev => {
                const updated = prev.map(r => r.map(m => ({ ...m })))
                for (const round of updated) {
                  const match = round.find((m: any) => m.id === event.matchId)
                  if (match) {
                    match.status = 'completed'
                    const winnerAgent = [match.agent1, match.agent2].find(a => a?.name === event.winner)
                    match.winner = winnerAgent || { name: event.winner, id: event.winnerId, color: '#22c55e' }
                    match.verdict = event.verdict
                    break
                  }
                }
                return updated
              })
              setTournamentMessages([])
              break

            case 'tournament_end':
              setTournamentChampion(event.champion)
              setTournamentStatus(event.status)
              loadTournamentHistory().then(setTournamentHistory)
              break

            case 'error':
              setError(event.message)
              break
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'Ошибка турнира')
      }
      setTournamentStatus('stopped')
    } finally {
      abortRef.current = null
      setTournamentLoading(false)
    }
  }

  return (
    <div className="app">
      <Header memoryStats={memoryStats} onShowStats={() => setShowStatsModal(true)} theme={theme} onToggleTheme={toggleTheme} />

      <div className="mode-toggle">
        <button
          type="button"
          className={`mode-toggle-btn ${appMode === 'debate' ? 'active' : ''}`}
          onClick={() => setAppMode('debate')}
        >
          💬 Дебаты
        </button>
        <button
          type="button"
          className={`mode-toggle-btn ${appMode === 'tournament' ? 'active' : ''}`}
          onClick={() => setAppMode('tournament')}
        >
          🏆 Турнир
        </button>
      </div>

      {appMode === 'debate' ? (<>
        <DebateSettings
        topic={topic}
        onTopicChange={setTopic}
        rounds={rounds}
        onRoundsChange={setRounds}
        withJudge={withJudge}
        onWithJudgeChange={setWithJudge}
        agentCount={agentCount}
        onAgentCountChange={setAgentCount}
        selectedAgents={selectedAgents}
        onSelectedAgentsChange={setSelectedAgents as (v: string[]) => void}
        availableAgents={availableAgents}
        model={model}
        modelOptions={modelOptions}
        onModelChange={setModel}
        agentModels={agentModels}
        onAgentModelsChange={setAgentModels}
        agentTemps={agentTemps}
        onAgentTempsChange={setAgentTemps}
        agentProviders={agentProviders}
        onAgentProvidersChange={setAgentProviders}
        providerName={provider.name}
        loading={loading}
        onStart={runDebate}
        onStop={stopDebate}
      />

      {error && <div className="error">{error}</div>}

      <ProgressBar currentRound={currentRound} totalRounds={meta?.rounds || rounds} loading={loading} />

      {(!loading && messages.length > 0) && (
        <div className="actions" style={{ marginTop: '14px' }}>
          <button type="button" className="secondary" onClick={() => exportDebate(exportFormat)}>
            📥 Экспорт
          </button>
          <select
            className="select"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'markdown' | 'json')}
            style={{ width: 'auto', minWidth: '120px' }}
          >
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
          </select>

          <button type="button" className="secondary" onClick={handlePdfExport}>
            📄 PDF
          </button>
          <select
            className="select"
            value={pdfStyle}
            onChange={(e) => setPdfStyle(e.target.value as 'minimal' | 'detailed')}
            style={{ width: 'auto', minWidth: '120px' }}
          >
            <option value="minimal">Минимализм</option>
            <option value="detailed">Детальный</option>
          </select>
        </div>
      )}

      {(meta || loading) && (
        <section className="status">
          {meta && (
            <span>
              Тема: <strong>{meta.topic}</strong>
              {meta.model && <> · модель: <strong>{meta.model}</strong></>}
            </span>
          )}
          {loading && currentRound > 0 && (
            <span>Раунд {currentRound} из {meta?.rounds || rounds}</span>
          )}
          <ElapsedTimer running={loading} />
          {viewingHistoryId && !loading && (
            <span className="history-badge">Просмотр из истории</span>
          )}
        </section>
      )}

      <DebateMessages messages={messages} loading={loading} messagesEndRef={messagesEndRef} />
      </>) : (
        <>
          <TournamentSetup
            availableAgents={[...availableAgents, ...customAgents.map(a => ({...a, isCustom: true}))]}
            onStart={startTournament}
            loading={tournamentLoading}
          />

          {error && <div className="error">{error}</div>}

          {tournamentRounds.length > 0 && (
            <section className="panel">
              <TournamentBracket
                rounds={tournamentRounds}
                champion={tournamentChampion}
                status={tournamentStatus}
              />
            </section>
          )}

          {tournamentMessages.length > 0 && (
            <section className="messages">
              {tournamentMessages.map((item) => (
                <article
                  key={item.id}
                  className={`message ${item.isJudge ? 'message-judge' : ''}`}
                  style={{ '--accent': item.color } as React.CSSProperties}
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
                    {item.message || <span className="typing-indicator"><span /><span /><span /></span>}
                  </p>
                </article>
              ))}
            </section>
          )}

          <TournamentArchive
            tournaments={tournamentHistory}
            onSelectTournament={openTournamentItem}
          />
        </>
      )}

      <CustomAgentPanel customAgents={customAgents} onRefresh={refreshAgents} stats={customAgentStats} />

      {appMode === 'debate' && (
        <>
          <div className="panel" style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>📂 Импорт дебатов</h3>
                <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                  Загрузите JSON или Markdown файл — дебаты появятся в глобальной памяти и будут использоваться как контекст
                </p>
              </div>
              <label className="secondary" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                📤 Выбрать файл
                <input
                  type="file"
                  accept=".json,.md"
                  multiple
                  onChange={(e) => importDebates(e.target.files)}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          <DebateHistory
            history={history}
            globalHistory={globalHistory}
            viewingHistoryId={viewingHistoryId}
            onSelectHistory={openHistoryItem}
            onClearHistory={handleClearHistory}
          />
        </>
      )}

      {showStatsModal && analytics && (
        <AnalyticsModal analytics={analytics} onClose={() => setShowStatsModal(false)} />
      )}
    </div>
  )
}
