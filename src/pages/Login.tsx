import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Mail, Lock, User, UserCheck, AlertCircle } from 'lucide-react';

export function Login() {
  const { user, login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('broker');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) {
          throw new Error('El nombre es obligatorio');
        }
        await register(email, name, role, password);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al autenticar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative font-sans" style={{
      backgroundImage: 'url("https://images.unsplash.com/photo-1500937386664-56d1dfef3854?q=80&w=2070&auto=format&fit=crop")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md shadow-2xl"></div>
      
      <div className="max-w-md w-full bg-[#1e1e1e]/85 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl relative z-10 transition-all duration-300">
        <div className="text-center mb-8">
          <div className="text-4xl font-bold gap-3 text-white mb-2 flex items-center justify-center tracking-wide">
            <span className="animate-bounce">🌾</span> AgroSys
          </div>
          <p className="text-green-400 text-sm font-semibold tracking-wider uppercase">Plataforma Inteligente de Corretaje</p>
        </div>

        {/* Tab Headers */}
        <div className="flex bg-black/30 rounded-xl p-1 mb-6 border border-zinc-800">
          <button
            onClick={() => { setIsRegister(false); setError(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${!isRegister ? 'bg-green-600 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Iniciar Sesión
          </button>
          <button
            onClick={() => { setIsRegister(true); setError(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${isRegister ? 'bg-green-600 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Registrarse
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-5 flex items-start gap-2.5 text-red-400 text-sm animate-shake">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Nombre Completo</label>
                <div className="relative">
                  <User className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-green-500 rounded-xl py-3 pl-11 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500 transition-all duration-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Rol en el Sistema</label>
                <div className="relative">
                  <UserCheck className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-green-500 rounded-xl py-3 pl-11 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500 transition-all duration-200 appearance-none cursor-pointer"
                  >
                    <option value="broker">Corredor / Broker</option>
                    <option value="admin">Administrador</option>
                    <option value="producer">Productor Asociado</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Correo Electrónico</label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-green-500 rounded-xl py-3 pl-11 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500 transition-all duration-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Contraseña</label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-green-500 rounded-xl py-3 pl-11 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500 transition-all duration-200"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none shadow-xl border border-green-500/20"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : isRegister ? (
              'Crear Cuenta'
            ) : (
              'Ingresar al Sistema'
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-zinc-500 font-mono tracking-wide">
          SISTEMA AGROCRM v2.0 • CONEXIÓN SEGURA
        </p>
      </div>
    </div>
  );
}
