const AGENT_ICONS: Record<string, string> = {
  philosopher: '🧠',
  skeptic: '🔍',
  scientist: '🔬',
  politician: '🏛️',
  economist: '📊',
  technooptimist: '🚀',
  humanist: '❤️',
  kapitalist: '💰',
  judge: '⚖️',
}

const AGENT_COLORS: Record<string, string> = {
  philosopher: '#818cf8',
  skeptic: '#fb7185',
  scientist: '#34d399',
  politician: '#fbbf24',
  economist: '#60a5fa',
  technooptimist: '#a78bfa',
  humanist: '#f472b6',
  kapitalist: '#22c55e',
  judge: '#fbbf24',
}

export function getAgentIcon(agentId?: string): string {
  if (!agentId) return '💬'
  return AGENT_ICONS[agentId.toLowerCase()] || '💬'
}

export function getAgentColor(agentId?: string, fallback?: string): string {
  if (!agentId) return fallback || '#6366f1'
  return AGENT_COLORS[agentId.toLowerCase()] || fallback || '#6366f1'
}

export function hashStringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 55%)`
}
