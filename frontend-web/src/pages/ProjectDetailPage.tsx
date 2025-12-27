import { FC, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useProject,
  useBordereaux,
  useDecompts,
  usePhotos,
  usePvs,
  useAttachments,
  usePeriodes,
  useCanModify,
  useMetres,
} from '../hooks/useUnifiedData';
import { isWeb } from '../utils/platform';
import { apiService } from '../services/apiService';
import { assetService, ProjectAsset } from '../services/assetService';
import { db } from '../db/database';
import { logSyncOperation } from '../services/syncService';
import { PhotosTab, PVTab, DocumentsTab } from '../components/project';
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
import { format, isValid, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
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

// Helper function to safely format dates
const safeFormatDate = (dateValue: string | undefined | null, formatStr: string, fallback: string = '-'): string => {
  if (!dateValue) return fallback;
  try {
    const date = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue);
    if (!isValid(date)) return fallback;
    return format(date, formatStr, { locale: fr });
  } catch {
    return fallback;
  }
};

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
  const { canModify, reason: cannotModifyReason } = useCanModify();

  // 🔴 Project Assets state (unified: photos, pv, documents)
  const [projectPhotos, setProjectPhotos] = useState<ProjectAsset[]>([]);
  const [projectPVs, setProjectPVs] = useState<ProjectAsset[]>([]);
  const [projectDocuments, setProjectDocuments] = useState<ProjectAsset[]>([]);
  const [_assetsLoading, setAssetsLoading] = useState(false);

  // Support both formats: with "project:" prefix and without
  const projectId = id?.startsWith('project:') ? id : `project:${id}`;
  const rawId = id?.startsWith('project:') ? id.replace('project:', '') : id;

  // 🔴 استخدام Unified Hooks بدلاً من useLiveQuery
  const { project, isLoading: projectLoading, refresh: refreshProject } = useProject(rawId || null);
  const { bordereaux, refresh: refreshBordereaux } = useBordereaux(rawId || null);
  const { decompts, refresh: refreshDecompts } = useDecompts(rawId || null);
  const { photos: _photos } = usePhotos(rawId || null);
  const { pvs: _pvs } = usePvs(rawId || null);
  const { attachments: _attachments } = useAttachments(rawId || null);
  const { periodes, refresh: refreshPeriodes } = usePeriodes(rawId || null);
  const { metres } = useMetres(rawId || null);

  // 🔴 Load project assets (unified: photos, pv, documents)
  const loadAssets = async () => {
    if (!rawId) return;
    setAssetsLoading(true);
    try {
      const [photosData, pvsData, docsData] = await Promise.all([
        assetService.getPhotos(rawId),
        assetService.getPVs(rawId),
        assetService.getDocuments(rawId),
      ]);
      setProjectPhotos(photosData);
      setProjectPVs(pvsData);
      setProjectDocuments(docsData);
    } catch (error) {
      console.error('Error loading assets:', error);
    } finally {
      setAssetsLoading(false);
    }
  };

  useEffect(() => {
    if (rawId) {
      loadAssets();
    }
  }, [rawId]);

  // Calculer le montant TTC depuis le bordereau
  const montantTTC = bordereaux && bordereaux.length > 0
    ? bordereaux[0].lignes.reduce((sum: number, ligne: any) => {
        const montantHT = ligne.quantite * (ligne.prixUnitaire || 0);
        const montantTTC = montantHT * 1.2; // +20% TVA
        return sum + montantTTC;
      }, 0)
    : 0;

  // حساب نسبة التقدم من الديكونت التراكمي (Cumul)
  const calculateProgress = () => {
    if (!decompts || decompts.length === 0 || montantTTC === 0) return 0;
    
    // إيجاد آخر ديكونت (الأعلى رقماً) - يحتوي على القيم التراكمية
    const dernierDecompte = decompts.reduce((latest: any, d: any) => {
      if (!latest || d.numero > latest.numero) return d;
      return latest;
    }, decompts[0]);
    
    // استخدام totalTTC من آخر ديكونت (هذا هو القيمة التراكمية)
    // لأن كل ديكونت يحتوي على مجموع كل الكميات من البداية
    const montantCumulTTC = dernierDecompte?.totalTTC || dernierDecompte?.montantTotal || dernierDecompte?.montantTTC || 0;
    
    console.log('[PROGRESS] Calcul:', {
      dernierDecompteNumero: dernierDecompte?.numero,
      montantCumulTTC,
      montantMarcheTTC: montantTTC,
      progress: (montantCumulTTC / montantTTC) * 100
    });
    
    // حساب النسبة: (TTC تراكمي / TTC الصفقة) × 100
    const progress = (montantCumulTTC / montantTTC) * 100;
    return progress; // يمكن أن تتجاوز 100% في حالة تجاوز الميزانية
  };

  const projectProgress = calculateProgress();

  const handleDelete = async () => {
    if (!user || !project) return;
    if (!canModify) {
      alert(cannotModifyReason || 'Vous ne pouvez pas modifier les données en mode hors ligne');
      return;
    }
    
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce projet ? Cette action est irréversible.')) {
      return;
    }

    try {
      if (isWeb()) {
        // 🌐 Web: API directe
        await apiService.deleteProject(rawId!);
      } else {
        // 🖥️ Electron: IndexedDB + sync
        await db.projects.update(project.id, {
          deletedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        await logSyncOperation('DELETE', 'project', rawId!, project, user.id);
      }
      navigate('/projects');
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Erreur lors de la suppression du projet');
    }
  };

  // Créer un nouveau bordereau vide
  const handleCreateBlank = async (data: { reference: string; designation: string }) => {
    if (!user || !id) return;
    if (!canModify) {
      alert(cannotModifyReason || 'Vous ne pouvez pas modifier les données en mode hors ligne');
      return;
    }

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

    try {
      if (isWeb()) {
        // 🌐 Web: API directe
        await apiService.createBordereau({
          projectId: rawId,
          reference: data.reference,
          designation: data.designation,
          lignes: [],
        });
        refreshBordereaux();
      } else {
        // 🖥️ Electron: IndexedDB + sync
        await db.bordereaux.add(newBordereau);
        await logSyncOperation('CREATE', 'bordereau', bordereauId.replace('bordereau:', ''), newBordereau, user.id);
      }
    } catch (error) {
      console.error('Error creating bordereau:', error);
      alert('Erreur lors de la création du bordereau');
    }

    setCreateMode(null);
  };

  // إنشاء ميتري جديد مع ديكونت مرتبط (نظام تراكمي)
  const handleCreateNewMetre = async () => {
    if (!user || !id || !bordereaux || bordereaux.length === 0) return;
    if (!canModify) {
      alert(cannotModifyReason || 'Vous ne pouvez pas modifier les données en mode hors ligne');
      return;
    }

    const now = new Date().toISOString();
    
    // 🌐 Web: استخدام API مباشر
    if (isWeb()) {
      try {
        // إنشاء période جديدة
        const periodeRes = await apiService.createPeriode({
          projectId: rawId!,
          numero: (periodes?.length || 0) + 1,
          libelle: `Période ${(periodes?.length || 0) + 1}`,
          dateDebut: now,
          dateFin: now,
          statut: 'en_cours',
        });
        const newPeriodeId = periodeRes.data?.id || periodeRes.id;
        
        // إنشاء décompte مرتبط
        await apiService.createDecompt({
          projectId: rawId,
          periodeId: newPeriodeId,
          numero: (periodes?.length || 0) + 1,
          statut: 'draft',
        });
        
        // Refresh data
        refreshPeriodes();
        refreshDecompts();
        
        // Navigate to metre page
        navigate(`/projects/${rawId}/metre/${newPeriodeId.replace('periode:', '')}`);
      } catch (error) {
        console.error('Error creating new metre:', error);
        alert('Erreur lors de la création du métré');
      }
      return;
    }

    // 🖥️ Electron: IndexedDB + sync
    // حساب رقم الميتري الجديد
    const existingPeriodes = await db.periodes.where('projectId').equals(projectId).and((p: any) => !p.deletedAt).toArray();
    const newNumero = existingPeriodes.length + 1;

    // إنشاء période جديدة
    const periodeId = `periode:${uuidv4()}`;
    const newPeriode = {
      id: periodeId,
      projectId: projectId,
      userId: user.id,
      numero: newNumero,
      libelle: `Période ${newNumero}`,
      dateDebut: now,
      dateFin: now,
      statut: 'en_cours' as const,
      createdAt: now,
      updatedAt: now,
    };
    await db.periodes.add(newPeriode);
    await logSyncOperation('CREATE', 'periode', periodeId.replace('periode:', ''), newPeriode, user.id);

    // 🔴 لا ننسخ البيانات التفصيلية - cumulativeMetresData في MetrePage سيجلبها تلقائياً
    // نحتفظ فقط بـ totalCumule للعرض في القائمة
    if (newNumero > 1) {
      const previousPeriode = existingPeriodes.find(p => p.numero === newNumero - 1);
      if (previousPeriode) {
        const previousMetres = await db.metres
          .where('periodeId')
          .equals(previousPeriode.id)
          .and((m) => !m.deletedAt)
          .toArray();

        // إنشاء سجلات فارغة فقط للاحتفاظ بـ totalCumule
        for (const prevMetre of previousMetres) {
          const newMetreId = `metre:${uuidv4()}`;
          const newMetre = {
            id: newMetreId,
            projectId: projectId,
            periodeId: periodeId,
            bordereauLigneId: prevMetre.bordereauLigneId,
            userId: user.id,
            reference: prevMetre.reference,
            designationBordereau: prevMetre.designationBordereau,
            unite: prevMetre.unite,
            // 🔴 البيانات فارغة - سيتم جلب السابقة من cumulativeMetresData
            sections: [],
            subSections: [],
            lignes: [],
            // الجزئي = 0 (لم نضف شيء جديد بعد)
            totalPartiel: 0,
            // التراكمي = نفس السابق (للعرض في القائمة)
            totalCumule: prevMetre.totalCumule || prevMetre.totalPartiel || 0,
            quantiteBordereau: prevMetre.quantiteBordereau,
            pourcentageRealisation: prevMetre.pourcentageRealisation || 0,
            createdAt: now,
            updatedAt: now,
          };

          await db.metres.add(newMetre);
          await logSyncOperation('CREATE', 'metre', newMetreId.replace('metre:', ''), newMetre, user.id);
        }
      }
    }

    // إنشاء ديكونت مرتبط
    const decomptId = `decompt:${uuidv4()}`;
    
    // حساب المبلغ التراكمي من الفترات السابقة
    let montantCumule = 0;
    if (newNumero > 1) {
      const previousDecomptes = await db.decompts
        .where('projectId')
        .equals(projectId)
        .and((d) => !d.deletedAt)
        .toArray();
      montantCumule = previousDecomptes.reduce((sum, d) => sum + (Number(d.montantTotal) || 0), 0);
    }

    const newDecompt = {
      id: decomptId,
      projectId: projectId,
      periodeId: periodeId,
      userId: user.id,
      numero: newNumero,
      lignes: [],
      montantTotal: 0,
      montantCumule: montantCumule,
      statut: 'draft' as const,
      createdAt: now,
      updatedAt: now,
    };

    await db.decompts.add(newDecompt);
    await logSyncOperation('CREATE', 'decompt', decomptId.replace('decompt:', ''), newDecompt, user.id);

    // الانتقال لصفحة تحرير الميتري مع معرف الـ période
    navigate(`/projects/${rawId}/metre/${periodeId.replace('periode:', '')}`);
  };

  // Handle loading state - show error after timeout if no data
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!project && !projectLoading) {
        setLoadingTimeout(true);
      }
    }, 5000); // 5 seconds timeout
    
    return () => clearTimeout(timer);
  }, [project, projectLoading]);

  if (!project) {
    if (loadingTimeout) {
      return (
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
            <p className="text-gray-700 font-medium mb-2">Projet non trouvé</p>
            <p className="text-gray-500 text-sm mb-4">{isWeb() ? 'Le projet n\'existe pas sur le serveur.' : 'Le projet n\'existe pas localement. Essayez de synchroniser.'}</p>
            <button 
              onClick={() => isWeb() ? refreshProject() : window.location.reload()} 
              className="btn btn-primary"
            >
              {isWeb() ? 'Réessayer' : 'Rafraîchir la page'}
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
    { id: 'metre', label: 'Métré', icon: TrendingUp, count: periodes?.filter((p: any) => {
      // Compter les périodes qui ont des métrés
      const cleanPId = (p.id || '').replace('periode:', '');
      return metres?.some((m: any) => {
        const cleanMPId = (m.periodeId || '').replace('periode:', '');
        return cleanMPId === cleanPId;
      });
    }).length || 0 },
    { id: 'decompt', label: 'Décompte', icon: DollarSign, count: decompts?.length || 0 },
    { id: 'photos', label: 'Photos', icon: Image, count: projectPhotos.length },
    { id: 'pv', label: 'PV', icon: FileText, count: projectPVs.length },
    { id: 'documents', label: 'Documents', icon: Paperclip, count: projectDocuments.length },
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
            Mis à jour le {safeFormatDate(project.updatedAt, 'dd MMMM yyyy à HH:mm')}
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
              <p className="text-2xl font-bold text-gray-900">{projectPhotos.length}</p>
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
                      {safeFormatDate(project.dateOuverture, 'dd/MM/yyyy')}
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
              {((project as any).snss || (project as any).cbn || (project as any).rcn || project.osc) && (
                <div className="card">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Informations administratives
                  </h2>
                  <div className="grid grid-cols-2 gap-6">
                    {(project as any).snss && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">SNSS</p>
                        <p className="font-medium text-gray-900">{(project as any).snss}</p>
                      </div>
                    )}
                    {(project as any).cbn && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">CBN</p>
                        <p className="font-medium text-gray-900">{(project as any).cbn}</p>
                      </div>
                    )}
                    {(project as any).rcn && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">RCN</p>
                        <p className="font-medium text-gray-900">{(project as any).rcn}</p>
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
              {(project.societe || project.patente || (project as any).delaisEntreeService) && (
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
                    {(project as any).delaisEntreeService && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Délais d'entrée en service</p>
                        <p className="font-medium text-gray-900">{(project as any).delaisEntreeService}</p>
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
                        {safeFormatDate(project.createdAt, 'dd/MM/yyyy à HH:mm')}
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
                          {safeFormatDate(project.updatedAt, 'dd/MM/yyyy à HH:mm')}
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
              <BordereauTable 
                bordereauId={bordereaux[0].id} 
                onClose={() => setActiveTab('overview')} 
                onSaved={() => {
                  // Refresh project data after bordereau saved (montant updated)
                  refreshProject();
                  refreshBordereaux();
                }}
              />
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

        {/* Périodes tab removed - redirects to Métré */}

        {activeTab === 'metre' && (
          <>
            {bordereaux && bordereaux.length > 0 ? (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Métrés ({periodes?.length || 0})
                  </h2>
                  {periodes && periodes.length > 0 && (
                    <button
                      onClick={handleCreateNewMetre}
                      className="btn btn-primary inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Nouveau métré
                    </button>
                  )}
                </div>

                {periodes && periodes.length > 0 ? (
                  <div className="grid gap-4">
                    {periodes
                      .sort((a: any, b: any) => b.numero - a.numero)
                      .map((periode: any) => {
                        // 🔴 FIX: حساب المجموع التراكمي الصحيح
                        // = مجموع كل الميتريات من الفترة 1 إلى هذه الفترة
                        const allPreviousAndCurrentMetres = metres?.filter((m: any) => {
                          const metrePeriode = periodes?.find((p: any) => {
                            const cleanPId = (p.id || '').replace('periode:', '');
                            const cleanMPId = (m.periodeId || '').replace('periode:', '');
                            return cleanPId === cleanMPId;
                          });
                          return metrePeriode && metrePeriode.numero <= periode.numero;
                        }) || [];
                        
                        // حساب المجموع التراكمي من كل الفترات السابقة + الحالية
                        const totalCumule = allPreviousAndCurrentMetres.reduce((sum: number, m: any) => {
                          const value = Number(m.totalPartiel) || 0;
                          return sum + value;
                        }, 0);
                        
                        // عدد المقالات في هذه الفترة فقط
                        const cleanPeriodeId = (periode.id || '').replace('periode:', '');
                        const periodeMetres = metres?.filter((m: any) => {
                          const metreCleanPeriodeId = (m.periodeId || '').replace('periode:', '');
                          return metreCleanPeriodeId === cleanPeriodeId;
                        }) || [];
                        
                        return (
                          <div
                            key={periode.id}
                            className="card hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() => navigate(`/projects/${rawId}/metre/${periode.id.replace('periode:', '')}`)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary-100">
                                  <TrendingUp className="w-6 h-6 text-primary-600" />
                                </div>
                                <div>
                                  <h3 className="font-semibold text-gray-900">
                                    Métré N° {periode.numero}
                                  </h3>
                                  <p className="text-sm text-gray-500">
                                    {periode.libelle || `Période ${periode.numero}`}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <p className="text-sm text-gray-500">Total Cumulé</p>
                                  <p className="font-semibold text-gray-900">
                                    {totalCumule.toFixed(2)}
                                  </p>
                                </div>
                                
                                <div className="text-right">
                                  <p className="text-sm text-gray-500">Articles</p>
                                  <p className="font-semibold text-primary-600">
                                    {periodeMetres.length}
                                  </p>
                                </div>
                                
                                <div className="text-right">
                                  <p className="text-sm text-gray-500">Date</p>
                                  <p className="text-sm text-gray-700">
                                    {safeFormatDate(periode.createdAt, 'dd/MM/yyyy')}
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
                      <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun métré créé</h3>
                      <p className="text-gray-600 mb-6">
                        Créez votre premier métré pour commencer à mesurer les travaux
                      </p>
                      <button
                        onClick={handleCreateNewMetre}
                        className="btn btn-primary inline-flex items-center gap-2 px-6 py-3"
                      >
                        <Plus className="w-5 h-5" />
                        Créer le premier métré
                      </button>
                      <p className="text-xs text-gray-500 mt-3">
                        Un décompte sera créé automatiquement avec le métré
                      </p>
                    </div>
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
                  .sort((a: any, b: any) => b.numero - a.numero)
                  .map((decompt: any) => {
                    // 🔴 Normalize periodeId comparison
                    const cleanDecomptPeriodeId = (decompt.periodeId || '').replace('periode:', '');
                    const periode = periodes?.find((p: any) => {
                      const cleanPeriodeId = (p.id || '').replace('periode:', '');
                      return cleanPeriodeId === cleanDecomptPeriodeId;
                    });
                    const isLast = (periode as any)?.isDecompteDernier;
                    
                    // 🔴 Debug log
                    console.log('📋 Décompte click target:', {
                      decomptId: decompt.id,
                      periodeId: decompt.periodeId,
                      cleanPeriodeId: cleanDecomptPeriodeId,
                      navigateTo: `/projects/${rawId}/decompte/${cleanDecomptPeriodeId}`
                    });
                    
                    return (
                      <div
                        key={decompt.id}
                        className="card hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => {
                          if (cleanDecomptPeriodeId) {
                            navigate(`/projects/${rawId}/decompte/${cleanDecomptPeriodeId}`);
                          } else {
                            console.error('❌ Missing periodeId for décompte:', decompt);
                          }
                        }}
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
                                {periode ? `${(periode as any).libelle || `Période ${periode.numero}`}` : 'Période non trouvée'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-sm text-gray-500">Montant HT</p>
                              <p className="font-semibold text-gray-900">
                                {(decompt.montantTotal || decompt.montantHT || 0)?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD
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
                                {safeFormatDate(periode?.dateFin || decompt.createdAt, 'dd/MM/yyyy')}
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
                    Créez des métrés puis générez le décompte pour facturer les travaux exécutés
                  </p>
                  <button 
                    onClick={() => navigate(`/projects/${id}/decompte`)}
                    className="btn btn-primary inline-flex items-center gap-2"
                  >
                    <DollarSign className="w-4 h-4" />
                    Créer un décompte
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'photos' && (
          <PhotosTab 
            projectId={rawId!} 
            photos={projectPhotos} 
            onRefresh={loadAssets} 
          />
        )}

        {activeTab === 'pv' && (
          <PVTab 
            projectId={rawId!} 
            pvs={projectPVs} 
            onRefresh={loadAssets} 
          />
        )}

        {activeTab === 'documents' && (
          <DocumentsTab 
            projectId={rawId!} 
            documents={projectDocuments} 
            onRefresh={loadAssets} 
          />
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
