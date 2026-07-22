import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UIProvider } from './contexts/UIContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Clientes } from './pages/Clientes';
import { Oportunidades } from './pages/Oportunidades';
import { MesaOperativa } from './pages/MesaOperativa';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <UIProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="oportunidades" element={<Oportunidades />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="operaciones" element={<MesaOperativa />} />
            </Route>
          </Routes>
        </UIProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
