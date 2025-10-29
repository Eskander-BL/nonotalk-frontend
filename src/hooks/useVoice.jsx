import { useState, useRef, useCallback, useEffect } from 'react'
import { API_URL } from '../lib/api'

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const silenceTimeoutRef = useRef(null)
  const audioContextRef = useRef(null)
  const activeUtterancesRef = useRef(0)
  const endGraceTimeoutRef = useRef(null)
  const speechRecRef = useRef(null)
  const voicesRef = useRef([])
  const latestPartialRef = useRef('')
  const didSendRef = useRef(false)
  
  // Préchargement et "warmup" des voix TTS du navigateur (réduit la latence du 1er utterance)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const loadVoices = () => {
          const vs = window.speechSynthesis.getVoices()
          if (vs && vs.length) {
            voicesRef.current = vs
            // Warmup: utterance silencieux pour initialiser le moteur TTS
            const u = new SpeechSynthesisUtterance(' ')
            u.lang = 'fr-FR'
            u.volume = 0
            u.rate = 1.0
            u.pitch = 1.0
            try { window.speechSynthesis.speak(u) } catch {}
            setTimeout(() => {
              try { window.speechSynthesis.cancel() } catch {}
            }, 0)
          }
        }
        loadVoices()
        window.speechSynthesis.onvoiceschanged = loadVoices
      }
    } catch {}
  }, [])

  const startRecording = useCallback(async (onTranscriptionComplete) => {
    console.log('[useVoice] startRecording()')
    try {
      // Mode STT ultra faible latence via Web Speech API si disponible
      const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
      if (SpeechRec) {
        const rec = new SpeechRec()
        speechRecRef.current = rec
        rec.lang = 'fr-FR'
        rec.interimResults = true
        rec.continuous = false
        rec.maxAlternatives = 1
        didSendRef.current = false
        latestPartialRef.current = ''

        rec.onstart = () => {
          setIsRecording(true)
        }

        rec.onresult = (event) => {
          try {
            let finalText = ''
            for (let i = 0; i < event.results.length; i++) {
              const res = event.results[i]
              const txt = (res[0] && res[0].transcript) || ''
              if (res.isFinal) {
                finalText += txt
              } else {
                latestPartialRef.current = txt || latestPartialRef.current || ''
              }
            }
            if (finalText) {
              latestPartialRef.current = finalText
            }
          } catch (e) {
            console.warn('[useVoice] SR onresult error', e)
          }
        }

        rec.onerror = (e) => {
          console.warn('[useVoice] SR error', e)
        }
        
        rec.onspeechend = () => {
          // Fin de parole détectée rapidement par l'API
          try {
            window.dispatchEvent(new CustomEvent('voice:speech_end'))
          } catch {}
          const transcript = (latestPartialRef.current || '').trim()
          if (transcript && !didSendRef.current) {
            didSendRef.current = true
            try {
              window.dispatchEvent(new CustomEvent('voice:transcription', { detail: { transcript } }))
            } catch {}
            if (onTranscriptionComplete) {
              setTimeout(() => onTranscriptionComplete(transcript), 0)
            }
          }
          try { rec.stop() } catch {}
        }

        rec.onend = () => {
          setIsRecording(false)
          if (!didSendRef.current) {
            const transcript = (latestPartialRef.current || '').trim()
            if (transcript) {
              didSendRef.current = true
              try {
                window.dispatchEvent(new CustomEvent('voice:transcription', { detail: { transcript } }))
              } catch {}
              if (onTranscriptionComplete) {
                setTimeout(() => onTranscriptionComplete(transcript), 0)
              }
            }
          }
          speechRecRef.current = null
        }

        rec.start()
        // On utilise le mode SR natif: on ne continue pas avec getUserMedia + MediaRecorder
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1
        }
      })
      // Choisir un mimeType compatible (Safari iOS supporte parfois audio/mp4, Chrome audio/webm;codecs=opus)
      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4'
      ]
      let chosenType = ''
      if (typeof window !== 'undefined' && window.MediaRecorder && typeof MediaRecorder.isTypeSupported === 'function') {
        for (const t of preferredTypes) {
          if (MediaRecorder.isTypeSupported(t)) { chosenType = t; break }
        }
      }
      const mediaRecorder = chosenType ? new MediaRecorder(stream, { mimeType: chosenType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      // Créer un contexte audio pour détecter le silence
      const AudioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null
      const audioContext = AudioCtx ? new AudioCtx() : new (window.AudioContext)()
      try { await audioContext.resume?.() } catch {}
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let lastSoundTime = Date.now()
      const SILENCE_THRESHOLD = 30
      const SILENCE_DURATION = 1000 // ~1.0s de silence (coupure plus réactive)
      let isCheckingActive = true

      const checkSilence = () => {
        if (!isCheckingActive || !mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
          return
        }

        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length

        if (average > SILENCE_THRESHOLD) {
          lastSoundTime = Date.now()
        } else if (Date.now() - lastSoundTime > SILENCE_DURATION) {
          // Silence détecté pendant ~1.0s, arrêt enregistrement
          console.log('[useVoice] Silence détecté (>1.0s), arrêt enregistrement')
          isCheckingActive = false
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
          }
          return
        }

        requestAnimationFrame(checkSilence)
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        isCheckingActive = false
        setIsRecording(false)
        console.log('[useVoice] onstop: chunks=', audioChunksRef.current.length)

        // Évènement immédiat à la fin de la parole pour déclencher une réponse vocale instantanée
        try {
          window.dispatchEvent(new CustomEvent('voice:speech_end'))
        } catch {}

        const currentType = (mediaRecorderRef.current && mediaRecorderRef.current.mimeType) || 'audio/webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: currentType })
        console.log('[useVoice] audioBlob size=', audioBlob.size)
        const transcript = await transcribeAudio(audioBlob)
        console.log('[useVoice] Transcription reçue:', transcript)
        
        if (transcript) {
          try {
            window.dispatchEvent(new CustomEvent('voice:transcription', { detail: { transcript } }))
            console.log('[useVoice] Event voice:transcription dispatché')
          } catch (e) {
            console.warn('[useVoice] Erreur lors du dispatch de l\'event:', e)
          }
        }

        if (transcript && onTranscriptionComplete) {
          console.log('[useVoice] Appel du callback onTranscriptionComplete')
          // Décaler l'appel pour sortir du cycle onstop (évite d'éventuelles contraintes de timing)
          setTimeout(() => onTranscriptionComplete(transcript), 0)
        }
        
        // Nettoyer les ressources
        stream.getTracks().forEach(track => track.stop())
        if (audioContextRef.current) {
          audioContextRef.current.close()
          audioContextRef.current = null
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      
      // Démarrer immédiatement la détection de silence
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        requestAnimationFrame(checkSilence)
      }
      
    } catch (error) {
      console.error('Erreur lors du démarrage de l\'enregistrement:', error)
      alert('Impossible d\'accéder au microphone. Veuillez autoriser l\'accès.')
    }
  }, [])

  const stopRecording = useCallback(() => {
    // Si la Web Speech API est active, arrêter proprement
    if (speechRecRef.current && isRecording) {
      try {
        speechRecRef.current.stop()
      } catch {}
      setIsRecording(false)
      return
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
    }
  }, [isRecording])

  const transcribeAudio = async (audioBlob) => {
    try {
      const formData = new FormData()
      const ext = audioBlob?.type?.includes('mp4') ? 'mp4' : (audioBlob?.type?.includes('webm') ? 'webm' : 'wav')
      formData.append('audio', audioBlob, `recording.${ext}`)

      console.log('[useVoice] POST /api/speech-to-text ...')
      const response = await fetch(`${API_URL}/speech-to-text`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        console.log('[useVoice] STT OK')
        return data.transcript
      } else {
        const errText = await response.text().catch(() => '')
        console.error('[useVoice] Erreur transcription HTTP', response.status, errText)
        return null
      }
    } catch (error) {
      console.error('[useVoice] Exception transcription:', error)
      return null
    }
  }

  const playAudio = useCallback(async (text) => {
    try {
      // Annuler un éventuel timer de fin gracieuse si une nouvelle phrase arrive
      if (endGraceTimeoutRef.current) {
        clearTimeout(endGraceTimeoutRef.current)
        endGraceTimeoutRef.current = null
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'fr-FR'
      utterance.rate = 0.9
      // Choisir une voix FR si disponible pour éviter le délai de sélection implicite
      try {
        const list = (typeof window !== 'undefined' && window.speechSynthesis?.getVoices?.()) || voicesRef.current || []
        const frVoice = Array.isArray(list) ? (list.find(v => /fr/i.test(v.lang)) || list.find(v => /fr|french/i.test(v.name)) || list[0]) : null
        if (frVoice) utterance.voice = frVoice
      } catch {}

      utterance.onstart = () => {
        activeUtterancesRef.current += 1
        setIsPlaying(true)
      }
      const handleDone = () => {
        activeUtterancesRef.current = Math.max(0, activeUtterancesRef.current - 1)
        // Laisser une petite marge pour enchaîner la prochaine phrase sans couper la vidéo
        if (activeUtterancesRef.current === 0) {
          endGraceTimeoutRef.current = setTimeout(() => {
            if (activeUtterancesRef.current === 0) {
              setIsPlaying(false)
            }
          }, 200)
        }
      }
      utterance.onend = handleDone
      utterance.onerror = handleDone

      speechSynthesis.speak(utterance)
    } catch (error) {
      console.error('Erreur lors de la lecture audio:', error)
      setIsPlaying(false)
    }
  }, [])

  const stopAudio = useCallback(() => {
    try {
      speechSynthesis.cancel()
    } catch {}
    activeUtterancesRef.current = 0
    if (endGraceTimeoutRef.current) {
      clearTimeout(endGraceTimeoutRef.current)
      endGraceTimeoutRef.current = null
    }
    setIsPlaying(false)
  }, [])

  return {
    isRecording,
    isPlaying,
    startRecording,
    stopRecording,
    transcribeAudio,
    playAudio,
    stopAudio
  }
}
