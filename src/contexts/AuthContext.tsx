import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '../lib/api';

export interface LocalUser {
  uid: string;
  id: string;
  email: string;
  displayName: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: LocalUser | null;
  loading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  register: (email: string, name: string, role: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  signInWithGoogle?: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeToken(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      const token = localStorage.getItem('agro_jwt_token');
      if (token) {
        const decoded = decodeToken(token);
        if (decoded && decoded.uid) {
          // Set temporary user state so UI renders instantly
          const initialUser: LocalUser = {
            uid: decoded.uid,
            id: decoded.uid,
            email: decoded.email || '',
            displayName: decoded.email ? decoded.email.split('@')[0] : 'Usuario',
            name: decoded.email ? decoded.email.split('@')[0] : 'Usuario',
            role: 'broker'
          };
          setUser(initialUser);

          // Fetch full user details from backend
          try {
            const profile = await api.users.me();
            setUser({
              uid: profile.id,
              id: profile.id,
              email: profile.email,
              displayName: profile.name || profile.email.split('@')[0],
              name: profile.name || profile.email.split('@')[0],
              role: profile.role || 'broker'
            });
          } catch (e) {
            console.error('[AUTH] Failed to fetch user profile, logging out:', e);
            localStorage.removeItem('agro_jwt_token');
            setUser(null);
          }
        } else {
          localStorage.removeItem('agro_jwt_token');
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    }

    initAuth();
  }, []);

  const login = async (email: string, password?: string) => {
    try {
      const res = await api.auth.login({ email, password });
      if (res && res.token && res.user) {
        localStorage.setItem('agro_jwt_token', res.token);
        setUser({
          uid: res.user.id,
          id: res.user.id,
          email: res.user.email,
          displayName: res.user.name || res.user.email.split('@')[0],
          name: res.user.name || res.user.email.split('@')[0],
          role: res.user.role || 'broker'
        });
      } else {
        throw new Error('Respuesta de autenticación inválida');
      }
    } catch (e: any) {
      throw new Error(e.message || 'Error al iniciar sesión');
    }
  };

  const register = async (email: string, name: string, role: string, password?: string) => {
    try {
      const res = await api.auth.register({ email, name, role, password });
      if (res && res.token && res.user) {
        localStorage.setItem('agro_jwt_token', res.token);
        setUser({
          uid: res.user.id,
          id: res.user.id,
          email: res.user.email,
          displayName: res.user.name || res.user.email.split('@')[0],
          name: res.user.name || res.user.email.split('@')[0],
          role: res.user.role || 'broker'
        });
      } else {
        throw new Error('Respuesta de registro inválida');
      }
    } catch (e: any) {
      throw new Error(e.message || 'Error al registrarse');
    }
  };

  const logout = async () => {
    localStorage.removeItem('agro_jwt_token');
    setUser(null);
  };

  const signInWithGoogle = async () => {
    throw new Error('Inicio de sesión con Google deshabilitado. Use el formulario local.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
          <div className="flex items-center gap-2 text-zinc-100 font-bold tracking-wider text-xl animate-pulse">
            <span>🌾</span> AgroSys
          </div>
          <p className="text-zinc-500 text-xs font-mono tracking-wider">RESOLVIENDO LOGIN SEGURO...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, signInWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
