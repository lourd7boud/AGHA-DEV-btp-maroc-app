import { FC, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Download,
  Share2,
  MoreVertical,
  FolderKanban,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle2,
  FileText,
  Image,
  Paperclip,
  TrendingUp,
  Building2,
  Plus,
  Upload,
  Copy,
  Library,
  FolderOpen,
  ExternalLink,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { logSyncOperation } from '../services/syncService';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import {
  BordereauTable,
  CreateBordereauModal,
  ImportExcelModal,
  TemplateLibraryModal,
  CopyFromProjectModal,
} from '../components/bordereau';
import { openProjectFolder } from '../services/fileSystemService';

type TabType = 'overview' | 'bordereau' | 'periodes' | 'metre' | 'decompt' | 'photos' | 'pv' | 'documents';
type CreateMode = 'blank' | 'template' | 'copy' | 'import' | null;

const ProjectDetailPage: FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showMenu, setShowMenu] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>(null);

  // Support both formats: with "project:" prefix and without
  const projectId = id?.startsWith('project:') ? id : `project:${id}`;
  const rawId = id?.startsWith('project:') ? id.replace('project:', '') : id;

  console.log('🔍 ProjectDetailPage - URL id:', id);
  console.log('🔍 ProjectDetailPage - projectId (with prefix):', projectId);
  console.log('🔍 ProjectDetailPage - rawId (without prefix):', rawId);

  const project = useLiveQuery(async () => {
    console.log('🔍 Searching for project with prefix:', projectId);
    // Try with prefix first
    let proj = await db.projects.get(projectId);
    console.log('🔍 Result with prefix:', proj ? 'FOUND' : 'NOT FOUND');
    
    // If not found, try without prefix
    if (!proj) {
      console.log('🔍 Searching for project without prefix:', rawId);
      proj = await db.projects.get(rawId!);
      console.log('🔍 Result without prefix:', proj ? 'FOUND' : 'NOT FOUND');
    }
    
    // Also log all projects in DB for debugging
    const allProjects = await db.projects.toArray();
    console.log('🔍 All projects in IndexedDB:', allProjects.map(p => ({ id: p.id, objet: p.objet })));
    
    return proj;
  }, [id]);

  // Récupérer les données liées - search both formats
  const bordereaux = useLiveQuery(
    async () => {
      const withPrefix = await db.bordereaux.where('projectId').equals(projectId).and((b) => !b.deletedAt).toArray();
      if (withPrefix.length > 0) return withPrefix;
      return db.bordereaux.where('projectId').equals(rawId!).and((b) => !b.deletedAt).toArray();
    },
    [id]
  );

  const metres = useLiveQuery(
    async () => {
      const withPrefix = await db.metres.where('projectId').equals(projectId).and((m) => !m.deletedAt).toArray();
      if (withPrefix.length > 0) return withPrefix;
      return db.metres.where('projectId').equals(rawId!).and((m) => !m.deletedAt).toArray();
    },
    [id]
  );

  const decompts = useLiveQuery(
    async () => {
      const withPrefix = await db.decompts.where('projectId').equals(projectId).and((d) => !d.deletedAt).toArray();
      if (withPrefix.length > 0) return withPrefix;
      return db.decompts.where('projectId').equals(rawId!).and((d) => !d.deletedAt).toArray();
    },
    [id]
  );

  const photos = useLiveQuery(
    async () => {
      const withPrefix = await db.photos.where('projectId').equals(projectId).and((p) => !p.deletedAt).toArray();
      if (withPrefix.length > 0) return withPrefix;
      return db.photos.where('projectId').equals(rawId!).and((p) => !p.deletedAt).toArray();
    },
    [id]
  );

  const pvs = useLiveQuery(
    async () => {
      const withPrefix = await db.pvs.where('projectId').equals(projectId).and((p) => !p.deletedAt).toArray();
      if (withPrefix.length > 0) return withPrefix;
      return db.pvs.where('projectId').equals(rawId!).and((p) => !p.deletedAt).toArray();
    },
    [id]
  );

  const attachments = useLiveQuery(
    async () => {
      const withPrefix = await db.attachments.where('projectId').equals(projectId).and((a) => !a.deletedAt).toArray();
      if (withPrefix.length > 0) return withPrefix;
      return db.attachments.where('projectId').equals(rawId!).and((a) => !a.deletedAt).toArray();
    },
    [id]
  );

  const periodes = useLiveQuery(
    async () => {
      const withPrefix = await db.periodes.where('projectId').equals(projectId).and((p) => !p.deletedAt).toArray();
      if (withPrefix.length > 0) return withPrefix;
      return db.periodes.where('projectId').equals(rawId!).and((p) => !p.deletedAt).toArray();
    },
    [id]
  );

  // Calculer le montant TTC depuis le bordereau
  const montantTTC = bordereaux && bordereaux.length > 0
    ? bordereaux[0].lignes.reduce((sum, ligne) => {
        const montantHT = ligne.quantite * (ligne.prixUnitaire || 0);
        const montantTTC = montantHT * 1.2; // +20% TVA
        return sum + montantTTC;
      }, 0)
    : 0;

  // حساب نسبة التقدم من آخر ديكونت
  const calculateProgress = () => {
    if (!decompts || decompts.length === 0 || montantTTC === 0) return 0;
    
    // إيجاد آخر ديكونت (الأعلى رقماً)
    const dernierDecompte = decompts.reduce((latest, d) => {
      if (!latest || d.numero > latest.numero) return d;
      return latest;
    }, decompts[0]);
    
    // استخدام totalTTC إن وجد، وإلا montantTotal
    const montantDecompte = (dernierDecompte as any)?.totalTTC || dernierDecompte?.montantTotal || 0;
    
    // حساب النسبة
    const progress = (montantDecompte / montantTTC) * 100;
    return Math.min(100, Math.max(0, progress)); // بين 0 و 100
  };

  const projectProgress = calculateProgress();

  const handleDelete = async () => {
    if (!user || !project) return;
    
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce projet ? Cette action est irréversible.')) {
      return;
    }

    await db.projects.update(project.id, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await logSyncOperation('DELETE', 'project', id!, project, user.id);
    navigate('/projects');
  };

  // Créer un nouveau bordereau vide
  const handleCreateBlank = async (data: { reference: string; designation: string }) => {
    if (!user || !id) return;

    const bordereauId = `bordereau:${uuidv4()}`;
    const now = new Date().toISOString();

    const newBordereau = {
      id: bordereauId,
      projectId: projectId, // Use normalized projectId
      userId: user.id,
      reference: data.reference,
      designation: data.designation,
      lignes: [],
      montantTotal: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.bordereaux.add(newBordereau);
    await logSyncOperation('CREATE', 'bordereau', bordereauId.replace('bordereau:', ''), newBordereau, user.id);

    setCreateMode(null);
  };

  // Handle loading state - show error after timeout if no data
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!project) {
        setLoadingTimeout(true);
      }
    }, 5000); // 5 seconds timeout
    
    return () => clearTimeout(timer);
  }, [project]);

  if (!project) {
    if (loadingTimeout) {
      return (
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
            <p className="text-gray-700 font-medium mb-2">Projet non trouvé</p>
            <p className="text-gray-500 text-sm mb-4">Le projet n'existe pas localement. Essayez de synchroniser.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="btn btn-primary"
            >
              Rafraîchir la page
            </button>
          </div>
        </div>
      );
    }
    
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Vue d\'ensemble', icon: FolderKanban, count: null },
    { id: 'bordereau', label: 'Bordereau', icon: FileText, count: bordereaux && bordereaux.length > 0 ? 1 : 0 },
    { id: 'periodes', label: 'Périodes', icon: Calendar, count: null },
    { id: 'metre', label: 'Métré', icon: TrendingUp, count: metres?.length || 0 },
    { id: 'decompt', label: 'Décompte', icon: DollarSign, count: decompts?.length || 0 },
    { id: 'photos', label: 'Photos', icon: Image, count: photos?.length || 0 },
    { id: 'pv', label: 'PV', icon: FileText, count: pvs?.length || 0 },
    { id: 'documents', label: 'Documents', icon: Paperclip, count: attachments?.length || 0 },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'completed':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'archived':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Clock className="w-4 h-4" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Retour aux projets</span>
        </button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">Marché N° {project.marcheNo}</h1>
              <span
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border ${getStatusColor(
                  project.status
                )}`}
              >
                {getStatusIcon(project.status)}
                {t(`project.status.${project.status}`)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {project.annee}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <DollarSign className="w-4 h-4" />
                {montantTTC.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD (TTC)
              </span>
              {project.societe && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-4 h-4" />
                    {project.societe}
                  </span>
                </>
              )}
            </div>
            {/* Objet du marché */}
            <p className="text-gray-600 mt-2 line-clamp-2" title={project.objet}>
              {project.objet}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button className="btn btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Exporter
            </button>
            <Link to={`/projects/${id}/edit`} className="btn btn-primary flex items-center gap-2">
              <Edit2 className="w-4 h-4" />
              Modifier
            </Link>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <MoreVertical className="w-5 h-5 text-gray-600" />
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                  <button className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                    <Share2 className="w-4 h-4" />
                    Partager
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Progression du projet</span>
          <span className={`text-2xl font-bold ${projectProgress > 100 ? 'text-red-600' : 'text-primary-600'}`}>
            {projectProgress.toFixed(1)}%
          </span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              projectProgress > 100 
                ? 'bg-gradient-to-r from-red-500 to-red-600' 
                : projectProgress > 80 
                  ? 'bg-gradient-to-r from-yellow-500 to-yellow-600'
                  : 'bg-gradient-to-r from-primary-500 to-primary-600'
            }`}
            style={{ width: `${Math.min(100, projectProgress)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between items-center">
          <span className="text-xs text-gray-500">
            Mis à jour le {format(new Date(project.updatedAt), 'dd MMMM yyyy à HH:mm', { locale: fr })}
          </span>
          {projectProgress > 100 && (
            <span className="text-xs text-red-500 font-medium">⚠️ Dépassement du budget!</span>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{bordereaux && bordereaux.length > 0 ? '1' : '0'}</p>
              <p className="text-sm text-gray-600">Bordereau</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{metres?.length || 0}</p>
              <p className="text-sm text-gray-600">Métrés</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{decompts?.length || 0}</p>
              <p className="text-sm text-gray-600">Décomptes</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 text-yellow-600 rounded-lg">
              <Image className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{photos?.length || 0}</p>
              <p className="text-sm text-gray-600">Photos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== null && (
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      activeTab === tab.id
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Informations générales */}
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Informations générales</h2>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Objet du marché</p>
                    <p className="font-medium text-gray-900">{project.objet}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Numéro de marché</p>
                    <p className="font-medium text-gray-900">{project.marcheNo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Année</p>
                    <p className="font-medium text-gray-900">{project.annee}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Date d'ouverture</p>
                    <p className="font-medium text-gray-900">
                      {format(new Date(project.dateOuverture), 'dd/MM/yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Montant (TTC)</p>
                    <p className="font-medium text-primary-600 text-lg">
                      {montantTTC.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Statut</p>
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full border ${getStatusColor(
                        project.status
                      )}`}
                    >
                      {getStatusIcon(project.status)}
                      {t(`project.status.${project.status}`)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Informations administratives */}
              {(project.snss || project.cbn || project.rcn || project.osc) && (
                <div className="card">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Informations administratives
                  </h2>
                  <div className="grid grid-cols-2 gap-6">
                    {project.snss && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">SNSS</p>
                        <p className="font-medium text-gray-900">{project.snss}</p>
                      </div>
                    )}
                    {project.cbn && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">CBN</p>
                        <p className="font-medium text-gray-900">{project.cbn}</p>
                      </div>
                    )}
                    {project.rcn && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">RCN</p>
                        <p className="font-medium text-gray-900">{project.rcn}</p>
                      </div>
                    )}
                    {project.osc && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">OSC</p>
                        <p className="font-medium text-gray-900">{project.osc}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Informations société */}
              {(project.societe || project.patente || project.delaisEntreeService) && (
                <div className="card">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Informations de la société</h2>
                  <div className="grid grid-cols-2 gap-6">
                    {project.societe && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Nom de la société</p>
                        <p className="font-medium text-gray-900">{project.societe}</p>
                      </div>
                    )}
                    {project.patente && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Patente</p>
                        <p className="font-medium text-gray-900">{project.patente}</p>
                      </div>
                    )}
                    {project.delaisEntreeService && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Délais d'entrée en service</p>
                        <p className="font-medium text-gray-900">{project.delaisEntreeService}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Timeline */}
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Chronologie</h2>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Projet créé</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(project.createdAt), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                      </p>
                    </div>
                  </div>

                  {project.updatedAt !== project.createdAt && (
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                        <Edit2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">Dernière modification</p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(project.updatedAt), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions rapides</h2>
                <div className="space-y-2">
                  <button 
                    onClick={() => navigate(`/projects/${id}/bordereau`)}
                    className="w-full btn btn-secondary text-left flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Ajouter un bordereau
                  </button>
                  <button className="w-full btn btn-secondary text-left flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Ajouter des photos
                  </button>
                  <button className="w-full btn btn-secondary text-left flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Joindre un document
                  </button>
                </div>
              </div>

              {/* Storage Info */}
              <div className="card bg-gradient-to-br from-primary-50 to-primary-100 border-primary-200">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-primary-600 text-white rounded-lg flex items-center justify-center">
                    <FolderKanban className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 mb-1">Dossier du projet</p>
                    <p className="text-sm text-gray-600 mb-2">{project.folderPath || `${project.annee}/${project.marcheNo}`}</p>
                    <button
                      onClick={() => openProjectFolder(project.folderPath || `${project.annee}/${project.marcheNo}`)}
                      className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Ouvrir le dossier
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'bordereau' && (
          <>
            {bordereaux && bordereaux.length > 0 ? (
              /* Afficher directement le BordereauTable */
              <BordereauTable bordereauId={bordereaux[0].id} onClose={() => setActiveTab('overview')} />
            ) : (
              /* Afficher les options de création */
              <div className="card">
                <div className="text-center py-8 mb-6">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Créer le bordereau</h2>
                  <p className="text-gray-600">Choisissez la méthode qui vous convient</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <button
                    onClick={() => setCreateMode('blank')}
                    className="card hover:shadow-lg transition-all border-2 border-transparent hover:border-primary-500 cursor-pointer"
                  >
                    <div className="text-center py-6">
                      <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Plus className="w-6 h-6" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">Nouveau vide</h3>
                      <p className="text-sm text-gray-600">Créer un bordereau depuis zéro</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setCreateMode('template')}
                    className="card hover:shadow-lg transition-all border-2 border-transparent hover:border-primary-500 cursor-pointer"
                  >
                    <div className="text-center py-6">
                      <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Library className="w-6 h-6" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">Depuis bibliothèque</h3>
                      <p className="text-sm text-gray-600">Utiliser des articles prédéfinis</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setCreateMode('copy')}
                    className="card hover:shadow-lg transition-all border-2 border-transparent hover:border-primary-500 cursor-pointer"
                  >
                    <div className="text-center py-6">
                      <div className="w-12 h-12 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Copy className="w-6 h-6" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">Copier un projet</h3>
                      <p className="text-sm text-gray-600">Dupliquer depuis un projet existant</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setCreateMode('import')}
                    className="card hover:shadow-lg transition-all border-2 border-transparent hover:border-primary-500 cursor-pointer"
                  >
                    <div className="text-center py-6">
                      <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Upload className="w-6 h-6" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">Importer Excel</h3>
                      <p className="text-sm text-gray-600">Charger un fichier Excel existant</p>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'periodes' && (
          <div className="card">
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Gestion des périodes</h3>
              <p className="text-gray-600 mb-4">
                Organisez vos métrés et décomptes par période
              </p>
              <button
                onClick={() => navigate(`/projects/${id}/periodes`)}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Gérer les périodes
              </button>
            </div>
          </div>
        )}

        {activeTab === 'metre' && (
          <>
            {bordereaux && bordereaux.length > 0 ? (
              <div className="card">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Métrés du projet</h3>
                  <button
                    onClick={() => navigate(`/projects/${id}/metre`)}
                    className="btn btn-primary inline-flex items-center gap-2"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Gérer les métrés
                  </button>
                </div>

                {metres && metres.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b-2 border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Référence</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Désignation</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Unité</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Qté Partielle</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Qté Cumulée</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">% Réalisation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {metres.map((metre) => (
                          <tr key={metre.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-700">{metre.reference}</td>
                            <td className="px-4 py-3 text-gray-900">{metre.designationBordereau}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                {metre.unite}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {metre.totalPartiel.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-primary-600">
                              {metre.totalCumule.toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 ${
                                      metre.pourcentageRealisation >= 100
                                        ? 'bg-green-500'
                                        : metre.pourcentageRealisation >= 75
                                        ? 'bg-blue-500'
                                        : metre.pourcentageRealisation >= 50
                                        ? 'bg-yellow-500'
                                        : 'bg-orange-500'
                                    }`}
                                    style={{ width: `${Math.min(metre.pourcentageRealisation, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium text-gray-700 w-12 text-right">
                                  {metre.pourcentageRealisation.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600">Aucun métré créé</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Cliquez sur "Gérer les métrés" pour commencer
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="card">
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Bordereau requis</h3>
                  <p className="text-gray-600 mb-4">
                    Vous devez d'abord créer un bordereau avant de faire des métrés
                  </p>
                  <button
                    onClick={() => navigate(`/projects/${id}/bordereau`)}
                    className="btn btn-primary inline-flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Créer le bordereau
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'decompt' && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Décomptes ({decompts?.length || 0})
              </h2>
            </div>

            {decompts && decompts.length > 0 ? (
              <div className="grid gap-4">
                {decompts
                  .sort((a, b) => b.numero - a.numero)
                  .map((decompt) => {
                    const periode = periodes?.find(p => p.id === decompt.periodeId);
                    const isLast = periode?.isDecompteDernier;
                    
                    return (
                      <div
                        key={decompt.id}
                        className="card hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => navigate(`/projects/${id}/periodes/${decompt.periodeId.replace('periode:', '')}/decompte`)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                              isLast ? 'bg-green-100' : 'bg-primary-100'
                            }`}>
                              <DollarSign className={`w-6 h-6 ${isLast ? 'text-green-600' : 'text-primary-600'}`} />
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900">
                                Décompte N° {decompt.numero}
                                {isLast && (
                                  <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                                    et dernier
                                  </span>
                                )}
                              </h3>
                              <p className="text-sm text-gray-500">
                                {periode ? `${periode.libelle}` : 'Période non trouvée'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-sm text-gray-500">Montant HT</p>
                              <p className="font-semibold text-gray-900">
                                {decompt.montantTotal?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD
                              </p>
                            </div>
                            
                            <div className="text-right">
                              <p className="text-sm text-gray-500">Statut</p>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                decompt.statut === 'validated' ? 'bg-green-100 text-green-800' :
                                decompt.statut === 'submitted' ? 'bg-blue-100 text-blue-800' :
                                decompt.statut === 'paid' ? 'bg-purple-100 text-purple-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {decompt.statut === 'validated' ? 'Validé' :
                                 decompt.statut === 'submitted' ? 'Soumis' :
                                 decompt.statut === 'paid' ? 'Payé' : 'Brouillon'}
                              </span>
                            </div>
                            
                            <div className="text-right">
                              <p className="text-sm text-gray-500">Date</p>
                              <p className="text-sm text-gray-700">
                                {format(new Date(decompt.createdAt), 'dd/MM/yyyy', { locale: fr })}
                              </p>
                            </div>
                            
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="card">
                <div className="text-center py-12">
                  <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun décompte</h3>
                  <p className="text-gray-600 mb-4">
                    Créez des périodes puis des décomptes pour facturer les travaux exécutés
                  </p>
                  <button 
                    onClick={() => setActiveTab('periodes')}
                    className="btn btn-primary inline-flex items-center gap-2"
                  >
                    <Calendar className="w-4 h-4" />
                    Voir les périodes
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'photos' && (
          <div className="card">
            <div className="text-center py-12">
              <Image className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune photo</h3>
              <p className="text-gray-600 mb-4">
                Ajoutez des photos pour documenter l'avancement du projet
              </p>
              <button className="btn btn-primary inline-flex items-center gap-2">
                <Image className="w-4 h-4" />
                Ajouter des photos
              </button>
            </div>
          </div>
        )}

        {activeTab === 'pv' && (
          <div className="card">
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun PV</h3>
              <p className="text-gray-600 mb-4">
                Gérez vos procès-verbaux (installation, réception, constat...)
              </p>
              <button className="btn btn-primary inline-flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Créer un PV
              </button>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="card">
            <div className="text-center py-12">
              <Paperclip className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun document</h3>
              <p className="text-gray-600 mb-4">
                Attachez vos factures, plans, et autres documents importants
              </p>
              <button className="btn btn-primary inline-flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                Joindre un document
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals pour la création de bordereau */}
      {createMode === 'blank' && (
        <CreateBordereauModal
          onClose={() => setCreateMode(null)}
          onCreate={handleCreateBlank}
        />
      )}

      {createMode === 'template' && (
        <TemplateLibraryModal
          projectId={id!}
          onClose={() => setCreateMode(null)}
          onCreated={() => setCreateMode(null)}
        />
      )}

      {createMode === 'copy' && (
        <CopyFromProjectModal
          currentProjectId={id!}
          onClose={() => setCreateMode(null)}
          onCopied={() => setCreateMode(null)}
        />
      )}

      {createMode === 'import' && (
        <ImportExcelModal
          projectId={id!}
          onClose={() => setCreateMode(null)}
          onImported={() => setCreateMode(null)}
        />
      )}
    </div>
  );
};

export default ProjectDetailPage;
