import type { DebateMessage } from '../types'
import { useTTS } from '../useTTS'
import { getAgentIcon } from '../agentUtils'

interface DebateMessagesProps {
  messages: DebateMessage[]
  loading: boolean
  messagesEndRef: React.RefObject<HTMLDivElement | null>
}

export function DebateMessages({ messages, loading, messagesEndRef }: DebateMessagesProps) {
  const { speak } = useTTS()

  return (
    <section className="messages">
      {messages.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <h3>Готовы к дебатам?</h3>
          <p>Введите тему, выберите агентов и нажмите «Запустить». Агенты начнут дискуссию в реальном времени.</p>
        </div>
      )}

      {messages.map((item) => (
        <article
          key={item.id}
          className={`message ${item.isJudge ? 'message-judge' : ''}`}
          style={{ '--accent': item.color } as React.CSSProperties}
        >
          <div className="message-head">
            <span className="avatar avatar-emoji">{getAgentIcon(item.id?.split('-')[0])}</span>
            <div>
              <strong>{item.agent}</strong>
              <p>{item.role}</p>
            </div>
            <span className="round-badge">
              {item.isJudge ? 'Вердикт' : `Раунд ${item.round} · ${item.side || ''}`}
            </span>
            <button
              type="button"
              className="tts-btn"
              onClick={() => speak(item.message, item.id?.split('-')[0])}
              title="Озвучить реплику"
            >
              🔊
            </button>
          </div>
          <p className="message-body">
            {item.message || (loading ? <TypingIndicator /> : '')}
          </p>
        </article>
      ))}
      <div ref={messagesEndRef} />
    </section>
  )
}

function TypingIndicator() {
  return (
    <span className="typing-indicator">
      <span />
      <span />
      <span />
    </span>
  )
}
