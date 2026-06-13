import { useState } from 'react'
import type { Agent } from '../types'

const EXAMPLE_TOPICS = [
  'Искусственный интеллект заменит программистов к 2030 году',
  'Бесплатное образование должно быть правом каждого',
  'Социальные сети приносят больше вреда, чем пользы',
]

interface DebateSettingsProps {
  topic: string
  onTopicChange: (v: string) => void
  rounds: number
  onRoundsChange: (v: number) => void
  withJudge: boolean
  onWithJudgeChange: (v: boolean) => void
  agentCount: number
  onAgentCountChange: (v: number) => void
  selectedAgents: string[]
  onSelectedAgentsChange: (v: string[]) => void
  availableAgents: Agent[]
  model: string
  modelOptions: { id: string; label: string; hint: string }[]
  onModelChange: (v: string) => void
  agentModels: string[]
  onAgentModelsChange: (v: string[]) => void
  agentTemps: number[]
  onAgentTempsChange: (v: number[]) => void
  agentProviders: string[]
  onAgentProvidersChange: (v: string[]) => void
  providerName: string
  loading: boolean
  onStart: () => void
  onStop: () => void
}

export function DebateSettings({
  topic,
  onTopicChange,
  rounds,
  onRoundsChange,
  withJudge,
  onWithJudgeChange,
  agentCount,
  onAgentCountChange,
  selectedAgents,
  onSelectedAgentsChange,
  availableAgents,
  model,
  modelOptions,
  onModelChange,
  agentModels,
  onAgentModelsChange,
  agentTemps,
  onAgentTempsChange,
  agentProviders,
  onAgentProvidersChange,
  providerName,
  loading,
  onStart,
  onStop,
}: DebateSettingsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const RANDOM_TOPICS = [
    'Искусственный интеллект заменит программистов к 2030 году',
    'Бесплатное образование должно быть правом каждого',
    'Социальные сети приносят больше вреда, чем пользы',
    'Космическая колонизация — следующий шаг человечества',
    'Базовый доход нужен каждому',
    'Генная инженерия — этично ли менять человека?',
    'Тотальное наблюдение ценой безопасности',
    'Цифровая грамотность должна быть в школьной программе',
    'Роботы должны платить налоги',
    'Социальные сети разрушают демократию',
    'Ядерная энергетика — решение климатического кризиса',
    'Частная космическая гонка полезна для общества',
  ]

  function pickRandomTopic() {
    const filtered = RANDOM_TOPICS.filter(t => t !== topic)
    const pick = filtered[Math.floor(Math.random() * filtered.length)]
    onTopicChange(pick)
  }

  return (
    <section className="panel">
      <label className="label" htmlFor="topic">Тема дискуссии</label>
      <div className="topic-input-row">
        <input
          id="topic"
          className="input"
          value={topic}
          onChange={(e) => onTopicChange(e.target.value)}
          placeholder="Например: нужен ли универсальный базовый доход?"
          disabled={loading}
          onKeyDown={(e) => { if (e.key === 'Enter') onStart() }}
        />
        <button
          type="button"
          className="random-topic-btn"
          disabled={loading}
          onClick={pickRandomTopic}
          title="Случайная тема"
        >
          🎲
        </button>
      </div>

      <div className="examples">
        {EXAMPLE_TOPICS.map((example) => (
          <button
            key={example}
            type="button"
            className="chip"
            disabled={loading}
            onClick={() => onTopicChange(example)}
          >
            {example}
          </button>
        ))}
      </div>

      <div className="settings">
        <div className="setting">
          <span>Количество агентов</span>
          <div className="agent-count-controls">
            <button
              type="button"
              className="agent-count-btn-round"
              disabled={loading || agentCount <= 2}
              onClick={() => {
                const newCount = agentCount - 1
                onAgentCountChange(newCount)
                onSelectedAgentsChange(selectedAgents.slice(0, newCount))
                onAgentModelsChange(agentModels.slice(0, newCount))
                onAgentTempsChange(agentTemps.slice(0, newCount))
                onAgentProvidersChange(agentProviders.slice(0, newCount))
              }}
            >
              −
            </button>
            <span className="agent-count-value">{agentCount}</span>
            <button
              type="button"
              className="agent-count-btn-round"
              disabled={loading || agentCount >= 5}
              onClick={() => {
                const newCount = agentCount + 1
                onAgentCountChange(newCount)
                const updated = [...selectedAgents]
                while (updated.length < newCount) {
                  const usedIds = new Set(updated)
                  const nextAgent = availableAgents.find(a => !usedIds.has(a.id)) || availableAgents[0]
                  updated.push(nextAgent?.id || 'philosopher')
                }
                onSelectedAgentsChange(updated)
                onAgentModelsChange([...agentModels, ...Array(newCount - agentModels.length).fill('')])
                onAgentTempsChange([...agentTemps, ...Array(newCount - agentTemps.length).fill(0.8)])
                onAgentProvidersChange([...agentProviders, ...Array(newCount - agentProviders.length).fill('')])
              }}
            >
              +
            </button>
          </div>
        </div>

        {availableAgents.length > 0 && selectedAgents.map((agentId, index) => (
          <label key={index} className="setting">
            <span>Агент {index + 1}</span>
            <select
              className="select"
              value={agentId}
              disabled={loading}
              onChange={(e) => {
                const newAgents = [...selectedAgents]
                newAgents[index] = e.target.value
                onSelectedAgentsChange(newAgents)
              }}
            >
              {availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.isCustom ? '🎨 ' : ''}{agent.name} — {agent.role}
                </option>
              ))}
            </select>
          </label>
        ))}

        {modelOptions.length > 0 && (
          <label className="setting">
            <span>Модель (общая)</span>
            <select
              className="select"
              value={model}
              disabled={loading}
              onChange={(e) => onModelChange(e.target.value)}
            >
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <span className="setting-hint">
              {modelOptions.find((option) => option.id === model)?.hint}
            </span>
          </label>
        )}

        <div className="advanced-settings-toggle">
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowAdvanced(!showAdvanced)}
            disabled={loading}
          >
            {showAdvanced ? '▼ Скрыть настройки агентов' : '▶ Настройки агентов (модели, температура)'}
          </button>
        </div>

        {showAdvanced && modelOptions.length > 0 && (
          <AgentAdvancedSettings
            selectedAgents={selectedAgents}
            availableAgents={availableAgents}
            agentModels={agentModels}
            onAgentModelsChange={onAgentModelsChange}
            agentTemps={agentTemps}
            onAgentTempsChange={onAgentTempsChange}
            agentProviders={agentProviders}
            onAgentProvidersChange={onAgentProvidersChange}
            modelOptions={modelOptions}
            model={model}
            providerName={providerName}
            loading={loading}
          />
        )}

        <label className="setting">
          <span>Раундов: <strong>{rounds}</strong></span>
          <input
            type="range"
            min={1}
            max={3}
            value={rounds}
            disabled={loading}
            onChange={(e) => onRoundsChange(Number(e.target.value))}
          />
        </label>

        <label className="setting checkbox">
          <input
            type="checkbox"
            checked={withJudge}
            disabled={loading}
            onChange={(e) => onWithJudgeChange(e.target.checked)}
          />
          <span>Судья в конце</span>
        </label>
      </div>

      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={onStart}
          disabled={loading || !topic.trim()}
        >
          {loading ? 'Идёт дискуссия…' : 'Запустить автономную дискуссию'}
        </button>
        {loading && (
          <button type="button" className="secondary" onClick={onStop}>Стоп</button>
        )}
      </div>
    </section>
  )
}

