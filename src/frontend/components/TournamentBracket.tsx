import type { Agent } from '../types'

interface Match {
  id: string
  agent1: Agent | null
  agent2: Agent | null
  winner: Agent | null
  verdict?: string
  status: string
}

interface TournamentBracketProps {
  rounds: Match[][]
  champion: string | null
  status: string
}

export function TournamentBracket({ rounds, champion, status }: TournamentBracketProps) {
  return (
    <div className="tournament-bracket">
      {champion && (
        <div className="tournament-champion">
          <span className="champion-crown">👑</span>
          <h3>Чемпион</h3>
          <p className="champion-name">{champion}</p>
        </div>
      )}

      <div className="bracket-rounds">
        {rounds.map((round, ri) => (
          <div key={ri} className="bracket-round">
            <div className="bracket-round-title">
              {ri === rounds.length - 1 ? 'Финал' : `Раунд ${ri + 1}`}
            </div>
            <div className="bracket-matches">
              {round.map((match) => (
                <BracketMatch key={match.id} match={match} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BracketMatch({ match }: { match: Match }) {
  const isBye = match.status === 'bye'
  const isRunning = match.status === 'running'
  const isCompleted = match.status === 'completed'

  return (
    <div className={`bracket-match ${isCompleted ? 'completed' : ''} ${isRunning ? 'running' : ''}`}>
      <div className={`bracket-agent ${match.winner?.id === match.agent1?.id ? 'won' : ''}`}>
        <span className="avatar" style={{ backgroundColor: match.agent1?.color || '#6b7280', width: 24, height: 24, fontSize: '0.65rem' }}>
          {match.agent1?.name[0] || '?'}
        </span>
        <span className="bracket-agent-name">{match.agent1?.name || 'TBD'}</span>
        {match.winner?.id === match.agent1?.id && <span className="bracket-winner-badge">✓</span>}
      </div>
      <div className="bracket-vs">vs</div>
      <div className={`bracket-agent ${match.winner?.id === match.agent2?.id ? 'won' : ''}`}>
        <span className="avatar" style={{ backgroundColor: match.agent2?.color || '#6b7280', width: 24, height: 24, fontSize: '0.65rem' }}>
          {match.agent2?.name[0] || '?'}
        </span>
        <span className="bracket-agent-name">{match.agent2?.name || 'TBD'}</span>
        {match.winner?.id === match.agent2?.id && <span className="bracket-winner-badge">✓</span>}
      </div>
      {isBye && <div className="bracket-bye">BYE</div>}
      {isRunning && <div className="bracket-running-indicator"><span /><span /><span /></div>}
    </div>
  )
}
