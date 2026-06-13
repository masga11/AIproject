import type { Analytics } from '../types'

interface AnalyticsModalProps {
  analytics: Analytics
  onClose: () => void
}

export function AnalyticsModal({ analytics, onClose }: AnalyticsModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📊 Расширенная статистика</h2>
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Общая статистика</h3>
            <p><strong>{analytics.totalDebates}</strong> дебатов</p>
            <p><strong>{analytics.totalMessages}</strong> реплик</p>
            <p><strong>{analytics.totalKnowledge}</strong> знаний в памяти</p>
            <p><strong>{analytics.avgRounds}</strong> ср. раундов</p>
          </div>

          <div className="stat-card">
            <h3>Победы по агентам</h3>
            {Object.keys(analytics.winRate).length > 0 ? (
              <div className="win-rate-list">
                {Object.entries(analytics.winRate)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([agent, wins]) => (
                    <div key={agent} className="win-rate-item">
                      <span>{agent}</span>
                      <strong>{wins as number}</strong>
                    </div>
                  ))}
              </div>
            ) : (
              <p>Нет данных о победах</p>
            )}
          </div>

          <div className="stat-card">
            <h3>Дебаты по провайдерам</h3>
            {Object.keys(analytics.debatesByProvider).length > 0 ? (
              <div className="provider-list">
                {Object.entries(analytics.debatesByProvider)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([provider, count]) => (
                    <div key={provider} className="provider-item">
                      <span>{provider === 'ollama' ? '🏠 Ollama' : '☁️ Groq'}</span>
                      <strong>{count as number}</strong>
                    </div>
                  ))}
              </div>
            ) : (
              <p>Нет данных</p>
            )}
          </div>

          <div className="stat-card full-width">
            <h3>Активность за последние 7 дней</h3>
            {analytics.recentActivity.length > 0 ? (
              <div className="activity-chart">
                {analytics.recentActivity.map(({ date, count }) => (
                  <div key={date} className="activity-bar">
                    <span className="date">{date}</span>
                    <div
                      className="bar"
                      style={{ height: `${Math.max(count * 10, 4)}px` }}
                      title={`${count} дебатов`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p>Нет активности</p>
            )}
          </div>

          {analytics.agentParticipation && Object.keys(analytics.agentParticipation).length > 0 && (
            <div className="stat-card full-width">
              <h3>Рейтинг агентов</h3>
              <div className="win-rate-list">
                {Object.entries(analytics.agentParticipation)
                  .sort(([, a], [, b]) => (b as any).messages - (a as any).messages)
                  .map(([name, stats]) => (
                    <div key={name} className="win-rate-item">
                      <span>
                        {name}
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 6 }}>
                          {(stats as any).debates} дебат · {(stats as any).messages} реплик
                        </span>
                      </span>
                      <strong>{analytics.winRate[name] || 0}</strong>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
