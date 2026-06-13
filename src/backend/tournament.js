import { v4 as uuidv4 } from 'uuid'
import { createDebateSession, streamAgentReply, streamJudgeVerdict } from './debateEngine.js'
import { getAgentByIdWithCustom, resolveModel, getJudgeForProvider } from './llmConfig.js'
import { globalMemory } from './memory/globalMemory.js'

export function createTournamentBracket(agentIds, customAgents = []) {
  const agents = agentIds.map(id => getAgentByIdWithCustom(id, customAgents))

  if (agents.length < 2) {
    throw new Error('Для турнира нужно минимум 2 агента')
  }

  const rounds = []
  let currentPool = agents.map(a => ({ agent: a, fromMatch: null }))

  while (currentPool.length > 1) {
    const matches = []
    const winners = []

    for (let i = 0; i < currentPool.length; i += 2) {
      if (i + 1 < currentPool.length) {
        matches.push({
          id: `match-${rounds.length}-${Math.floor(i / 2)}`,
          agent1: currentPool[i].agent,
          agent2: currentPool[i + 1].agent,
          winner: null,
          verdict: null,
          status: 'pending',
        })
        winners.push({ agent: null, fromMatch: matches[matches.length - 1].id })
      } else {
        winners.push({ agent: currentPool[i].agent, fromMatch: null })
      }
    }

    rounds.push(matches)
    currentPool = winners
  }

  return {
    id: uuidv4(),
    rounds,
    status: 'pending',
    createdAt: Date.now(),
  }
}

export async function runTournamentMatch(client, match, topic, providerName, modelOverride, customAgents = [], onEvent, numRounds = 3) {
  if (!match.agent1 || !match.agent2) {
    if (match.agent1 && !match.agent2) {
      match.winner = match.agent1
      match.status = 'completed'
      return { winner: match.agent1, verdict: 'BYE' }
    }
    return null
  }

  const model = resolveModel(providerName, modelOverride)

  const agent1Config = { ...match.agent1, model, temperature: 0.8 }
  const agent2Config = { ...match.agent2, model, temperature: 0.8 }

  const session = createDebateSession(topic)
  const judge = getJudgeForProvider(providerName, modelOverride)

  onEvent?.({ type: 'match_start', matchId: match.id, agent1: match.agent1.name, agent2: match.agent2.name })

  for (let round = 1; round <= numRounds; round++) {
    onEvent?.({ type: 'round_start', matchId: match.id, round })

    const agentConfigs = [agent1Config, agent2Config]
    for (let agentIdx = 0; agentIdx < agentConfigs.length; agentIdx++) {
      const agent = agentConfigs[agentIdx]
      const side = agentIdx + 1
      const messageId = `${agent.id}-r${round}-${Date.now()}-${Math.random()}`
      onEvent?.({ type: 'agent_start', id: messageId, agent: agent.name, role: agent.role, color: agent.color, round })

      const answer = await streamAgentReply(
        client,
        agent,
        session.topic,
        session.memory,
        (token) => onEvent?.({ type: 'token', id: messageId, text: token }),
        '',
        round,
        side,
      )

      if (!answer) {
        onEvent?.({ type: 'error', message: `Пустой ответ от ${agent.name}` })
        return null
      }

      session.memory.add({ agent: agent.name, role: agent.role, round, text: answer })
      onEvent?.({ type: 'agent_end', id: messageId })
    }

    onEvent?.({ type: 'round_end', round })
  }

  const agentNames = [match.agent1.name, match.agent2.name]
  const verdictMessageId = `judge-${Date.now()}-${Math.random()}`
  onEvent?.({ type: 'agent_start', id: verdictMessageId, agent: judge.name, role: judge.role, color: judge.color, round: 'verdict', isJudge: true })

  const verdict = await streamJudgeVerdict(
    client,
    judge,
    session.topic,
    session.memory,
    (token) => onEvent?.({ type: 'token', id: verdictMessageId, text: token }),
    agentNames,
  )

  onEvent?.({ type: 'agent_end', id: verdictMessageId, verdict })

  let winner = null
  if (verdict) {
    const lowerVerdict = verdict.toLowerCase()
    if (lowerVerdict.includes(match.agent1.name.toLowerCase()) && !lowerVerdict.includes(match.agent2.name.toLowerCase())) {
      winner = match.agent1
    } else if (lowerVerdict.includes(match.agent2.name.toLowerCase()) && !lowerVerdict.includes(match.agent1.name.toLowerCase())) {
      winner = match.agent2
    } else {
      const winnerMatch = verdict.match(/Победитель:\s*(\S+)/i) || verdict.match(/winner:\s*(\S+)/i)
      if (winnerMatch) {
        const name = winnerMatch[1].toLowerCase()
        if (match.agent1.name.toLowerCase().includes(name)) winner = match.agent1
        else if (match.agent2.name.toLowerCase().includes(name)) winner = match.agent2
      }
    }
  }

  if (!winner) {
    winner = Math.random() > 0.5 ? match.agent1 : match.agent2
  }

  match.winner = winner
  match.verdict = verdict
  match.status = 'completed'

  await globalMemory.init()
  const debateId = globalMemory.saveDebate(`Tournament: ${topic}`, providerName, model, numRounds, winner.name)
  for (let r = 1; r <= numRounds; r++) {
    const entries = session.memory.recall().filter(e => e.round === r)
    for (const entry of entries) {
      globalMemory.saveMessage(debateId, entry.agent, entry.role, r, entry.text)
    }
  }

  return { verdict, winner }
}
