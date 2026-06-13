import { useState } from 'react'
import type { Agent, AgentStats } from '../types'

interface CustomAgentPanelProps {
  customAgents: Agent[]
  onRefresh: () => void
  stats: AgentStats | null
}

export function CustomAgentPanel({ customAgents, onRefresh, stats }: CustomAgentPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Agent | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [prompt, setPrompt] = useState('')
  const [color, setColor] = useState('#8b5cf6')
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setEditing(null)
    setName('')
    setRole('')
    setPrompt('')
    setColor('#8b5cf6')
    setShowForm(false)
    setError(null)
  }

  function startEdit(agent: Agent) {
    setEditing(agent)
    setName(agent.name)
    setRole(agent.role)
    setPrompt(agent.systemPrompt || '')
    setColor(agent.color)
    setShowForm(true)
  }

  async function handleSave() {
    if (!name.trim() || !role.trim() || !prompt.trim()) {
      setError('Заполните все поля')
      return
    }

    try {
      const url = editing ? `/api/custom-agents/${editing.id}` : '/api/custom-agents'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, systemPrompt: prompt, color }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка сохранения')
      }
      resetForm()
      onRefresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/custom-agents/${id}`, { method: 'DELETE' })
      onRefresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления')
    }
  }

  return (
    <div className="custom-agents-section">
      <div className="custom-agents-header">
        <h3>🎨 Мои агенты</h3>
        <button type="button" className="link-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Скрыть' : 'Создать агента'}
        </button>
      </div>

      {stats && stats.activeAgents > 0 && (
        <p className="custom-agents-stats">
          Создано: <strong>{stats.activeAgents}</strong>
        </p>
      )}

      {showForm && (
        <div className="custom-agent-form panel">
          <h4>{editing ? 'Редактировать агента' : 'Новый агент'}</h4>
          <label className="label">
            Имя агента
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Капиталист" />
          </label>
          <label className="label">
            Роль / описание
            <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Например: Сторонник свободного рынка" />
          </label>
          <label className="label">
            Системный промт
            <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Опишите поведение агента..." rows={5} />
          </label>
          <label className="setting">
            <span>Цвет аватара</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          {error && <div className="error">{error}</div>}
          <div className="actions">
            <button type="button" className="primary" onClick={handleSave}>{editing ? 'Сохранить' : 'Создать'}</button>
            {editing && <button type="button" className="secondary" onClick={resetForm}>Отмена</button>}
          </div>
        </div>
      )}

      {customAgents.length > 0 && (
        <div className="custom-agents-list">
          {customAgents.map((agent) => (
            <div key={agent.id} className="custom-agent-item">
              <div className="custom-agent-info">
                <span className="avatar" style={{ backgroundColor: agent.color }}>{agent.name[0]}</span>
                <div>
                  <strong>{agent.name}</strong>
                  <p>{agent.role}</p>
                </div>
              </div>
              <div className="custom-agent-actions">
                <button type="button" className="link-btn" onClick={() => startEdit(agent)}>✏️</button>
                <button type="button" className="link-btn danger" onClick={() => handleDelete(agent.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
