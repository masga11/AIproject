import { useEffect, useState } from 'react'

interface ElapsedTimerProps {
  running: boolean
}

export function ElapsedTimer({ running }: ElapsedTimerProps) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!running) {
      setSeconds(0)
      return
    }

    const interval = setInterval(() => {
      setSeconds(s => s + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [running])

  if (!running) return null

  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  const display = min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}с`

  return (
    <span className="elapsed-timer">
      ⏱ {display}
    </span>
  )
}
