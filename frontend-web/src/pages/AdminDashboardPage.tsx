import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Activity, Calendar, Shield, ArrowLeft, AlertCircle } from 'lucide-react';
import { db, AuditLog } from '../db/database';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    trialUsers: 0,
    expiredTrials: 0,
  });
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser?.role !== 'super_admin') {
      navigate('/');
      return;
    }
    loadDashboardData();
  }, [currentUser, navigate]);

  const loadDashboardData = async () => {
    try {
      const users = await db.users.toArray();
      const logs = await db.auditLogs
        .orderBy('timestamp')
        .reverse()
        .limit(10)
        .toArray();

      const now = new Date();
      const activeUsers = users.filter(u => u.isActive).length;
      const trialUsers = users.filter(u => u.trialEndDate && new Date(u.trialEndDate) > now).length;
      const expiredTrials = users.filter(u => u.trialEndDate && new Date(u.trialEndDate) <= now).length;

      setStats({
        totalUsers: users.length,
        activeUsers,
        trialUsers,
        expiredTrials,
      });
      setRecentLogs(logs);
      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setLoading(false);
    }
  };

  const getActionLabel = (action: string): string => {
    const labels: Record<string, string> = {
      create_user: 'Utilisateur créé',
      disable_user: 'Utilisateur désactivé',
      enable_user: 'Utilisateur activé',
      delete_user: 'Utilisateur supprimé',
      extend_trial: 'Essai prolongé',
      update_role: 'Rôle modifié',
    };
    return labels[action] || action;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    Tableau de bord Admin
                  </h1>
                  <p className="text-sm text-gray-500">Vue d'ensemble du système</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('/admin/users')}
              className="btn btn-primary flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Gérer les utilisateurs
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Utilisateurs"
            value={stats.totalUsers}
            icon={Users}
            color="blue"
          />
          <StatCard
            title="Utilisateurs Actifs"
            value={stats.activeUsers}
            icon={Shield}
            color="green"
          />
          <StatCard
            title="Périodes d'essai"
            value={stats.trialUsers}
            icon={Calendar}
            color="yellow"
          />
          <StatCard
            title="Essais Expirés"
            value={stats.expiredTrials}
            icon={AlertCircle}
            color="red"
          />
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Activité Récente</h2>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {recentLogs.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                Aucune activité récente
              </div>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {log.userEmail}
                        </span>
                        <span className="text-sm text-gray-500">•</span>
                        <span className="text-sm text-gray-600">
                          {getActionLabel(log.action)}
                        </span>
                      </div>
                      {log.details && (
                        <div className="text-sm text-gray-500">
                          {log.details.email && (
                            <span>Email: {log.details.email}</span>
                          )}
                          {log.details.role && (
                            <span className="ml-3">Rôle: {log.details.role}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {format(new Date(log.timestamp), 'dd MMM yyyy HH:mm', { locale: fr })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'yellow' | 'red';
}

function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-600">{title}</p>
      </div>
    </div>
  );
}
