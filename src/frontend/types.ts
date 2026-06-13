export interface Agent {
  id: string
  name: string
  role: string
  color: string
  systemPrompt?: string
  isCustom?: boolean
}

export interface AgentConfig extends Agent {
  model: string
  temperature: number
  provider: string
}

export interface DebateMessage {
  id: string
  agent: string
  role: string
  color: string
  round: number | string
  isJudge: boolean
  message: string
}

export interface DebateMeta {
  topic: string
  rounds: number
  withJudge: boolean
  model: string
}

export interface HistoryEntry {
  id: string
  topic: string
  rounds: number
  withJudge: boolean
  model: string
  status: string
  createdAt: string
  messages: DebateMessage[]
}

export interface GlobalDebateEntry {
  id: string
  topic: string
  createdAt: number
  provider: string
  model: string
  rounds: number
  winner: string | null
}

export interface MemoryStats {
  totalDebates: number
  totalMessages: number
  totalKnowledge: number
}

export interface Analytics {
  totalDebates: number
  totalMessages: number
  totalKnowledge: number
  winRate: Record<string, number>
  agentParticipation: Record<string, { debates: number; messages: number }>
  avgRounds: number
  debatesByProvider: Record<string, number>
  recentActivity: { date: string; count: number }[]
}

export interface ModelPreset {
  id: string
  label: string
  hint: string
}

export interface AgentStats {
  totalAgents: number
  activeAgents: number
}
