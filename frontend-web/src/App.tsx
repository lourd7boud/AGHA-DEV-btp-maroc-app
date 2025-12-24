import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from './store/authStore';
import { useSyncManager } from './hooks/useSyncManager';
import { useAutoUpdater } from './hooks/useAutoUpdater';
import { migrateCompaniesFromProjects } from './services/companyService';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import CreateProjectPage from './pages/CreateProjectPage';
import EditProjectPage from './pages/EditProjectPage';
import DelaisPage from './pages/DelaisPage';
import BordereauPage from './pages/BordereauPage';
// New structured pages - Métré/Décompte with proper numbering
import MetreListPage from './pages/MetreListPage';
import MetreEditPage from './pages/MetreEditPage';
import MetrePageV3 from './pages/MetrePageV3';
import DecompteListPage from './pages/DecompteListPage';
// Legacy pages - kept for backward compatibility
import PeriodeMetrePage from './pages/PeriodeMetrePage';
import PeriodeDecomptePage from './pages/PeriodeDecomptePage';
import AttachementPage from './pages/AttachementPage';
import SettingsPage from './pages/SettingsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import UsersManagementPage from './pages/UsersManagementPage';
import TrashPage from './pages/TrashPage';
import Layout from './components/Layout';
import SyncIndicator from './components/SyncIndicator';
import { UpdateNotification } from './components/UpdateNotification';

function App() {
  useTranslation(); // Initialize i18n
  const { user, isInitialized, checkAuth } = useAuthStore();
  const { syncState, sync, clearPendingOperations } = useSyncManager(user?.id || null);
  
  // Setup auto-updater (only works in Electron)
  useAutoUpdater();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Déclencher une synchronisation SEULEMENT après que l'auth soit vérifiée
  useEffect(() => {
    // CRITICAL: Wait for auth to be initialized AND user to exist
    if (!isInitialized) {
      console.log('⏳ Waiting for auth to initialize...');
      return;
    }
    
    if (!user) {
      console.log('👤 No user, skipping sync');
      return;
    }
    
    console.log('✅ Auth initialized, starting sync for user:', user.id);
    
    // Migrer les entreprises depuis les projets existants
    migrateCompaniesFromProjects().then(count => {
      if (count > 0) {
        console.log(`📦 ${count} entreprises migrées depuis les projets`);
      }
    });
    
    // Small delay to ensure everything is ready
    const timer = setTimeout(() => {
      sync().catch((error) => {
        // Ne pas afficher l'erreur si c'est une erreur d'auth
        if (error.response?.status !== 401) {
          console.error('Sync error on mount:', error);
        }
      });
    }, 300);
    
    return () => clearTimeout(timer);
  }, [isInitialized, user?.id, sync]); // Depend on isInitialized AND user?.id

  return (
    <>
      <SyncIndicator syncState={syncState} onSync={sync} onClearPending={clearPendingOperations} />
      <UpdateNotification />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        <Route
          path="/"
          element={
            user ? (
              <Layout>
                <DashboardPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects"
          element={
            user ? (
              <Layout>
                <ProjectsPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/new"
          element={
            user ? (
              <Layout>
                <CreateProjectPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:id"
          element={
            user ? (
              <Layout>
                <ProjectDetailPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:id/edit"
          element={
            user ? (
              <Layout>
                <EditProjectPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/delais"
          element={
            user ? (
              <Layout>
                <DelaisPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:projectId/bordereau"
          element={
            user ? (
              <Layout>
                <BordereauPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:projectId/metre"
          element={
            user ? (
              <Layout>
                <MetreListPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:projectId/metres"
          element={
            user ? (
              <Layout>
                <MetreListPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        {/* MetrePageV3 - Hierarchical structure like Excel */}
        <Route
          path="/projects/:projectId/metre-v3"
          element={
            user ? (
              <Layout>
                <MetrePageV3 />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:projectId/metre/:periodeId"
          element={
            user ? (
              <Layout>
                <MetreEditPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:projectId/decompte"
          element={
            user ? (
              <Layout>
                <DecompteListPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:projectId/decomptes"
          element={
            user ? (
              <Layout>
                <DecompteListPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:projectId/decompte/:periodeId"
          element={
            user ? (
              <Layout>
                <PeriodeDecomptePage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        {/* Legacy routes - redirect to new pages */}
        <Route
          path="/projects/:projectId/periodes"
          element={
            user ? (
              <Navigate to={`/projects/${window.location.pathname.split('/')[2]}/metre`} replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:projectId/periodes/:periodeId/metre"
          element={
            user ? (
              <Layout>
                <PeriodeMetrePage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:projectId/periodes/:periodeId/decompte"
          element={
            user ? (
              <Layout>
                <PeriodeDecomptePage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/projects/:projectId/periodes/:periodeId/attachement"
          element={
            user ? (
              <Layout>
                <AttachementPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        {/* New direct attachement route */}
        <Route
          path="/projects/:projectId/attachement"
          element={
            user ? (
              <Layout>
                <AttachementPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/settings"
          element={
            user ? (
              <Layout>
                <SettingsPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/trash"
          element={
            user ? (
              <Layout>
                <TrashPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
          path="/admin"
          element={
            user?.role === 'super_admin' ? (
              <AdminDashboardPage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        
        <Route
          path="/admin/users"
          element={
            user?.role === 'super_admin' ? (
              <UsersManagementPage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