function AgentAdvancedSettings({
  selectedAgents,
  availableAgents,
  agentModels,
  onAgentModelsChange,
  agentTemps,
  onAgentTempsChange,
  agentProviders,
  onAgentProvidersChange,
  modelOptions,
  model,
  providerName,
  loading,
}: {
  selectedAgents: string[]
  availableAgents: { id: string; name: string; color?: string }[]
  agentModels: string[]
  onAgentModelsChange: (v: string[]) => void
  agentTemps: number[]
  onAgentTempsChange: (v: number[]) => void
  agentProviders: string[]
  onAgentProvidersChange: (v: string[]) => void
  modelOptions: { id: string; label: string }[]
  model: string
  providerName: string
  loading: boolean
}) {
  function hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!result) return '139, 92, 246'
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
  }

  return (
    <div className="agent-specific-settings">
      <h4 style={{ fontSize: '14px', marginBottom: '12px', color: '#9ca3af' }}>Индивидуальные настройки агентов</h4>
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedAgents.length <= 2 ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {selectedAgents.map((agentId, index) => {
          const agent = availableAgents.find(a => a.id === agentId)
          const bgColor = agent?.color || `hsl(${index * 60}, 70%, 20%)`
          return (
            <div key={index} style={{ padding: '12px', background: `rgba(${hexToRgb(bgColor)}, 0.1)`, borderRadius: '8px' }}>
              <h5 style={{ margin: '0 0 12px 0', color: agent?.color || bgColor }}>{agent?.name || `Агент ${index + 1}`}</h5>
              <label className="setting" style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '12px' }}>Провайдер</span>
                <select
                  className="select"
                  value={agentProviders[index] || ''}
                  disabled={loading}
                  onChange={(e) => { const p = [...agentProviders]; p[index] = e.target.value; onAgentProvidersChange(p) }}
                  style={{ fontSize: '12px', padding: '4px' }}
                >
                  <option value="">Как общий ({providerName === 'groq' ? 'Groq' : 'Ollama'})</option>
                  <option value="ollama">Ollama (локально)</option>
                  <option value="groq">Groq (облако)</option>
                </select>
              </label>
              <label className="setting" style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '12px' }}>Модель</span>
                <select
                  className="select"
                  value={agentModels[index] || ''}
                  disabled={loading}
                  onChange={(e) => { const m = [...agentModels]; m[index] = e.target.value; onAgentModelsChange(m) }}
                  style={{ fontSize: '12px', padding: '4px' }}
                >
                  <option value="">Как общая ({modelOptions.find(o => o.id === model)?.label})</option>
                  {modelOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="setting" style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '12px' }}>Температура: {(agentTemps[index] ?? 0.8).toFixed(1)}</span>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.1"
                  value={agentTemps[index] ?? 0.8}
                  disabled={loading}
                  onChange={(e) => { const t = [...agentTemps]; t[index] = parseFloat(e.target.value); onAgentTempsChange(t) }}
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '10px', color: '#9ca3af' }}>
                  {(agentTemps[index] ?? 0.8) < 0.5 ? 'Более точный' : (agentTemps[index] ?? 0.8) > 1 ? 'Очень креативный' : 'Сбалансированный'}
                </span>
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
