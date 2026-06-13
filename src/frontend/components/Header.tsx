import type { MemoryStats } from '../types'

interface HeaderProps {
  memoryStats: MemoryStats | null
  onShowStats: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

export function Header({ memoryStats, onShowStats, theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="header">
      <button
        type="button"
        className="theme-toggle"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <div>
        <p className="eyebrow">Автономные ИИ-дебаты</p>
        <h1>AI Debate Arena</h1>
        <p className="subtitle">
          Два агента спорят в несколько раундов, судья подводит итог.
        </p>
        {memoryStats && (
          <p className="memory-stats">
            🧠 Глобальная память: <strong>{memoryStats.totalDebates}</strong> дебатов,{' '}
            <strong>{memoryStats.totalMessages}</strong> реплик,{' '}
            <strong>{memoryStats.totalKnowledge}</strong> знаний
            {' '}<button type="button" className="link-btn" onClick={onShowStats}>📊 Подробнее</button>
          </p>
        )}
      </div>
    </header>
  )
}
