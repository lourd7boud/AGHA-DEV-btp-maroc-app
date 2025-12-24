import { FC, useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Metre } from '../db/database';
import { useAuthStore } from '../store/authStore';
import {
  ArrowLeft,
  Save,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Download,
  Calculator,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  DollarSign,
  FileText,
  Eye,
  EyeOff,
  RefreshCw,
  Printer,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { logSyncOperation } from '../services/syncService';
import { calculatePartiel, getCalculationType, type UniteType } from '../utils/metreCalculations';
import { pullLatestData } from '../hooks/useSyncManager';

// ============== INTERFACES ==============

interface MetreLigneInput {
  id: string;
  numero: number;
  designation: string;
  nombreSemblables?: number; // Nombre des parties semblables
  longueur?: number;
  largeur?: number;
  profondeur?: number;
  nombre?: number;
  diametre?: number;
  partiel: number;
  observations?: string;
}

interface MetreQuick {
  bordereauLigneId: string;
  numeroLigne: number;
  designation: string;
  unite: string;
  quantiteBordereau: number;
  prixUnitaire: number;
  lignes: MetreLigneInput[];
  isExpanded: boolean;
  // Cumul data from previous periods
  cumulPrecedent: number;
}

// ============== MAIN COMPONENT ==============

const MetrePageV2: FC = () => {
  const { projectId: rawProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // State
  const [metresQuick, setMetresQuick] = useState<MetreQuick[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showOnlyWithData, setShowOnlyWithData] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Normalize project ID
  const projectId = rawProjectId?.includes(':') ? rawProjectId : `project:${rawProjectId}`;

  // ============== DATA QUERIES ==============

  const project = useLiveQuery(
    () => db.projects.get(projectId),
    [projectId]
  );

  const bordereau = useLiveQuery(
    () =>
      db.bordereaux
        .where('projectId')
        .equals(projectId)
        .and((b) => !b.deletedAt)
        .first(),
    [projectId]
  );

  // Get ALL metres for this project (from all periods)
  const allMetres = useLiveQuery(
    () =>
      db.metres
        .where('projectId')
        .equals(projectId)
        .and((m) => !m.deletedAt)
        .toArray(),
    [projectId]
  );

  // ============== HELPER FUNCTION ==============

  // Helper to normalize bordereauLigneId for comparison (handles both with and without prefix)
  const normalizeBordereauLigneId = (id: string): string => {
    if (!id) return '';
    // Remove 'bordereau:' prefix if present
    return id.replace(/^bordereau:/, '');
  };

  // ============== COMPUTED VALUES ==============

  // Group metres by bordereauLigneId and calculate cumulative values
  const metresByCumulatif = useMemo(() => {
    if (!allMetres) return new Map<string, { total: number; metres: Metre[] }>();

    const grouped = new Map<string, { total: number; metres: Metre[] }>();

    for (const metre of allMetres) {
      // Use normalized key for grouping
      const key = normalizeBordereauLigneId(metre.bordereauLigneId);
      if (!grouped.has(key)) {
        grouped.set(key, { total: 0, metres: [] });
      }
      const group = grouped.get(key)!;
      group.metres.push(metre);
      group.total += metre.totalPartiel || 0;
    }

    return grouped;
  }, [allMetres]);

  // ============== INITIALIZATION ==============

  useEffect(() => {
    if (bordereau && allMetres !== undefined) {
      const quickData: MetreQuick[] = bordereau.lignes.map((ligne) => {
        // Get clean bordereau ID without prefix
        const cleanBordereauId = normalizeBordereauLigneId(bordereau.id);
        const ligneId = `${cleanBordereauId}-ligne-${ligne.numero}`;
        const cumulData = metresByCumulatif.get(ligneId);

        // Find the latest metre for this line (to get existing lignes)
        const latestMetre = cumulData?.metres.sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0];

        return {
          bordereauLigneId: ligneId,
          numeroLigne: ligne.numero,
          designation: ligne.designation,
          unite: ligne.unite,
          quantiteBordereau: ligne.quantite,
          prixUnitaire: ligne.prixUnitaire || 0,
          lignes: latestMetre?.lignes || [],
          isExpanded: false,
          cumulPrecedent: cumulData?.total || 0,
        };
      });

      setMetresQuick(quickData);
    }
  }, [bordereau, allMetres, metresByCumulatif]);

  // ============== HANDLERS ==============

  const handleToggleExpand = (bordereauLigneId: string) => {
    setMetresQuick((prev) =>
      prev.map((item) =>
        item.bordereauLigneId === bordereauLigneId
          ? { ...item, isExpanded: !item.isExpanded }
          : item
      )
    );
  };

  const handleAddLigne = (bordereauLigneId: string) => {
    const item = metresQuick.find((m) => m.bordereauLigneId === bordereauLigneId);
    if (!item) return;

    const newLigneNumero = item.lignes.length + 1;

    const newLigne: MetreLigneInput = {
      id: `${bordereauLigneId}-mesure-${Date.now()}`,
      numero: newLigneNumero,
      designation: `Mesure ${newLigneNumero}`,
      partiel: 0,
    };

    setMetresQuick((prev) =>
      prev.map((m) =>
        m.bordereauLigneId === bordereauLigneId
          ? { ...m, lignes: [...m.lignes, newLigne], isExpanded: true }
          : m
      )
    );
  };

  const handleDeleteLigne = (bordereauLigneId: string, ligneId: string) => {
    setMetresQuick((prev) =>
      prev.map((m) =>
        m.bordereauLigneId === bordereauLigneId
          ? {
              ...m,
              lignes: m.lignes
                .filter((l) => l.id !== ligneId)
                .map((l, idx) => ({ ...l, numero: idx + 1, designation: `Mesure ${idx + 1}` })),
            }
          : m
      )
    );
  };

  const handleLigneChange = (
    bordereauLigneId: string,
    ligneId: string,
    field: keyof MetreLigneInput,
    value: string | number
  ) => {
    setMetresQuick((prev) =>
      prev.map((item) => {
        if (item.bordereauLigneId !== bordereauLigneId) return item;

        const updatedLignes = item.lignes.map((ligne) => {
          if (ligne.id !== ligneId) return ligne;

          const updated = { ...ligne, [field]: value };

          // Recalculate partiel if it's a calculation field
          if (['nombreSemblables', 'longueur', 'largeur', 'profondeur', 'nombre', 'diametre'].includes(field)) {
            updated.partiel = calculatePartiel(
              item.unite as UniteType,
              updated.longueur,
              updated.largeur,
              updated.profondeur,
              updated.nombre,
              updated.diametre,
              updated.nombreSemblables
            );
          }

          return updated;
        });

        return { ...item, lignes: updatedLignes };
      })
    );
  };

  // ============== SAVE FUNCTION ==============

  const handleSaveAll = async () => {
    if (!user || !projectId || !bordereau) return;

    setIsSaving(true);

    try {
      const now = new Date().toISOString();

      for (const metreQuick of metresQuick) {
        // Skip if no measurement lines
        if (metreQuick.lignes.length === 0) continue;

        // Calculate total partiel
        const totalPartiel = metreQuick.lignes.reduce((sum, ligne) => sum + ligne.partiel, 0);

        // Calculate percentage - NO LIMIT ON PERCENTAGE
        const pourcentage = metreQuick.quantiteBordereau > 0
          ? (totalPartiel / metreQuick.quantiteBordereau) * 100
          : 0;

        // Find existing metre for this line
        const existingMetre = allMetres?.find(
          (m) => m.bordereauLigneId === metreQuick.bordereauLigneId
        );

        if (existingMetre) {
          // Update existing metre
          await db.metres.update(existingMetre.id, {
            lignes: metreQuick.lignes,
            totalPartiel,
            totalCumule: totalPartiel,
            pourcentageRealisation: pourcentage, // No capping at 100
            updatedAt: now,
          });

          await logSyncOperation(
            'UPDATE',
            'metre',
            existingMetre.id.replace('metre:', ''),
            {
              lignes: metreQuick.lignes,
              totalPartiel,
              totalCumule: totalPartiel,
              pourcentageRealisation: pourcentage,
            },
            user.id
          );
        } else {
          // Create new metre
          const metreId = `metre:${uuidv4()}`;

          const newMetre: Metre = {
            id: metreId,
            projectId: projectId,
            periodeId: '', // Will be linked later if needed
            bordereauLigneId: metreQuick.bordereauLigneId,
            userId: user.id,
            reference: `METRE-L${metreQuick.numeroLigne}`,
            designationBordereau: metreQuick.designation,
            unite: metreQuick.unite,
            lignes: metreQuick.lignes,
            totalPartiel,
            totalCumule: totalPartiel,
            quantiteBordereau: metreQuick.quantiteBordereau,
            pourcentageRealisation: pourcentage, // No capping at 100
            createdAt: now,
            updatedAt: now,
          };

          await db.metres.add(newMetre);
          await logSyncOperation('CREATE', 'metre', metreId.replace('metre:', ''), newMetre, user.id);
        }
      }

      alert('✅ Métrés enregistrés avec succès !');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('❌ Erreur lors de la sauvegarde des métrés');
    } finally {
      setIsSaving(false);
    }
  };

  // ============== REFRESH FUNCTION ==============

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Pull latest data from server
      const rawProjectId = projectId.replace('project:', '');
      await pullLatestData(rawProjectId);
      console.log('✅ Data refreshed from server');
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // ============== ATTACHEMENT EXPORT ==============

  const handleExportAttachement = () => {
    // Navigate to attachement page or generate PDF
    const rawProjectId = projectId.replace('project:', '');
    // For now, open in new window with print dialog
    window.open(`/projects/${rawProjectId}/attachement`, '_blank');
  };

  // ============== CALCULATIONS ==============

  const getTotalRealise = () => {
    return metresQuick.reduce((sum, item) => {
      const totalPartiel = item.lignes.reduce((s, ligne) => s + ligne.partiel, 0);
      return sum + totalPartiel;
    }, 0);
  };

  const getTotalBordereau = () => {
    return metresQuick.reduce((sum, m) => sum + m.quantiteBordereau, 0);
  };

  const getPourcentageGlobal = () => {
    const total = getTotalBordereau();
    return total > 0 ? (getTotalRealise() / total) * 100 : 0;
  };

  const getMontantRealise = () => {
    return metresQuick.reduce((sum, item) => {
      const totalPartiel = item.lignes.reduce((s, ligne) => s + ligne.partiel, 0);
      return sum + (totalPartiel * item.prixUnitaire);
    }, 0);
  };

  const getMontantBordereau = () => {
    return metresQuick.reduce((sum, m) => sum + (m.quantiteBordereau * m.prixUnitaire), 0);
  };

  const getPourcentageFinancier = () => {
    const total = getMontantBordereau();
    return total > 0 ? (getMontantRealise() / total) * 100 : 0;
  };

  // Filter display items
  const displayItems = showOnlyWithData
    ? metresQuick.filter((m) => m.lignes.length > 0)
    : metresQuick;

  // ============== LOADING STATES ==============

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Chargement du projet...</p>
        </div>
      </div>
    );
  }

  if (!bordereau) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Retour au projet
          </button>
        </div>

        <div className="card">
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun bordereau</h3>
            <p className="text-gray-600 mb-4">
              Vous devez d'abord créer un bordereau avant de faire des métrés
            </p>
            <button
              onClick={() => navigate(`/projects/${projectId}/bordereau`)}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Créer le bordereau
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============== RENDER ==============

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(`/projects/${projectId}`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Retour au projet
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Métré</h1>
            <p className="text-gray-700 font-medium">{project.objet}</p>
            <p className="text-sm text-gray-500">
              Marché N° {project.marcheNo} - {project.annee}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="btn btn-secondary flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            <button
              onClick={handleExportAttachement}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Attachement
            </button>
            <button
              onClick={() => navigate(`/projects/${projectId}/decompte`)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <DollarSign className="w-4 h-4" />
              Décompte
            </button>
            <button className="btn btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Exporter
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="btn btn-primary flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Enregistrer
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{bordereau.lignes.length}</p>
              <p className="text-sm text-gray-600">Lignes bordereau</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{getTotalRealise().toFixed(2)}</p>
              <p className="text-sm text-gray-600">Total réalisé</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${getPourcentageGlobal() > 100 ? 'text-orange-600' : 'text-gray-900'}`}>
                {getPourcentageGlobal().toFixed(1)}%
              </p>
              <p className="text-sm text-gray-600">Avancement quantité</p>
              {getPourcentageGlobal() > 100 && (
                <p className="text-xs text-orange-500">Dépassement (normal selon les cas)</p>
              )}
            </div>
          </div>
        </div>

        <div className={`card ${getPourcentageFinancier() > 100 ? 'border-2 border-orange-400 bg-orange-50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${getPourcentageFinancier() > 100 ? 'bg-orange-100 text-orange-600' : 'bg-orange-100 text-orange-600'}`}>
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${getPourcentageFinancier() > 100 ? 'text-orange-600' : 'text-gray-900'}`}>
                {getPourcentageFinancier().toFixed(1)}%
              </p>
              <p className="text-sm text-gray-600">Avancement financier</p>
              {getPourcentageFinancier() > 100 && (
                <p className="text-xs text-orange-500 font-medium">⚠️ Dépassement</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Financial summary */}
      <div className="card mb-6 bg-gradient-to-r from-primary-50 to-blue-50">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Montant Bordereau (HT)</p>
            <p className="text-xl font-bold text-gray-900">
              {getMontantBordereau().toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Montant Réalisé (HT)</p>
            <p className="text-xl font-bold text-primary-600">
              {getMontantRealise().toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
            </p>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => setShowOnlyWithData(!showOnlyWithData)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
            showOnlyWithData
              ? 'bg-primary-100 text-primary-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {showOnlyWithData ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showOnlyWithData ? 'Afficher tout' : 'Uniquement les métrés'}
        </button>
        <span className="text-sm text-gray-500">
          {displayItems.length} / {metresQuick.length} lignes affichées
        </span>
      </div>

      {/* Main accordion list */}
      <div className="card">
        <div className="space-y-3">
          {displayItems.map((item) => {
            const totalPartiel = item.lignes.reduce((sum, ligne) => sum + ligne.partiel, 0);
            const pourcentage = item.quantiteBordereau > 0
              ? (totalPartiel / item.quantiteBordereau) * 100
              : 0;
            const isComplete = pourcentage >= 100;
            const isStarted = totalPartiel > 0;

            const calculationType = getCalculationType(item.unite as UniteType);
            const champs = calculationType?.champs || [];

            return (
              <div
                key={item.bordereauLigneId}
                className={`border rounded-lg overflow-hidden ${
                  isComplete
                    ? pourcentage > 100
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-green-500 bg-green-50'
                    : 'border-gray-200'
                }`}
              >
                {/* Accordion header */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => handleToggleExpand(item.bordereauLigneId)}
                >
                  {item.isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  )}

                  <div className="w-12 text-gray-700 font-bold">{item.numeroLigne}</div>

                  <div className="flex-1 text-gray-900 font-medium">{item.designation}</div>

                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                    {item.unite}
                  </span>

                  <div className="text-right">
                    <div className="text-sm text-gray-600">
                      Bordereau: {Number(item.quantiteBordereau || 0).toLocaleString()}
                    </div>
                    <div className="text-sm font-bold text-primary-600">
                      Réalisé: {Number(totalPartiel || 0).toFixed(2)}
                    </div>
                  </div>

                  <div className="w-32">
                    <div className="flex items-center gap-2">
                      {isComplete ? (
                        pourcentage > 100 ? (
                          <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        )
                      ) : isStarted ? (
                        <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              pourcentage > 100
                                ? 'bg-orange-500'
                                : isComplete
                                ? 'bg-green-500'
                                : pourcentage >= 75
                                ? 'bg-blue-500'
                                : pourcentage >= 50
                                ? 'bg-yellow-500'
                                : 'bg-orange-500'
                            }`}
                            style={{ width: `${Math.min(pourcentage, 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className={`text-xs font-medium w-14 text-right ${pourcentage > 100 ? 'text-orange-600' : 'text-gray-700'}`}>
                        {pourcentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Accordion content */}
                {item.isExpanded && (
                  <div className="border-t border-gray-200 bg-white p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full border border-gray-300">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-300 w-12">
                              N°
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-300">
                              Désignation
                            </th>
                            {/* Colonne Nombre des parties semblables - affichée pour volume, surface et linéaire */}
                            {['M³', 'M²', 'ML', 'M'].includes(item.unite) && (
                              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-16" title="Nombre des parties semblables">
                                Nbre
                              </th>
                            )}
                            {champs.includes('longueur') && (
                              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-24">
                                Longueur (m)
                              </th>
                            )}
                            {champs.includes('largeur') && (
                              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-24">
                                Largeur (m)
                              </th>
                            )}
                            {champs.includes('profondeur') && (
                              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-24">
                                Profondeur (m)
                              </th>
                            )}
                            {champs.includes('nombre') && (
                              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-20">
                                Nombre
                              </th>
                            )}
                            {champs.includes('diametre') && (
                              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-24">
                                Diamètre (mm)
                              </th>
                            )}
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-r border-gray-300 w-28 bg-blue-50">
                              Partiel
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 w-16">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {item.lignes.map((ligne) => (
                            <tr key={ligne.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-700 font-medium border-r border-gray-200">
                                {ligne.numero}
                              </td>
                              <td className="px-3 py-2 border-r border-gray-200">
                                <input
                                  type="text"
                                  value={ligne.designation}
                                  onChange={(e) =>
                                    handleLigneChange(item.bordereauLigneId, ligne.id, 'designation', e.target.value)
                                  }
                                  className="input text-sm w-full"
                                  placeholder="Description..."
                                />
                              </td>
                              {/* Colonne Nombre des parties semblables */}
                              {['M³', 'M²', 'ML', 'M'].includes(item.unite) && (
                                <td className="px-3 py-2 border-r border-gray-200">
                                  <input
                                    type="number"
                                    value={ligne.nombreSemblables || ''}
                                    onChange={(e) =>
                                      handleLigneChange(item.bordereauLigneId, ligne.id, 'nombreSemblables', parseInt(e.target.value) || 1)
                                    }
                                    className="input text-sm text-center w-full"
                                    step="1"
                                    min="1"
                                    placeholder="1"
                                    title="Nombre des parties semblables"
                                  />
                                </td>
                              )}
                              {champs.includes('longueur') && (
                                <td className="px-3 py-2 border-r border-gray-200">
                                  <input
                                    type="number"
                                    value={ligne.longueur || ''}
                                    onChange={(e) =>
                                      handleLigneChange(item.bordereauLigneId, ligne.id, 'longueur', parseFloat(e.target.value) || 0)
                                    }
                                    className="input text-sm text-center w-full"
                                    step="0.01"
                                    placeholder="0.00"
                                  />
                                </td>
                              )}
                              {champs.includes('largeur') && (
                                <td className="px-3 py-2 border-r border-gray-200">
                                  <input
                                    type="number"
                                    value={ligne.largeur || ''}
                                    onChange={(e) =>
                                      handleLigneChange(item.bordereauLigneId, ligne.id, 'largeur', parseFloat(e.target.value) || 0)
                                    }
                                    className="input text-sm text-center w-full"
                                    step="0.01"
                                    placeholder="0.00"
                                  />
                                </td>
                              )}
                              {champs.includes('profondeur') && (
                                <td className="px-3 py-2 border-r border-gray-200">
                                  <input
                                    type="number"
                                    value={ligne.profondeur || ''}
                                    onChange={(e) =>
                                      handleLigneChange(item.bordereauLigneId, ligne.id, 'profondeur', parseFloat(e.target.value) || 0)
                                    }
                                    className="input text-sm text-center w-full"
                                    step="0.01"
                                    placeholder="0.00"
                                  />
                                </td>
                              )}
                              {champs.includes('nombre') && (
                                <td className="px-3 py-2 border-r border-gray-200">
                                  <input
                                    type="number"
                                    value={ligne.nombre || ''}
                                    onChange={(e) =>
                                      handleLigneChange(item.bordereauLigneId, ligne.id, 'nombre', parseInt(e.target.value) || 0)
                                    }
                                    className="input text-sm text-center w-full"
                                    step="1"
                                    placeholder="0"
                                  />
                                </td>
                              )}
                              {champs.includes('diametre') && (
                                <td className="px-3 py-2 border-r border-gray-200">
                                  <input
                                    type="number"
                                    value={ligne.diametre || ''}
                                    onChange={(e) =>
                                      handleLigneChange(item.bordereauLigneId, ligne.id, 'diametre', parseFloat(e.target.value) || 0)
                                    }
                                    className="input text-sm text-center w-full"
                                    step="0.1"
                                    placeholder="0"
                                  />
                                </td>
                              )}
                              <td className="px-3 py-2 text-right font-bold text-primary-600 border-r border-gray-200 bg-blue-50">
                                {ligne.partiel.toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={() => handleDeleteLigne(item.bordereauLigneId, ligne.id)}
                                  className="p-1 text-red-500 hover:bg-red-100 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-100">
                          <tr>
                            <td colSpan={1 + champs.length + 1} className="px-3 py-2 text-right font-semibold text-gray-700 border-r border-gray-300">
                              Total Partiel:
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-primary-700 bg-primary-50 border-r border-gray-300">
                              {item.lignes.reduce((sum, l) => sum + l.partiel, 0).toFixed(2)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="mt-4 flex justify-between">
                      <button
                        onClick={() => handleAddLigne(item.bordereauLigneId)}
                        className="btn btn-secondary flex items-center gap-2 text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Ajouter mesure
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MetrePageV2;
