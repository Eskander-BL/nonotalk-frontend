import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Heart, User, Lock, Mail, UserPlus } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import logoImage from '../assets/logo.png'

export default function LoginPage() {
  const { login, register } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [success, setSuccess] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const [registerErrors, setRegisterErrors] = useState({ username: '', email: '', pin: '', general: '' })

  // Refs pour focaliser le premier champ en erreur dans la modale
  const regUsernameRef = useRef(null)
  const regEmailRef = useRef(null)
  const regPinRef = useRef(null)

  // États pour la connexion
  const [loginData, setLoginData] = useState({
    username: '',
    pin: ''
  })

  // États pour l'inscription
  const [registerData, setRegisterData] = useState({
    username: '',
    email: '',
    pin: '',
    parrain_email: ''
  })

  const handleLogin = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setLoginError('')

    if (!loginData.username || !loginData.pin) {
      setLoginError('Veuillez remplir tous les champs')
      setIsLoading(false)
      return
    }

    if (loginData.pin.length !== 4) {
      setLoginError('Le PIN doit contenir 4 chiffres')
      setIsLoading(false)
      return
    }

    const result = await login(loginData.username, loginData.pin)
    
    if (!result.success) {
      setLoginError(result.error)
    }
    
    setIsLoading(false)
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setLoginError('')
    setSuccess('')
    setRegisterErrors({ username: '', email: '', pin: '', general: '' })

    // Validations côté client
    if (!registerData.username || !registerData.pin || !registerData.email || !registerData.email.trim()) {
      const errs = { username: '', email: '', pin: '', general: '' }
      if (!registerData.username) errs.username = 'Obligatoire'
      if (!registerData.email || !registerData.email.trim()) errs.email = 'Le champ email est obligatoire'
      if (!registerData.pin) errs.pin = 'Obligatoire'
      setRegisterErrors(errs)
      // Focus sur le premier champ en erreur
      if (errs.username) regUsernameRef.current?.focus()
      else if (errs.email) regEmailRef.current?.focus()
      else if (errs.pin) regPinRef.current?.focus()
      setIsLoading(false)
      return
    }

    if (registerData.pin.length !== 4) {
      setRegisterErrors({ username: '', email: '', pin: 'Le PIN doit contenir 4 chiffres', general: '' })
      regPinRef.current?.focus()
      setIsLoading(false)
      return
    }

    const result = await register(
      registerData.username,
      registerData.email.trim(),
      registerData.pin,
      registerData.parrain_email
    )

    if (result.success) {
      // Fermer la modale d'inscription
      setShowRegister(false)

      // Réinitialiser le formulaire d'inscription et les erreurs
      setRegisterData({
        username: '',
        email: '',
        pin: '',
        parrain_email: ''
      })
      setRegisterErrors({ username: '', email: '', pin: '', general: '' })

      // Afficher le message de succès sur la page principale
      if (result.bonus_quota > 0) {
        setSuccess(`Inscription réussie ! Bonus parrainage : +${result.bonus_quota} échanges`)
      } else {
        setSuccess('Inscription réussie ! Vous pouvez maintenant vous connecter.')
      }
    } else {
      const msg = result.error || "Erreur d'inscription"
      const lower = msg.toLowerCase()
      if (lower.includes('utilisateur') || lower.includes("nom d'utilisateur")) {
        setRegisterErrors({ username: "Ce nom d'utilisateur existe déjà", email: '', pin: '', general: '' })
        regUsernameRef.current?.focus()
      } else if (lower.includes('email')) {
        setRegisterErrors({ username: '', email: 'Cet email est déjà utilisé', pin: '', general: '' })
        regEmailRef.current?.focus()
      } else {
        setRegisterErrors({ username: '', email: '', pin: '', general: msg })
      }
    }

    setIsLoading(false)
  }

  const handlePinInput = (value, isRegister = false) => {
    // Ne garder que les chiffres et limiter à 4
    const numericValue = value.replace(/\D/g, '').slice(0, 4)
    
    if (isRegister) {
      setRegisterData(prev => ({ ...prev, pin: numericValue }))
    } else {
      setLoginData(prev => ({ ...prev, pin: numericValue }))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/95 backdrop-blur-sm shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center shadow-lg">
              <img 
                src={logoImage} 
                alt="NonoTalk Logo" 
                className="w-16 h-16 rounded-full object-cover"
              />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-gray-800">NonoTalk</CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              Nono, toujours là pour t'écouter
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {loginError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {loginError}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-gray-700">
                Nom d'utilisateur
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Ton nom d'utilisateur"
                  value={loginData.username}
                  onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pin" className="text-sm font-medium text-gray-700">
                Code PIN (4 chiffres)
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="pin"
                  type="password"
                  placeholder="••••"
                  value={loginData.pin}
                  onChange={(e) => handlePinInput(e.target.value)}
                  className="pl-10 text-center text-lg tracking-widest"
                  maxLength={4}
                  disabled={isLoading}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-medium py-3 rounded-lg transition-all duration-200 transform hover:scale-105 cursor-pointer"
              disabled={isLoading}
            >
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>

          <div className="text-center">
            <Dialog open={showRegister} onOpenChange={(open) => { setShowRegister(open); if (open) { setRegisterErrors({ username: '', email: '', pin: '', general: '' }); } }}>
              <DialogTrigger asChild>
                <Button variant="link" className="text-purple-600 hover:text-purple-700 cursor-pointer">
                  Pas encore de compte ? Créer un compte
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    Créer un compte
                  </DialogTitle>
                  <DialogDescription>
                    Rejoins NonoTalk et commence à discuter avec Nono
                  </DialogDescription>
                </DialogHeader>

                {registerErrors.general && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {registerErrors.general}
                  </div>
                )}
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-username">Nom d'utilisateur *</Label>
                    <Input
                      id="reg-username"
                      type="text"
                      placeholder="Ton nom d'utilisateur"
                      value={registerData.username}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, username: e.target.value }))}
                      disabled={isLoading}
                      ref={regUsernameRef}
                      className={registerErrors.username ? 'border-red-500 focus-visible:ring-red-500' : ''}
                      aria-invalid={!!registerErrors.username}
                      aria-describedby="reg-username-error"
                    />
                    {registerErrors.username && (
                      <p id="reg-username-error" className="text-xs text-red-600 mt-1">{registerErrors.username}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email *</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="ton@email.com"
                      value={registerData.email}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                      disabled={isLoading}
                      required
                      ref={regEmailRef}
                      className={registerErrors.email ? 'border-red-500 focus-visible:ring-red-500' : ''}
                      aria-invalid={!!registerErrors.email}
                      aria-describedby="reg-email-error"
                    />
                    {registerErrors.email && (
                      <p id="reg-email-error" className="text-xs text-red-600 mt-1">{registerErrors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-pin">Code PIN (4 chiffres) *</Label>
                    <Input
                      id="reg-pin"
                      type="password"
                      placeholder="••••"
                      value={registerData.pin}
                      onChange={(e) => handlePinInput(e.target.value, true)}
                      className={`text-center text-lg tracking-widest ${registerErrors.pin ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      maxLength={4}
                      disabled={isLoading}
                      ref={regPinRef}
                      aria-invalid={!!registerErrors.pin}
                      aria-describedby="reg-pin-error"
                    />
                    {registerErrors.pin && (
                      <p id="reg-pin-error" className="text-xs text-red-600 mt-1">{registerErrors.pin}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-parrain">Email de parrain (optionnel)</Label>
                    <Input
                      id="reg-parrain"
                      type="email"
                      placeholder="email@parrain.com"
                      value={registerData.parrain_email}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, parrain_email: e.target.value }))}
                      disabled={isLoading}
                    />
                    <p className="text-xs text-gray-500">
                      +5 échanges gratuits pour toi et ton parrain ! 🎁
                    </p>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 cursor-pointer"
                    disabled={isLoading || !registerData.email.trim()}
                  >
                    {isLoading ? 'Création...' : 'Créer mon compte'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
