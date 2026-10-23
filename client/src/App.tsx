import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import HomePage from './pages/HomePage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailsPage from './pages/ProjectDetailsPage';
import SellProjectPage from './pages/SellProjectPage';
import CustomSoftwarePage from './pages/CustomSoftwarePage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import FaqPage from './pages/FaqPage';
import AuthPage from './pages/AuthPage';
import LegalPage from './pages/LegalPage';
import InstitutionAccessPage from './pages/InstitutionAccessPage';

const OwnerDashboardPage = lazy(() => import('./pages/OwnerDashboardPage'));

function PrivateRoute({ children, allowedRoles }: { children: JSX.Element; allowedRoles?: Array<'BUYER' | 'SELLER' | 'ADMIN'> }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="container py-20 text-center text-slate-600">Loading your session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'SELLER' ? '/seller/dashboard' : '/projects'} replace />;
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailsPage />} />
        <Route path="/owner/dashboard" element={<PrivateRoute allowedRoles={['ADMIN']}><Suspense fallback={<div className="container py-20 text-center text-slate-600">Loading owner workspace...</div>}><OwnerDashboardPage /></Suspense></PrivateRoute>} />
        <Route path="/institution-access" element={<PrivateRoute allowedRoles={['BUYER']}><InstitutionAccessPage /></PrivateRoute>} />
        <Route path="/seller/dashboard" element={<PrivateRoute allowedRoles={['SELLER']}><SellProjectPage /></PrivateRoute>} />
        <Route path="/sell-project" element={<Navigate to="/seller/dashboard" replace />} />
        <Route path="/custom-software" element={<CustomSoftwarePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/terms" element={<LegalPage title="Terms & Conditions" />} />
        <Route path="/privacy" element={<LegalPage title="Privacy Policy" />} />
        <Route path="/refund-policy" element={<LegalPage title="Refund Policy" />} />
        <Route path="/license-policy" element={<LegalPage title="License Policy" />} />
        <Route path="/support" element={<ContactPage />} />
        <Route path="/categories" element={<ProjectsPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </AuthProvider>
  );
}
