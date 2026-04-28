import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login({ setUserRole }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    console.log('Login clicked')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    console.log('Auth data:', data)
    console.log('Auth error:', error)

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    const user = data.user

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    console.log('Profile:', profile)
    console.log('Profile error:', profileError)

    if (profileError) {
      alert(profileError.message)
      setLoading(false)
      return
    }

    setUserRole(profile.role)
    setLoading(false)
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>Login</h2>

      <input
        value={email}
        placeholder="Email"
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        value={password}
        type="password"
        placeholder="Password"
        onChange={(e) => setPassword(e.target.value)}
      />

      <button onClick={handleLogin} disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </div>
  )
}