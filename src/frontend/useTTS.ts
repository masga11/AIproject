import { useEffect, useRef } from 'react'

export function useTTS() {
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])

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

  function speak(text: string) {
    if (!synthRef.current || !text) return
    synthRef.current.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ru-RU'
    utterance.rate = 1.0
    utterance.pitch = 1.0

    const ruVoice = voicesRef.current.find(v => v.lang.startsWith('ru'))
    if (ruVoice) utterance.voice = ruVoice

    synthRef.current.speak(utterance)
  }

  return { speak }
}
