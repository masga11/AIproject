import type { HistoryEntry, GlobalDebateEntry } from '../types'
import { formatDate } from '../api'

interface DebateHistoryProps {
  history: HistoryEntry[]
  globalHistory: GlobalDebateEntry[]
  viewingHistoryId: string | null
  onSelectHistory: (item: HistoryEntry | GlobalDebateEntry) => void
  onClearHistory: () => void
}

export function DebateHistory({
  history,
  globalHistory,
  viewingHistoryId,
  onSelectHistory,
  onClearHistory,
}: DebateHistoryProps) {
  return (
    <>
      {history.length > 0 && (
        <section className="history panel">
          <div className="history-head">
            <h2>Локальная история</h2>
            <button type="button" className="link-btn" onClick={onClearHistory}>Очистить</button>
          </div>
          <div className="history-list">
            {history.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`history-item ${viewingHistoryId === item.id ? 'active' : ''}`}
                onClick={() => onSelectHistory(item)}
              >
                <strong>{item.topic}</strong>
                <span>
                  {formatDate(item.createdAt)} · {item.messages.length} реплик
                  {item.status === 'stopped' ? ' · прерван' : ''}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {globalHistory.length > 0 && (
        <section className="history panel">
          <div className="history-head">
            <h2>🌍 Глобальная память</h2>
            <span className="memory-badge">{globalHistory.length} дебатов</span>
          </div>
          <div className="history-list">
            {globalHistory.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`history-item ${viewingHistoryId === item.id ? 'active' : ''}`}
                onClick={() => onSelectHistory(item)}
              >
                <strong>{item.topic}</strong>
                <span>
                  {new Date(item.createdAt).toLocaleDateString('ru-RU')} · {item.provider}/{item.model}
                  {item.winner ? ` · Победитель: ${item.winner}` : ''}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
