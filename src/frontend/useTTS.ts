import { useEffect, useRef, useCallback, useState } from 'react'

interface AgentVoiceConfig {
  rate?: number
  pitch?: number
}

const AGENT_VOICE_MAP: Record<string, AgentVoiceConfig> = {
  philosopher: { rate: 0.9, pitch: 0.9 },
  skeptic: { rate: 1.1, pitch: 1.0 },
  scientist: { rate: 1.0, pitch: 0.95 },
  politician: { rate: 1.05, pitch: 1.05 },
  economist: { rate: 0.95, pitch: 0.9 },
  technooptimist: { rate: 1.15, pitch: 1.1 },
  humanist: { rate: 0.9, pitch: 1.05 },
  kapitalist: { rate: 1.0, pitch: 0.85 },
}

export function useTTS() {
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const voiceIndexRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [piperAvailable, setPiperAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis
      const loadVoices = () => {
        voicesRef.current = synthRef.current!.getVoices()
      }
      loadVoices()
      synthRef.current.addEventListener('voiceschanged', loadVoices)
      return () => {
        synthRef.current?.removeEventListener('voiceschanged', loadVoices)
      }
    }
  }, [])

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => setPiperAvailable(data.piper))
      .catch(() => setPiperAvailable(false))
  }, [])

  const speakPiper = useCallback(async (text: string) => {
    if (!text) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    const response = await fetch(`/api/tts?text=${encodeURIComponent(text)}`)
    if (!response.ok) throw new Error('Piper error')

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioRef.current = audio
    await audio.play()
  }, [])

  const speakWebSpeech = useCallback((text: string, agentId?: string) => {
    if (!synthRef.current || !text) return
    synthRef.current.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ru-RU'

    const config = agentId ? AGENT_VOICE_MAP[agentId] : null
    utterance.rate = config?.rate ?? 1.0
    utterance.pitch = config?.pitch ?? 1.0

    const ruVoices = voicesRef.current.filter(v => v.lang.startsWith('ru'))
    if (ruVoices.length > 0) {
      const idx = voiceIndexRef.current % ruVoices.length
      utterance.voice = ruVoices[idx]
    }

    utterance.onend = () => {
      voiceIndexRef.current++
    }

    synthRef.current.speak(utterance)
  }, [])

  const speak = useCallback(async (text: string, agentId?: string) => {
    if (piperAvailable === true) {
      try {
        await speakPiper(text)
        return
      } catch {
        speakWebSpeech(text, agentId)
      }
    } else {
      speakWebSpeech(text, agentId)
    }
  }, [piperAvailable, speakPiper, speakWebSpeech])

  const stop = useCallback(() => {
    synthRef.current?.cancel()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [])

  return { speak, stop, piperAvailable }
}
