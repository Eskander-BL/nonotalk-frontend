import { useEffect } from 'react'

export function NotificationManager() {
  useEffect(() => {
    // Demander la permission pour les notifications
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    // Enregistrer le service worker pour les notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker enregistré:', registration)
        })
        .catch(error => {
          console.log('Erreur Service Worker:', error)
        })
    }
  }, [])

  return null
}

export function sendNotification(title, body, options = {}) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/logo.png',
      badge: '/logo.png',
      ...options
    })
  }
}

export function scheduleNotification(title, body, delay) {
  setTimeout(() => {
    sendNotification(title, body)
  }, delay)
}

// Notification de rappel après 24h d'inactivité
export function scheduleInactivityReminder() {
  const lastActivity = localStorage.getItem('lastActivity')
  const now = Date.now()
  
  if (lastActivity) {
    const timeSinceLastActivity = now - parseInt(lastActivity)
    const twentyFourHours = 24 * 60 * 60 * 1000
    
    if (timeSinceLastActivity >= twentyFourHours) {
      sendNotification(
        'NonoTalk',
        'Hey 👋 ça fait un jour qu\'on n\'a pas parlé, comment tu vas ?'
      )
    }
  }
  
  // Programmer la prochaine vérification
  setTimeout(scheduleInactivityReminder, 60 * 60 * 1000) // Vérifier chaque heure
}

// Rituel quotidien
export function scheduleDailyRitual() {
  const now = new Date()
  const ritual = new Date()
  ritual.setHours(9, 0, 0, 0) // 9h du matin
  
  if (now > ritual) {
    ritual.setDate(ritual.getDate() + 1) // Demain
  }
  
  const timeUntilRitual = ritual.getTime() - now.getTime()
  
  setTimeout(() => {
    sendNotification(
      'Rituel bien-être - NonoTalk',
      'Salut, prenons 1 minute pour respirer ensemble. Inspire… expire… Bravo !'
    )
    
    // Programmer le prochain rituel
    scheduleDailyRitual()
  }, timeUntilRitual)
}

// Marquer l'activité
export function markActivity() {
  localStorage.setItem('lastActivity', Date.now().toString())
}

