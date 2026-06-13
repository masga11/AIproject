import type { GlobalDebateEntry } from './types'

const HISTORY_KEY = 'debate-history-local'
const MAX_HISTORY = 10

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveHistory(entry: Record<string, unknown>) {
  const prev = loadHistory()
  const next = [entry, ...prev].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  return next
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY)
}

export async function loadGlobalHistory(): Promise<GlobalDebateEntry[]> {
  try {
    const res = await fetch('/api/memory/history?limit=50')
    const data = await res.json()
    return data.debates || []
  } catch {
    return []
  }
}

export async function loadTournamentHistory(): Promise<GlobalDebateEntry[]> {
  try {
    const res = await fetch('/api/memory/tournaments?limit=50')
    const data = await res.json()
    return data.tournaments || []
  } catch {
    return []
  }
}

export async function loadGlobalDebate(id: string) {
  try {
    const res = await fetch(`/api/memory/debate/${id}`)
    const data = await res.json()
    return data.debate || null
  } catch {
    return null
  }
}

export async function fetchAgents() {
  const res = await fetch('/api/agents')
  return res.json()
}

export async function fetchMemoryStats() {
  const res = await fetch('/api/memory/stats')
  return res.json()
}

export async function fetchAnalytics() {
  const res = await fetch('/api/memory/analytics')
  return res.json()
}

export async function fetchCustomAgentStats() {
  const res = await fetch('/api/custom-agents/stats')
  return res.json()
}

export async function createCustomAgent(agent: { name: string; role: string; systemPrompt: string; color: string }) {
  const res = await fetch('/api/custom-agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agent),
  })
  return res.json()
}

export async function updateCustomAgent(id: string, agent: { name: string; role: string; systemPrompt: string; color: string }) {
  const res = await fetch(`/api/custom-agents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agent),
  })
  return res.json()
}

export async function deleteCustomAgent(id: string) {
  const res = await fetch(`/api/custom-agents/${id}`, { method: 'DELETE' })
  return res.json()
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '139, 92, 246'
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
}
