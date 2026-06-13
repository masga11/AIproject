import { useState } from 'react'
import type { Agent } from '../types'

interface TournamentSetupProps {
  availableAgents: Agent[]
  onStart: (agents: string[], topic: string) => void
  loading: boolean
}

const TOURNAMENT_TOPICS = [
  'Искусственный интеллект заменит программистов к 2030 году',
  'Бесплатное образование должно быть правом каждого',
  'Социальные сети приносят больше вреда, чем пользы',
  'Космическая колонизация — следующий шаг человечества',
  'Генная инженерия — этично ли менять человека?',
  'Роботы должны платить налоги',
]

export function TournamentSetup({ availableAgents, onStart, loading }: TournamentSetupProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [topic, setTopic] = useState('')

  function toggle(id: string) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  function handleStart() {
    if (selected.length >= 2 && topic.trim()) {
      onStart(selected, topic.trim())
    }
  }

  return (
    <section className="panel tournament-setup">
      <h2 style={{ margin: '0 0 16px', fontSize: '1.3rem' }}>🏆 Турнир</h2>
      <p style={{ margin: '0 0 20px', color: '#94a3b8', fontSize: '0.95rem' }}>
        Выберите агентов для турнира. Они будут спорить в парах, победители проходят дальше.
      </p>

      <label className="label">Агенты (минимум 2)</label>
      <div className="tournament-agent-grid">
        {availableAgents.map(agent => (
          <button
            key={agent.id}
            type="button"
            className={`tournament-agent-chip ${selected.includes(agent.id) ? 'selected' : ''}`}
            onClick={() => toggle(agent.id)}
            disabled={loading}
            style={{ '--chip-color': agent.color } as React.CSSProperties}
          >
            <span className="avatar" style={{ backgroundColor: agent.color, width: 28, height: 28, fontSize: '0.75rem' }}>
              {agent.name[0]}
            </span>
            {agent.name}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <p style={{ margin: '8px 0 16px', color: '#a5b4fc', fontSize: '0.85rem' }}>
          Выбрано: {selected.length} агент{selected.length === 2 ? 'а' : selected.length < 5 ? 'а' : 'ов'}
        </p>
      )}

      <label className="label">Тема турнира</label>
      <div className="topic-input-row">
        <input
          className="input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Например: ИИ заменит программистов?"
          disabled={loading}
        />
        <button
          type="button"
          className="random-topic-btn"
          disabled={loading}
          onClick={() => {
            const filtered = TOURNAMENT_TOPICS.filter(t => t !== topic)
            setTopic(filtered[Math.floor(Math.random() * filtered.length)])
          }}
          title="Случайная тема"
        >
          🎲
        </button>
      </div>

      <div style={{ marginTop: '16px' }}>
        <button
          type="button"
          className="primary"
          onClick={handleStart}
          disabled={loading || selected.length < 2 || !topic.trim()}
        >
          {loading ? 'Турнир идёт...' : `🏆 Начать турнир (${selected.length} агентов)`}
        </button>
      </div>
    </section>
  )
}
