import { FC, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  LogOut,
  Menu,
  Globe,
  Shield,
  Clock,
  Trash2,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useState } from 'react';

interface LayoutProps {
  children: ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: t('dashboard.title') },
    { path: '/projects', icon: FolderKanban, label: t('project.projects') },
    { path: '/delais', icon: Clock, label: 'Gestion des Délais' },
    { path: '/trash', icon: Trash2, label: 'سلة المحذوفات' },
    { path: '/settings', icon: Settings, label: t('settings.title') },
  ];

  // Add admin menu item if user is super_admin
  if (user?.role === 'super_admin') {
    menuItems.splice(2, 0, {
      path: '/admin',
      icon: Shield,
      label: 'Administration',
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-white border-r border-gray-200 transition-all duration-300 relative flex flex-col`}
      >
        <div className="flex items-center justify-between p-4 border-b">
          {sidebarOpen && (
            <h1 className="text-xl font-bold text-primary-600">{t('app.title')}</h1>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t mt-auto">
          {/* Language Selector */}
          <div className="mb-4">
            {sidebarOpen && (
              <div className="flex gap-2">
                <button
                  onClick={() => changeLanguage('fr')}
                  className={`px-3 py-1 text-sm rounded ${
                    i18n.language === 'fr' ? 'bg-primary-100 text-primary-600' : 'bg-gray-100'
                  }`}
                >
                  FR
                </button>
                <button
                  onClick={() => changeLanguage('ar')}
                  className={`px-3 py-1 text-sm rounded ${
                    i18n.language === 'ar' ? 'bg-primary-100 text-primary-600' : 'bg-gray-100'
                  }`}
                >
                  AR
                </button>
                <button
                  onClick={() => changeLanguage('en')}
                  className={`px-3 py-1 text-sm rounded ${
                    i18n.language === 'en' ? 'bg-primary-100 text-primary-600' : 'bg-gray-100'
                  }`}
                >
                  EN
                </button>
              </div>
            )}
            {!sidebarOpen && <Globe className="w-5 h-5 mx-auto text-gray-500" />}
          </div>

          {/* User Info */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 font-semibold flex-shrink-0">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            )}
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span>{t('auth.logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
