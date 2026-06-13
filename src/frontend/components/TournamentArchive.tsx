import type { GlobalDebateEntry } from '../types'
import { loadGlobalDebate } from '../api'
import { formatDate } from '../api'

interface TournamentArchiveProps {
  tournaments: GlobalDebateEntry[]
  onSelectTournament: (tournament: GlobalDebateEntry) => void
}

export function TournamentArchive({ tournaments, onSelectTournament }: TournamentArchiveProps) {
  if (tournaments.length === 0) return null

  return (
    <section className="panel" style={{ marginTop: '16px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>🏆 Архив турниров</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tournaments.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'rgba(251, 191, 36, 0.08)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onClick={() => onSelectTournament(t)}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(251, 191, 36, 0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(251, 191, 36, 0.08)')}
          >
            <div>
              <strong style={{ fontSize: '0.95rem' }}>{t.topic}</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                {formatDate(t.createdAt)} · Победитель: {t.winner || '—'}
              </p>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#fbbf24' }}>▶ Replay</span>
          </div>
        ))}
      </div>
    </section>
  )
}
