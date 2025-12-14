import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAuthStore } from '../store/authStore';
import {
  FolderKanban,
  CheckCircle2,
  Clock,
  TrendingUp,
  Plus,
  AlertTriangle,
  Bell,
  DollarSign,
  FileText,
  AlertCircle,
  Timer,
  ChevronRight,
  Target,
  Zap,
  Shield,
  Receipt,
} from 'lucide-react';
import { differenceInDays, addMonths } from 'date-fns';

// Types pour les alertes
interface Alert {
  id: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  icon: FC<{ className?: string }>;
  title: string;
  description: string;
  action?: {
    label: string;
    path: string;
  };
  projectId?: string;
  priority: number;
}

// Types pour les statistiques
interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalBudget: number;
  totalRealized: number;
  averageProgress: number;
  projectsNeedingDecompte: number;
  upcomingDeadlines: number;
}

const DashboardPage: FC = () => {
  useTranslation(); // Initialize translations
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Récupérer toutes les données nécessaires
  const projects = useLiveQuery(
    () => db.projects.where('userId').equals(user?.id || '').and((p) => !p.deletedAt).toArray(),
    [user?.id]
  );

  const decompts = useLiveQuery(
    () => db.decompts.filter((d) => !d.deletedAt).toArray(),
    []
  );

  const bordereaux = useLiveQuery(
    () => db.bordereaux.filter((b) => !b.deletedAt).toArray(),
    []
  );

  // Calculer les statistiques
  const stats = useMemo<DashboardStats>(() => {
    if (!projects) {
      return {
        totalProjects: 0,
        activeProjects: 0,
        completedProjects: 0,
        totalBudget: 0,
        totalRealized: 0,
        averageProgress: 0,
        projectsNeedingDecompte: 0,
        upcomingDeadlines: 0,
      };
    }

    const activeProjects = projects.filter((p) => p.status === 'active');
    const completedProjects = projects.filter((p) => p.status === 'completed');
    
    // Calculer le budget total depuis les bordereaux
    const totalBudget = bordereaux?.reduce((sum, b) => {
      const montantHT = b.lignes.reduce((s, l) => {
        const quantite = parseFloat(String(l.quantite)) || 0;
        const prix = parseFloat(String(l.prixUnitaire)) || 0;
        return s + (quantite * prix);
      }, 0);
      return sum + montantHT * 1.2;
    }, 0) || 0;

    // Calculer le montant réalisé depuis les décomptes
    const totalRealized = decompts?.reduce((sum, d) => {
      const montant = parseFloat(String(d.montantTotal)) || 0;
      return sum + montant;
    }, 0) || 0;

    // Calculer la progression moyenne
    const avgProgress = activeProjects.length > 0
      ? activeProjects.reduce((sum, p) => sum + (p.progress || 0), 0) / activeProjects.length
      : 0;

    // Projets qui ont besoin d'un nouveau décompte
    const needDecompte = activeProjects.filter((p) => {
      const projectDecompts = decompts?.filter((d) => d.projectId === p.id) || [];
      if (projectDecompts.length === 0) return true;
      const lastDecompte = projectDecompts.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      return differenceInDays(new Date(), new Date(lastDecompte.createdAt)) > 30;
    });

    // Deadlines à venir
    const upcomingDeadlines = activeProjects.filter((p) => {
      if (!p.osc || !p.delaisExecution) return false;
      const endDate = addMonths(new Date(p.osc), p.delaisExecution);
      const daysRemaining = differenceInDays(endDate, new Date());
      return daysRemaining <= 30 && daysRemaining >= 0;
    });

    return {
      totalProjects: projects.length,
      activeProjects: activeProjects.length,
      completedProjects: completedProjects.length,
      totalBudget,
      totalRealized,
      averageProgress: Math.round(avgProgress),
      projectsNeedingDecompte: needDecompte.length,
      upcomingDeadlines: upcomingDeadlines.length,
    };
  }, [projects, decompts, bordereaux]);

  // Générer les alertes intelligentes
  const alerts = useMemo<Alert[]>(() => {
    if (!projects) return [];

    const alertsList: Alert[] = [];
    const today = new Date();

    projects.forEach((project) => {
      const projectId = project.id.replace('project:', '');
      
      // 1. Alerte: Délai dépassé
      if (project.status === 'active' && project.osc && project.delaisExecution) {
        const endDate = addMonths(new Date(project.osc), project.delaisExecution);
        const daysOverdue = differenceInDays(today, endDate);
        
        if (daysOverdue > 0) {
          alertsList.push({
            id: `overdue-${project.id}`,
            type: 'danger',
            icon: AlertTriangle,
            title: `Délai dépassé de ${daysOverdue} jours`,
            description: `${project.objet} (${project.marcheNo})`,
            action: { label: 'Voir', path: `/projects/${projectId}` },
            projectId: project.id,
            priority: 1,
          });
        } else if (daysOverdue > -30) {
          alertsList.push({
            id: `deadline-${project.id}`,
            type: 'warning',
            icon: Timer,
            title: `Fin de délai dans ${Math.abs(daysOverdue)} jours`,
            description: `${project.objet} (${project.marcheNo})`,
            action: { label: 'Voir', path: `/projects/${projectId}` },
            projectId: project.id,
            priority: 2,
          });
        }
      }

      // 2. Alerte: Projet sans décompte
      if (project.status === 'active') {
        const projectDecompts = decompts?.filter((d) => d.projectId === project.id) || [];
        
        if (projectDecompts.length === 0) {
          const daysSinceCreation = differenceInDays(today, new Date(project.createdAt));
          if (daysSinceCreation > 15) {
            alertsList.push({
              id: `no-decompte-${project.id}`,
              type: 'warning',
              icon: DollarSign,
              title: 'Aucun décompte créé',
              description: `${project.objet}`,
              action: { label: 'Créer', path: `/projects/${projectId}` },
              projectId: project.id,
              priority: 2,
            });
          }
        } else {
          const lastDecompte = projectDecompts.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0];
          const daysSinceLastDecompte = differenceInDays(today, new Date(lastDecompte.createdAt));
          
          if (daysSinceLastDecompte > 30) {
            alertsList.push({
              id: `old-decompte-${project.id}`,
              type: 'info',
              icon: Receipt,
              title: `Décompte ancien (${daysSinceLastDecompte}j)`,
              description: `${project.objet}`,
              action: { label: 'Nouveau', path: `/projects/${projectId}` },
              projectId: project.id,
              priority: 3,
            });
          }
        }
      }

      // 3. Alerte: Fin de garantie proche
      if (project.dateReceptionProvisoire && !project.dateReceptionDefinitive) {
        const recepDate = new Date(project.dateReceptionProvisoire);
        const garantieEndDate = addMonths(recepDate, 12);
        const daysToGarantie = differenceInDays(garantieEndDate, today);
        
        if (daysToGarantie <= 30 && daysToGarantie >= 0) {
          alertsList.push({
            id: `garantie-${project.id}`,
            type: 'warning',
            icon: Shield,
            title: `Fin garantie dans ${daysToGarantie}j`,
            description: `${project.objet}`,
            action: { label: 'Planifier', path: `/projects/${projectId}/edit` },
            projectId: project.id,
            priority: 2,
          });
        }
      }

      // 4. Alerte: Projet sans bordereau
      if (project.status === 'active') {
        const projectBordereaux = bordereaux?.filter((b) => b.projectId === project.id) || [];
        if (projectBordereaux.length === 0) {
          alertsList.push({
            id: `no-bordereau-${project.id}`,
            type: 'danger',
            icon: FileText,
            title: 'Bordereau manquant',
            description: `${project.objet}`,
            action: { label: 'Créer', path: `/projects/${projectId}` },
            projectId: project.id,
            priority: 1,
          });
        }
      }
    });

    return alertsList.sort((a, b) => a.priority - b.priority);
  }, [projects, decompts, bordereaux]);

  // Projets nécessitant une action
  const projectsNeedingAction = useMemo(() => {
    if (!projects) return [];
    
    return projects
      .filter((p) => p.status === 'active')
      .map((p) => {
        const projectDecompts = decompts?.filter((d) => d.projectId === p.id) || [];
        const lastDecompte = projectDecompts.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        
        // Calculer le montant TTC depuis le bordereau
        const projectBordereaux = bordereaux?.filter((b) => b.projectId === p.id) || [];
        const montantTTC = projectBordereaux.reduce((sum, b) => {
          const montantHT = b.lignes.reduce((s, l) => s + (l.quantite * (l.prixUnitaire || 0)), 0);
          return sum + montantHT * 1.2; // HT * 1.2 = TTC (TVA 20%)
        }, 0);
        
        let urgency = 'normal';
        let reason = '';
        
        if (p.osc && p.delaisExecution) {
          const endDate = addMonths(new Date(p.osc), p.delaisExecution);
          const daysRemaining = differenceInDays(endDate, new Date());
          
          if (daysRemaining < 0) {
            urgency = 'critical';
            reason = `Retard ${Math.abs(daysRemaining)}j`;
          } else if (daysRemaining < 15) {
            urgency = 'high';
            reason = `${daysRemaining}j restants`;
          } else if (daysRemaining < 30) {
            urgency = 'medium';
            reason = `${daysRemaining}j restants`;
          }
        }
        
        return { ...p, lastDecompte, urgency, reason, montantTTC };
      })
      .sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, normal: 3 };
        return (order[a.urgency as keyof typeof order] || 3) - (order[b.urgency as keyof typeof order] || 3);
      })
      .slice(0, 8);
  }, [projects, decompts, bordereaux]);

  const getAlertStyle = (type: Alert['type']) => {
    const styles = {
      danger: 'bg-red-50 border-red-200 text-red-800',
      warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      info: 'bg-blue-50 border-blue-200 text-blue-800',
      success: 'bg-green-50 border-green-200 text-green-800',
    };
    return styles[type];
  };

  const getAlertIconStyle = (type: Alert['type']) => {
    const styles = {
      danger: 'text-red-500',
      warning: 'text-yellow-500',
      info: 'text-blue-500',
      success: 'text-green-500',
    };
    return styles[type];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-600 mt-1">
            Bienvenue, {user?.firstName} ! Voici l'état de vos projets.
          </p>
        </div>
        <Link to="/projects/new" className="btn btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Nouveau projet
        </Link>
      </div>

      {/* Alertes importantes */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">
              Alertes ({alerts.length})
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {alerts.slice(0, 4).map((alert) => {
              const Icon = alert.icon;
              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${getAlertStyle(alert.type)} flex items-start gap-3`}
                >
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${getAlertIconStyle(alert.type)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{alert.title}</p>
                    <p className="text-sm opacity-80 truncate">{alert.description}</p>
                  </div>
                  {alert.action && (
                    <Link
                      to={alert.action.path}
                      className="flex-shrink-0 text-sm font-medium hover:underline flex items-center gap-1"
                    >
                      {alert.action.label}
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          {alerts.length > 4 && (
            <p className="text-sm text-gray-500">
              + {alerts.length - 4} autres alertes
            </p>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500 rounded-xl text-white">
              <FolderKanban className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-blue-700">Total projets</p>
              <p className="text-2xl font-bold text-blue-900">{stats.totalProjects}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-500 rounded-xl text-white">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-green-700">En cours</p>
              <p className="text-2xl font-bold text-green-900">{stats.activeProjects}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500 rounded-xl text-white">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-purple-700">Progression</p>
              <p className="text-2xl font-bold text-purple-900">{stats.averageProgress}%</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-500 rounded-xl text-white">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-orange-700">Budget</p>
              <p className="text-xl font-bold text-orange-900">
                {isNaN(stats.totalBudget) || stats.totalBudget === 0 ? '0' : (stats.totalBudget / 1000000).toFixed(1)}M
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Indicateurs rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card flex items-center gap-3 py-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.upcomingDeadlines}</p>
            <p className="text-xs text-gray-500">Délais proches</p>
          </div>
        </div>

        <div className="card flex items-center gap-3 py-3">
          <div className="p-2 bg-yellow-100 rounded-lg">
            <Receipt className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.projectsNeedingDecompte}</p>
            <p className="text-xs text-gray-500">Besoins décompte</p>
          </div>
        </div>

        <div className="card flex items-center gap-3 py-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.completedProjects}</p>
            <p className="text-xs text-gray-500">Terminés</p>
          </div>
        </div>

        <div className="card flex items-center gap-3 py-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {isNaN(stats.totalRealized) || stats.totalRealized === 0 ? '0' : (stats.totalRealized / 1000000).toFixed(1)}M
            </p>
            <p className="text-xs text-gray-500">Réalisé</p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Projets prioritaires */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Mes projets
            </h2>
            <Link to="/projects" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              Voir tout
            </Link>
          </div>

          {!projects || projects.length === 0 ? (
            <div className="text-center py-8">
              <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-3">Aucun projet</p>
              <Link to="/projects/new" className="btn btn-primary btn-sm inline-flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Créer un projet
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-50 border-y border-blue-200">
                    <th className="py-2 px-3 text-left font-semibold text-blue-900">N° Marché</th>
                    <th className="py-2 px-3 text-left font-semibold text-blue-900">Objet</th>
                    <th className="py-2 px-3 text-left font-semibold text-blue-900">CT</th>
                    <th className="py-2 px-3 text-left font-semibold text-blue-900">Titulaire du marché</th>
                    <th className="py-2 px-3 text-right font-semibold text-blue-900">Montant marché DH</th>
                    <th className="py-2 px-3 text-center font-semibold text-blue-900">Délai du marché</th>
                  </tr>
                </thead>
                <tbody>
                  {projectsNeedingAction.map((project, index) => (
                    <tr
                      key={project.id}
                      onClick={() => navigate(`/projects/${project.id.replace('project:', '')}`)}
                      className={`border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      }`}
                    >
                      <td className="py-3 px-3 font-medium text-gray-900">{project.marcheNo}</td>
                      <td className="py-3 px-3 text-gray-700 max-w-xs">
                        <p className="line-clamp-2">{project.objet}</p>
                      </td>
                      <td className="py-3 px-3 text-gray-600">{project.commune || '-'}</td>
                      <td className="py-3 px-3 text-gray-600">{project.societe || '-'}</td>
                      <td className="py-3 px-3 text-right font-medium text-gray-900">
                        {project.montantTTC > 0 ? project.montantTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center text-gray-600">
                        {project.delaisExecution ? `${String(project.delaisExecution).padStart(2, '0')} Mois` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Résumé financier */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Résumé financier</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Budget total</span>
                <span className="font-medium">{(stats.totalBudget / 1000000).toFixed(2)} M DH</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Montant réalisé</span>
                <span className="font-medium">{(stats.totalRealized / 1000000).toFixed(2)} M DH</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 rounded-full" 
                  style={{ width: `${stats.totalBudget > 0 ? (stats.totalRealized / stats.totalBudget) * 100 : 0}%` }} 
                />
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Reste à réaliser</span>
                <span className="font-medium text-orange-600">
                  {((stats.totalBudget - stats.totalRealized) / 1000000).toFixed(2)} M DH
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Taux de réalisation</span>
                <span className={`font-bold ${
                  stats.totalBudget > 0 && (stats.totalRealized / stats.totalBudget) >= 0.7 
                    ? 'text-green-600' 
                    : stats.totalBudget > 0 && (stats.totalRealized / stats.totalBudget) >= 0.4 
                    ? 'text-yellow-600' 
                    : 'text-red-600'
                }`}>
                  {stats.totalBudget > 0 ? ((stats.totalRealized / stats.totalBudget) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>

            {/* Mini chart - répartition par statut */}
            <div className="pt-3 border-t border-gray-100">
              <p className="text-sm text-gray-600 mb-2">Répartition des projets</p>
              <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                {stats.activeProjects > 0 && (
                  <div 
                    className="bg-green-500" 
                    style={{ width: `${(stats.activeProjects / stats.totalProjects) * 100}%` }}
                    title={`En cours: ${stats.activeProjects}`}
                  />
                )}
                {stats.completedProjects > 0 && (
                  <div 
                    className="bg-blue-500" 
                    style={{ width: `${(stats.completedProjects / stats.totalProjects) * 100}%` }}
                    title={`Terminés: ${stats.completedProjects}`}
                  />
                )}
                {(stats.totalProjects - stats.activeProjects - stats.completedProjects) > 0 && (
                  <div 
                    className="bg-gray-300" 
                    style={{ width: `${((stats.totalProjects - stats.activeProjects - stats.completedProjects) / stats.totalProjects) * 100}%` }}
                    title="Autres"
                  />
                )}
              </div>
              <div className="flex gap-4 mt-2 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  En cours ({stats.activeProjects})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Terminés ({stats.completedProjects})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
