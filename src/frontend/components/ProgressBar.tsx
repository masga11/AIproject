interface ProgressBarProps {
  currentRound: number
  totalRounds: number
  loading: boolean
}

export function ProgressBar({ currentRound, totalRounds, loading }: ProgressBarProps) {
  if (!loading || currentRound === 0) return null

  const percent = Math.round((currentRound / totalRounds) * 100)

  return (
    <div className="progress-bar-container">
      <div className="progress-bar-header">
        <span>Дебаты идут...</span>
        <strong>Раунд {currentRound} из {totalRounds}</strong>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
