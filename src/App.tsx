import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicOnlyRoute } from './components/PublicOnlyRoute';
import { RootLayout } from './layouts/RootLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
const LandingPage = React.lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginPage = React.lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const SignupPage = React.lazy(() => import('./pages/SignupPage').then(m => ({ default: m.SignupPage })));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const NewProjectPage = React.lazy(() => import('./pages/NewProjectPage').then(m => ({ default: m.NewProjectPage })));
const ProjectDetailPage = React.lazy(() => import('./pages/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
const HistoryPage = React.lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const BrandPage = React.lazy(() => import('./pages/BrandPage').then(m => ({ default: m.BrandPage })));
const PublishingHistoryPage = React.lazy(() => import('./pages/PublishingHistoryPage').then(m => ({ default: m.PublishingHistoryPage })));
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const BillingPage = React.lazy(() => import('./pages/BillingPage').then(m => ({ default: m.BillingPage })));
const ClipEditorPage = React.lazy(() => import('./pages/ClipEditorPage').then(m => ({ default: m.ClipEditorPage })));
const AdminPage = React.lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <React.Suspense fallback={<div className="mx-auto mt-20 h-40 w-full max-w-6xl animate-pulse rounded-2xl bg-white" aria-label="Loading page" />}><Routes>
          {/* Public marketing layout with top navbar & footer */}
          <Route element={<RootLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* Auth routes: only accessible when not logged in */}
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          {/* Protected dashboard routes: require authenticated session */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/projects/new" element={<NewProjectPage />} />
              <Route path="/new" element={<Navigate to="/projects/new" replace />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/brand" element={<BrandPage />} />
              <Route path="/publishing" element={<PublishingHistoryPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>

            {/* Focused studio editor */}
            <Route path="/clips/:clipId/edit" element={<ClipEditorPage />} />
          </Route>
        </Routes></React.Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
