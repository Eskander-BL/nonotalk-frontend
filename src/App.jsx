import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import LoginPage from './components/LoginPage'
import ChatPage from './components/ChatPage'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { NotificationManager, scheduleInactivityReminder, scheduleDailyRitual } from './components/NotificationManager'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-blue-400 to-cyan-400 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    )
  }

  return (
    <Routes>
      <Route 
        path="/login" 
        element={user ? <Navigate to="/chat" replace /> : <LoginPage />} 
      />
      <Route 
        path="/chat" 
        element={user ? <ChatPage /> : <Navigate to="/login" replace />} 
      />
      <Route 
        path="/" 
        element={<Navigate to={user ? "/chat" : "/login"} replace />} 
      />
    </Routes>
  )
}

function App() {
  useEffect(() => {
    // Démarrer les notifications
    scheduleInactivityReminder()
    scheduleDailyRitual()
  }, [])

  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gradient-to-br from-purple-400 via-blue-400 to-cyan-400">
          <NotificationManager />
          <AppRoutes />
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App
