import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
  Menu, 
  Mic, 
  MicOff, 
  LogOut, 
  User, 
  MessageSquare,
  AlertTriangle,
  Phone,
  Heart,
  Volume2,
  VolumeX
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useVoice } from '../hooks/useVoice'
import aiAvatarImage from '../assets/ai-avatar.png'
import nonoVideo from '../assets/NonoVideo.mp4'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import './ChatPage.css'
import { useIsMobile } from '../hooks/use-mobile'
import { API_URL } from '../lib/api'

export default function ChatPage() {
  const { user, logout, updateUser } = useAuth()
  const isMobile = useIsMobile()
  const { isRecording, isPlaying, startRecording, stopRecording, playAudio, stopAudio } = useVoice()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [currentConversation, setCurrentConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [showSidebar, setShowSidebar] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 768 : false))
  const [crisisAlert, setCrisisAlert] = useState(null)
  const [quotaWarning, setQuotaWarning] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  
  // Fonctions de gestion de la déconnexion
  const cancelLogout = () => {
    setShowLogoutConfirm(false)
  }

  const confirmLogout = async () => {
    setShowLogoutConfirm(false)
    await logout()
    navigate('/login')
  }

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true)
  }

  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const lastTranscriptRef = useRef(null)
  const historyRef = useRef(null)
  const videoRef = useRef(null)
  const lastMicEndRef = useRef(0)

  useEffect(() => {
    initializeApp()
  }, [])

  // Définir l'état initial de la sidebar selon le device
  useEffect(() => {
    if (isMobile !== undefined) {
      setShowSidebar(!isMobile)
    }
  }, [isMobile])

  // Filet de sécurité: écouter l'évènement global dispatché par useVoice()
  useEffect(() => {
    const onTranscription = async (e) => {
      try {
        const t = e?.detail?.transcript
        console.log('[ChatPage] Event voice:transcription reçu:', t)
        const clean = typeof t === 'string' ? t.trim() : ''
        if (!clean) {
          console.warn('[ChatPage] Transcript (event) vide/falsy, envoi annulé')
          return
        }
        if (clean === lastTranscriptRef.current) {
          console.warn('[ChatPage] Transcript dupliqué (event), envoi annulé')
          return
        }
        lastTranscriptRef.current = clean

        // S'assurer d'avoir un convId
        let targetConvId = currentConversation?.id
        if (!targetConvId) {
          const conv = await createMainConversation()
          targetConvId = conv?.id
        }
        if (!targetConvId) {
          console.error('[ChatPage] Impossible de déterminer une conversation id (event)')
          return
        }

        await sendMessageStream(clean, null, targetConvId)
      } catch (err) {
        console.error('[ChatPage] Erreur handler event voice:transcription:', err)
      }
    }

    window.addEventListener('voice:transcription', onTranscription)
    return () => window.removeEventListener('voice:transcription', onTranscription)
  }, [currentConversation])

  // Auto scroll en bas de l'historique quand de nouveaux messages arrivent
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight
    }
  }, [messages, showSidebar])

  // Contrôle lecture vidéo avatar selon isPlaying
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    try {
      if (isPlaying) {
        v.currentTime = 0
        const playPromise = v.play?.()
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise.catch(() => {})
        }
      } else {
        v.pause?.()
        v.currentTime = 0
      }
    } catch {}
  }, [isPlaying])

  // Enregistrer l'instant de fin de parole pour temporiser le démarrage du TTS (250–500ms après fermeture micro)
  useEffect(() => {
    const onSpeechEnd = () => { lastMicEndRef.current = Date.now() }
    window.addEventListener('voice:speech_end', onSpeechEnd)
    return () => window.removeEventListener('voice:speech_end', onSpeechEnd)
  }, [])


  const initializeApp = async () => {
    await checkQuota()
    // Charger les conversations existantes (et leurs 10 derniers messages)
    await loadConversations()
  }

  const checkQuota = async () => {
    try {
      const response = await fetch(`${API_URL}/auth/check-quota`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.quota_remaining <= 2) {
          setQuotaWarning(true)
        }
      }
    } catch (error) {
      console.error('Erreur lors de la vérification du quota:', error)
    }
  }

  const loadConversations = async () => {
    try {
      const response = await fetch(`${API_URL}/chat/conversations`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setConversations(data.conversations)
        // Mettre en cache local les 10 dernières conversations
        try {
          localStorage.setItem('recentConversations', JSON.stringify(data.conversations.slice(0, 10)))
        } catch (e) {
          console.warn('Impossible d\'enregistrer le cache conversations:', e)
        }
        
        // Charger la première conversation ou en créer une nouvelle
        if (data.conversations.length > 0) {
          selectConversation(data.conversations[0])
        } else {
          await createMainConversation()
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement des conversations:', error)
      // Fallback offline: essayer le cache local des conversations + messages
      try {
        const cached = localStorage.getItem('recentConversations')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setConversations(parsed)
            // sélectionner la première pour charger ses messages en cache
            selectConversation(parsed[0])
          }
        }
      } catch (e) {
        console.warn('Impossible de lire le cache conversations:', e)
      }
    }
  }

  const createMainConversation = async () => {
    try {
      const response = await fetch(`${API_URL}/chat/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ title: 'Conversation avec Nono' }),
      })
      
      if (response.ok) {
        const data = await response.json()
        setCurrentConversation(data.conversation)
        setConversations([data.conversation])
        setMessages([])
        return data.conversation
      }
    } catch (error) {
      console.error('Erreur lors de la création de la conversation:', error)
    }
  }

  const selectConversation = async (conversation) => {
    setCurrentConversation(conversation)

    // Pré-remplir avec le cache local si disponible
    try {
      const cacheKey = `recentMessages:${conversation.id}`
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed)) {
          setMessages(parsed)
        }
      }
    } catch (e) {
      console.warn('Cache messages invalide:', e)
    }
    
    try {
      const response = await fetch(`${API_URL}/chat/conversations/${conversation.id}/messages?limit=10`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages)
        // Mettre en cache local les 10 derniers messages
        try {
          localStorage.setItem(`recentMessages:${conversation.id}`, JSON.stringify(data.messages.slice(-10)))
        } catch (e) {
          console.warn('Impossible d\'enregistrer le cache messages:', e)
        }
        // Ouvrir l’historique sur desktop, fermé par défaut sur mobile
        if (isMobile !== undefined) {
          setShowSidebar(!isMobile)
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement des messages:', error)
    }
  }

  const sendMessage = async (messageContent, emotion = null, conversationIdOverride = null) => {
    const convId = conversationIdOverride ?? currentConversation?.id
    console.log('[ChatPage] sendMessage called:', { messageContent, hasConversation: !!convId })
    if (!messageContent.trim() || !convId) return null

    setIsLoading(true)

    try {
      console.log('[ChatPage] POST /api/chat/conversations/' + convId + '/send')
      const response = await fetch(`${API_URL}/chat/conversations/${convId}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          message: messageContent,
          emotion: emotion 
        }),
      })

      const data = await response.json()

      if (response.ok) {
        if (data.crisis_detected) {
          setCrisisAlert(data.emergency_message)
        } else {
          // Ajouter les messages à la conversation + MAJ cache local
          setMessages(prev => {
            const next = [...prev, data.user_message, data.ai_message]
            try {
              localStorage.setItem(`recentMessages:${convId}`, JSON.stringify(next.slice(-10)))
            } catch (e) {
              console.warn('Impossible d\'enregistrer le cache messages:', e)
            }
            return next
          })
          
          // Mettre à jour le quota utilisateur
          if (user) {
            updateUser({ ...user, quota_remaining: data.quota_remaining })
            console.log('[ChatPage] Quota restant:', data.quota_remaining)
          }

          return data
        }
      } else if (response.status === 403) {
        console.warn('[ChatPage] Quota épuisé (403)')
        setQuotaWarning(true)
      } else if (response.status === 401) {
        console.warn('[ChatPage] Non connecté (401), redirection vers /login')
        navigate('/login')
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message:', error)
    } finally {
      setIsLoading(false)
    }
    
    return null
  }

  // Streaming: déclencher TTS sur la première phrase (0.25–0.5s après fin micro), puis lire le reste à la fin
  const sendMessageStream = async (messageContent, emotion = null, conversationIdOverride = null) => {
    const convId = conversationIdOverride ?? currentConversation?.id
    if (!messageContent?.trim() || !convId) return null

    setIsLoading(true)
    try {
      const streamUrl = `${API_URL}/chat/conversations/${convId}/send-stream`

      const res = await fetch(streamUrl, {
        method: 'POST',
        mode: 'cors',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        },
        credentials: 'include',
        body: JSON.stringify({ message: messageContent, emotion })
      })

      if (!res.ok || !res.body) {
        console.warn('[ChatPage] Streaming non dispo, fallback sendMessage')
        return await sendMessage(messageContent, emotion, convId)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let fullText = ''
      let firstSentenceSpoken = false
      let firstSentenceLength = 0
      let fallbackTimer = null
      let lastSpokenIndex = 0
      // Démarrage dès arrivée du premier token (pas d'attente forcée)
      const makeSnippet = (txt) => {
        const t = (txt || '').trim()
        if (t.length <= 0) return ''
        // Prendre 80 premiers chars max, couper proprement sur espace/ponctuation si possible
        const cutMax = 80
        const slice = t.slice(0, cutMax)
        const punctIdx = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'), slice.lastIndexOf('…'), slice.lastIndexOf(','))
        const spaceIdx = slice.lastIndexOf(' ')
        const cutIdx = punctIdx >= 10 ? punctIdx + 1 : (spaceIdx >= 10 ? spaceIdx : slice.length)
        return slice.slice(0, cutIdx).trim()
      }
      const trySpeakImmediateFirst = () => {
        if (firstSentenceSpoken) return
        if (fullText.trim().length < 8) return
        const snippet = makeSnippet(fullText)
        if (snippet && snippet.length > 0) {
          speakText(snippet)
          firstSentenceSpoken = true
          firstSentenceLength = snippet.length
          lastSpokenIndex = snippet.length
        }
      }

      const sentenceRegex = /[^.!?…]+[.!?…](?:\s|$)/g

      const trySpeakNewSentences = () => {
        const text = fullText
        sentenceRegex.lastIndex = lastSpokenIndex
        let match
        while ((match = sentenceRegex.exec(text))) {
          const raw = match[0]
          const sentence = raw.trim()
          const endIdx = match.index + raw.length
          if (endIdx <= lastSpokenIndex) continue

          if (!firstSentenceSpoken) {
            firstSentenceLength = endIdx
            speakText(sentence)
            firstSentenceSpoken = true
            if (fallbackTimer) {
              clearTimeout(fallbackTimer)
              fallbackTimer = null
            }
          } else {
            speakText(sentence)
          }
          lastSpokenIndex = endIdx
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        sseBuffer += chunk

        const events = sseBuffer.split('\n\n')
        sseBuffer = events.pop() || ''
        for (const evt of events) {
          const line = evt.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          let data
          try {
            data = JSON.parse(payload)
          } catch {
            continue
          }

          if (data.type === 'delta' && data.content) {
            fullText += data.content
            trySpeakImmediateFirst()
            trySpeakNewSentences()
          } else if (data.type === 'done') {
            if (fallbackTimer) {
              clearTimeout(fallbackTimer)
              fallbackTimer = null
            }
            // MAJ UI + quota
            try {
              setMessages(prev => {
                const next = [...prev, data.user_message, data.ai_message]
                try {
                  localStorage.setItem(`recentMessages:${convId}`, JSON.stringify(next.slice(-10)))
                } catch {}
                return next
              })
              if (user) updateUser({ ...user, quota_remaining: data.quota_remaining })
            } catch (e) {
              console.warn('[ChatPage] MAJ UI post-stream échouée', e)
            }

            // Lire le reste du texte non encore joué
            const remaining = fullText.slice(lastSpokenIndex).trim()
            if (remaining) {
              speakText(remaining)
              lastSpokenIndex = fullText.length
            }
          }
        }
      }
    } catch (e) {
      console.error('[ChatPage] Erreur streaming:', e)
      return await sendMessage(messageContent, emotion, conversationIdOverride)
    } finally {
      setIsLoading(false)
    }
    return null
  }

  const speakText = async (text) => {
    await playAudio(text)
  }

  const handleVoiceRecording = async () => {
    if (isLoading) return
    if (isRecording) {
      stopRecording()
    } else {
      // Créer la conversation principale si nécessaire
      let convId = currentConversation?.id
      if (!convId) {
        const conv = await createMainConversation()
        convId = conv?.id
      }
      
      // Démarrer l'enregistrement avec callback pour traiter le transcript
      console.log('[ChatPage] Appel startRecording avec callback')
      await startRecording(async (transcript) => {
        try {
          console.log('[ChatPage] Transcript reçu:', transcript, 'type=', typeof transcript, 'len=', (transcript || '').length)
          const cleanTranscript = typeof transcript === 'string' ? transcript.trim() : ''
          if (cleanTranscript === lastTranscriptRef.current) {
            console.warn('[ChatPage] Transcript dupliqué (callback), envoi annulé')
            return
          }
          lastTranscriptRef.current = cleanTranscript

          if (cleanTranscript) {
            // Envoyer automatiquement le message transcrit
            console.log('[ChatPage] Envoi transcript au backend via sendMessage...')
            let targetConvId = convId ?? currentConversation?.id
            if (!targetConvId) {
              const conv = await createMainConversation()
              targetConvId = conv?.id
            }
            if (!targetConvId) {
              console.error('[ChatPage] Impossible de déterminer une conversation id')
              return
            }
            await sendMessageStream(cleanTranscript, null, targetConvId)
          } else {
            console.warn('[ChatPage] Transcript vide/falsy, envoi annulé')
          }
        } catch (err) {
          console.error('[ChatPage] Erreur dans le callback startRecording:', err)
        }
      })
    }
  }

  const handleImageUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    // S'assurer qu'une conversation existe (création lazy si nécessaire)
    let convId = currentConversation?.id
    if (!convId) {
      const conv = await createMainConversation()
      convId = conv?.id
      if (!convId) {
        console.error('[ChatPage] Impossible de déterminer une conversation id pour upload image')
        return
      }
    }

    const formData = new FormData()
    formData.append('image', file)

    setIsLoading(true)

    try {
      const response = await fetch(`${API_URL}/chat/conversations/${convId}/upload-image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      const data = await response.json()

      if (response.ok) {
        setMessages(prev => {
          const next = [...prev, data.image_message, data.ai_message]
          try {
            localStorage.setItem(`recentMessages:${convId}`, JSON.stringify(next.slice(-10)))
          } catch (e) {
            console.warn('Impossible d\'enregistrer le cache messages:', e)
          }
          return next
        })
        
        if (user) {
          updateUser({ ...user, quota_remaining: data.quota_remaining })
        }

        speakText(data.ai_message.content)
      }
    } catch (error) {
      console.error('Erreur lors de l\'upload d\'image:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const acknowledgeCrisis = async () => {
    try {
      await fetch(`${API_URL}/chat/crisis/acknowledge`, {
        method: 'POST',
        credentials: 'include'
      })
      setCrisisAlert(null)
    } catch (error) {
      console.error('Erreur lors de l\'acknowledgement de crise:', error)
    }
  }

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const inviteFriend = async (e) => {
    e?.preventDefault?.()
    if (!inviteEmail) return
    setInviteLoading(true)
    setInviteError('')
    setInviteSuccess('')
    try {
      const res = await fetch(`${API_URL}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail, invited_by: user?.username })
      })
      const data = await res.json()
      if (res.ok) {
        setInviteSuccess("🎉 Invitation envoyée ! Tu recevras +5 échanges dès que ton ami créera un compte.")
        setInviteEmail('')
      } else {
        setInviteError(data?.error || 'Une erreur est survenue')
      }
    } catch (err) {
      setInviteError('Erreur réseau. Réessaie.')
    } finally {
      setInviteLoading(false)
    }
  }

  const showInviteButton = (user?.quota_remaining || 0) === 0

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-purple-500 to-blue-500 text-white px-3 md:px-4 py-2 flex items-center justify-between shadow-lg h-12 md:h-16 sticky top-0 z-30">
        <div className="flex items-center gap-2 md:gap-3">
          <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 cursor-pointer">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 md:w-80">
              <div className="flex h-full flex-col">
                <div className="bg-gradient-to-r from-purple-500 to-blue-500 text-white p-4 h-16 flex items-center">
                <h4 className="text-lg font-semibold flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Historique de conversation
                </h4>
              </div>
              <div ref={historyRef} className="p-4 space-y-2 flex-1 overflow-y-auto">
                {messages.slice(-10).map((message, index) => (
                  <Card 
                    key={`${message.id}-${index}`}
                    className="p-3 transition-colors hover:bg-gray-50"
                  >
                    <div className={`text-sm ${message.is_user ? 'text-purple-600 font-medium' : 'text-blue-700'}`}>
                     {message.is_user ? `🙋‍♂️ ${user?.username || 'Vous'}` : '👱‍♀️ Nono'}
                    </div>

                    <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                      {message.content}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {formatTime(message.timestamp)}
                    </div>
                  </Card>
                ))}
                {messages.length === 0 && (
                  <div className="text-center text-gray-500 text-sm py-8">
                    Aucun message pour le moment
                  </div>
                )}
              </div>
              <div className="mt-auto border-t p-3 text-xs flex flex-col items-center text-center">
                <a
                  href="mailto:help.nonotalk@outlook.fr?subject=Demande%20d%27aide%20-%20NonoTalk"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = 'mailto:help.nonotalk@gmail.com?subject=Demande%20d%27aide%20-%20NonoTalk';
                  }}
                  className="inline-block bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent font-semibold hover:opacity-80"
                >
                  Help ❓
                </a>
                <p className="text-gray-500 mt-2 leading-snug">NonoTalk est nourri de sources fiables mais ne remplace pas un professionnel de santé</p>
              </div>
            </div>
            </SheetContent>
          </Sheet>
          
          <div>
            <h1 className="text-sm md:text-xl font-bold">NonoTalk</h1>
            <p className="hidden md:block text-sm opacity-90">Chat avec Nono</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="text-right leading-tight">
            <div className="text-[11px] md:text-sm font-medium truncate max-w-[120px] md:max-w-none">{user?.username}</div>
            <div className="text-[10px] md:text-xs opacity-90">{user?.quota_remaining || 0} échanges</div>
          </div>
          <Button
            onClick={() => { setShowInviteForm(true); setQuotaWarning(true); }}
            className="inline-flex h-8 px-3 rounded-full bg-purple-600 hover:bg-purple-700 text-white text-xs cursor-pointer"
          >
            🎁 Inviter un ami
          </Button>
          <Button
            onClick={handleLogoutClick}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:text-gray-300 hover:bg-transparent cursor-pointer"
            title="Déconnexion"
          >
            <LogOut className="h-5 w-5" />
          </Button>

          {/* Confirmation de déconnexion */}
          <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Confirmation de déconnexion</DialogTitle>
                <DialogDescription>
                  Tu es sûr de vouloir te déconnecter ?
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={cancelLogout} className="cursor-pointer">Annuler</Button>
                <Button className="bg-purple-600 hover:bg-purple-700 text-white cursor-pointer" onClick={confirmLogout}>Déconnexion</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>


        {/* Interface principale - Avatar fixe au centre sans scrollbar */}
        <div className="flex-1 flex flex-col items-center justify-start p-4 pt-6 overflow-hidden pb-24 md:pb-0 md:justify-center md:pt-0">
          <div className={`w-[178px] h-[178px] md:w-[210px] md:h-[210px] rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center shadow-lg transition-all duration-300 ${
            isPlaying ? 'talking' : ''
          }`}>
            <div className="relative w-[162px] h-[162px] md:w-[194px] md:h-[194px] rounded-full overflow-hidden">
              <img
                src={aiAvatarImage}
                alt="Nono"
                className={`absolute inset-0 w-full h-full rounded-full object-cover transition-opacity duration-300 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}
                draggable="false"
              />
              <video
                ref={videoRef}
                src={nonoVideo}
                muted
                loop
                playsInline
                preload="auto"
                aria-hidden="true"
                className={`absolute inset-0 w-full h-full rounded-full object-cover pointer-events-none nono-video ${isPlaying ? 'opacity-100' : 'opacity-0'}`}
              />
            </div>
          </div>
          <p className="text-center text-gray-600 text-sm md:text-lg font-medium px-4 mt-2 md:mt-4">
            Je suis ton compagnon bienveillant, parle-moi librement 💜
          </p>
        </div>

      {/* Controls */}
      <div className="bg-gray-50 border-t fixed bottom-0 left-0 right-0 z-20 p-3 md:p-4 md:static" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-center gap-4">
          <Button
            onClick={handleVoiceRecording}
            disabled={isLoading}
            className={`w-16 h-16 rounded-full opacity-100 cursor-pointer ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 recording-ring'
                : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600'
            }`}
          >
            {isRecording ? (
              <MicOff className="h-6 w-6 text-white" />
            ) : (
              <Mic className="h-6 w-6 text-white" />
            )}
          </Button>

          {isPlaying && (
              <Button
                onClick={stopAudio}
                variant="outline"
                size="icon"
                className="w-12 h-12 rounded-full cursor-pointer"
            >
              <VolumeX className="h-5 w-5" />
            </Button>
          )}
        </div>

        {isRecording && (
          <div className="text-center mt-2">
            <p className="text-sm text-gray-600">🎤 Enregistrement en cours...</p>
          </div>
        )}
      </div>

      {/* Crisis Alert Dialog */}
      <Dialog open={!!crisisAlert} onOpenChange={() => setCrisisAlert(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Message d'urgence
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
              <p className="text-sm whitespace-pre-line">{crisisAlert}</p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1 cursor-pointer"
                onClick={() => window.open('tel:112')}
              >
                <Phone className="h-4 w-4 mr-2" />
                Appeler 112
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 cursor-pointer"
                onClick={() => window.open('tel:0145394000')}
              >
                <Heart className="h-4 w-4 mr-2" />
                SOS Suicide
              </Button>
            </div>
            <Button 
              onClick={acknowledgeCrisis}
              className="w-full bg-blue-600 hover:bg-blue-700 cursor-pointer"
            >
              J'ai compris
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quota Warning Dialog */}
      <Dialog open={quotaWarning} onOpenChange={(open) => { 
        setQuotaWarning(open); 
        if (!open) { 
          setShowInviteForm(false); 
          setInviteEmail(''); 
          setInviteError(''); 
          setInviteSuccess(''); 
          setInviteLoading(false); 
        } 
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Quota bientôt épuisé
            </DialogTitle>
            <DialogDescription>
              Tu as atteint ta limite gratuite. Invite un ami pour débloquer +5 échanges gratuits pour chacun 🎁
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button 
                className="flex-1 bg-purple-600 hover:bg-purple-700 cursor-pointer"
                onClick={() => setShowInviteForm(true)}
              >
                🎁 Inviter un ami
              </Button>
              <Button 
                variant="secondary" 
                className="flex-1 cursor-pointer"
                onClick={() => {
                  setQuotaWarning(false)
                  setShowInviteForm(false)
                  setInviteEmail('')
                  setInviteError('')
                  setInviteSuccess('')
                  setInviteLoading(false)
                }}
              >
                Compris
              </Button>
            </div>

            {showInviteForm && (
              <form onSubmit={inviteFriend} className="space-y-2">
                <Input
                  type="email"
                  placeholder="Adresse e-mail de ton ami"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviteLoading}
                  required
                />
                <Button 
                  type="submit" 
                  className="w-full bg-purple-600 hover:bg-purple-700 cursor-pointer"
                  disabled={inviteLoading || !inviteEmail}
                >
                  {inviteLoading ? 'Envoi...' : 'Envoyer l’invitation'}
                </Button>
                {inviteSuccess && <p className="text-green-600 text-sm">{inviteSuccess}</p>}
                {inviteError && <p className="text-red-600 text-sm">{inviteError}</p>}
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
