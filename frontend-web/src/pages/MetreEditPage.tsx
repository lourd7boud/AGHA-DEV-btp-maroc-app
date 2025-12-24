import { FC, useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Metre, Periode } from '../db/database';
import { useAuthStore } from '../store/authStore';
import {
  ArrowLeft,
  Save,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
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
  Settings,
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
  cumulPrecedent: number;
}

// ============== MAIN COMPONENT ==============

const MetreEditPage: FC = () => {
  const { projectId: rawProjectId, periodeId: rawPeriodeId } = useParams<{ projectId: string; periodeId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // State
  const [metresQuick, setMetresQuick] = useState<MetreQuick[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showOnlyWithData, setShowOnlyWithData] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isDecompteDernier, setIsDecompteDernier] = useState(false);

  // Normalize IDs - support both formats
  const projectId = rawProjectId?.includes(':') ? rawProjectId : `project:${rawProjectId}`;
  const rawId = rawProjectId?.includes(':') ? rawProjectId.replace('project:', '') : rawProjectId;
  const periodeId = rawPeriodeId?.includes(':') ? rawPeriodeId : `periode:${rawPeriodeId}`;
  const rawPeriodeIdClean = rawPeriodeId?.includes(':') ? rawPeriodeId.replace('periode:', '') : rawPeriodeId;

  // ============== DATA QUERIES ==============

  const project = useLiveQuery(
    async () => {
      let proj = await db.projects.get(projectId);
      if (!proj && rawId) {
        proj = await db.projects.get(rawId);
      }
      return proj;
    },
    [projectId, rawId]
  );

  const periode = useLiveQuery<Periode | undefined>(
    async () => {
      let per = await db.periodes.get(periodeId);
      if (!per && rawPeriodeIdClean) {
        per = await db.periodes.get(rawPeriodeIdClean);
      }
      return per;
    },
    [periodeId, rawPeriodeIdClean]
  );

  const bordereau = useLiveQuery(
    async () => {
      let bord = await db.bordereaux
        .where('projectId')
        .equals(projectId)
        .and((b) => !b.deletedAt)
        .first();
      if (!bord && rawId) {
        bord = await db.bordereaux
          .where('projectId')
          .equals(rawId)
          .and((b) => !b.deletedAt)
          .first();
      }
      return bord;
    },
    [projectId, rawId]
  );

  // Get metres for THIS période only
  const metresForPeriode = useLiveQuery(
    async () => {
      let metres = await db.metres
        .where('periodeId')
        .equals(periodeId)
        .and((m) => !m.deletedAt)
        .toArray();
      if ((!metres || metres.length === 0) && rawPeriodeIdClean) {
        metres = await db.metres
          .where('periodeId')
          .equals(rawPeriodeIdClean)
          .and((m) => !m.deletedAt)
          .toArray();
      }
      return metres;
    },
    [periodeId, rawPeriodeIdClean]
  );

  // Get cumulative metres from previous périodes
  const previousMetres = useLiveQuery(
    async () => {
      if (!periode) return [];
      // Try both projectId formats
      let allPeriodes = await db.periodes
        .where('projectId')
        .equals(projectId)
        .and((p) => !p.deletedAt && p.numero < (periode.numero || 0))
        .toArray();
      
      if (allPeriodes.length === 0 && rawId) {
        allPeriodes = await db.periodes
          .where('projectId')
          .equals(rawId)
          .and((p) => !p.deletedAt && p.numero < (periode.numero || 0))
          .toArray();
      }
      
      const previousPeriodeIds = allPeriodes.map(p => p.id);
      if (previousPeriodeIds.length === 0) return [];

      return db.metres
        .where('periodeId')
        .anyOf(previousPeriodeIds)
        .and((m) => !m.deletedAt)
        .toArray();
    },
    [projectId, rawId, periode]
  );

  // ============== HELPER FUNCTION ==============
  
  // Helper to normalize bordereauLigneId for comparison (handles both with and without prefix)
  const normalizeBordereauLigneId = (id: string): string => {
    if (!id) return '';
    // Remove 'bordereau:' prefix if present
    return id.replace(/^bordereau:/, '');
  };

  // ============== COMPUTED VALUES ==============

  const cumulByBordereauLigne = useMemo(() => {
    const cumul = new Map<string, number>();
    if (!previousMetres) return cumul;

    for (const metre of previousMetres) {
      // Use normalized key for cumulative tracking
      const key = normalizeBordereauLigneId(metre.bordereauLigneId);
      cumul.set(key, (cumul.get(key) || 0) + (metre.totalPartiel || 0));
    }
    return cumul;
  }, [previousMetres]);

  // Get the last période's metres to copy lignes from (for new période)
  const lastPeriodeMetres = useMemo(() => {
    if (!previousMetres || previousMetres.length === 0 || !periode) return new Map();
    
    // Return all previous metres indexed by bordereauLigneId
    // The one with most lignes for each line will be used
    const result = new Map<string, any>();
    for (const metre of previousMetres) {
      const key = normalizeBordereauLigneId(metre.bordereauLigneId);
      const existing = result.get(key);
      // Keep the one with more data
      if (!existing || (metre.lignes && metre.lignes.length > (existing.lignes?.length || 0))) {
        result.set(key, metre);
      }
    }
    return result;
  }, [previousMetres, periode]);

  // ============== INITIALIZATION ==============

  useEffect(() => {
    if (bordereau && metresForPeriode !== undefined) {
      const quickData: MetreQuick[] = bordereau.lignes.map((ligne) => {
        // Get clean bordereau ID without prefix
        const cleanBordereauId = normalizeBordereauLigneId(bordereau.id);
        const ligneId = `${cleanBordereauId}-ligne-${ligne.numero}`;
        
        // Find existing metre for this période and line (compare normalized IDs)
        const existingMetre = metresForPeriode?.find(m => 
          normalizeBordereauLigneId(m.bordereauLigneId) === ligneId
        );
        
        // Get cumul with normalized key
        const cumulPrecedent = cumulByBordereauLigne.get(ligneId) || 0;

        // If no existing metre for this period, copy lignes from previous période
        let lignes: MetreLigneInput[] = [];
        if (existingMetre?.lignes && existingMetre.lignes.length > 0) {
          // Use existing lignes for this période
          lignes = existingMetre.lignes;
        } else if (cumulPrecedent > 0) {
          // Copy lignes from previous période (with new IDs)
          const previousMetre = lastPeriodeMetres.get(ligneId);
          if (previousMetre?.lignes && previousMetre.lignes.length > 0) {
            lignes = previousMetre.lignes.map((l: any, idx: number) => ({
              ...l,
              id: `${ligneId}-mesure-copied-${idx}-${Date.now()}`, // New unique ID
            }));
            console.log(`📋 Copied ${lignes.length} lignes from previous période for line ${ligne.numero}`);
          }
        }

        return {
          bordereauLigneId: ligneId,
          numeroLigne: ligne.numero,
          designation: ligne.designation,
          unite: ligne.unite,
          quantiteBordereau: ligne.quantite,
          prixUnitaire: ligne.prixUnitaire || 0,
          lignes,
          isExpanded: false,
          cumulPrecedent,
        };
      });

      setMetresQuick(quickData);
    }
  }, [bordereau, metresForPeriode, cumulByBordereauLigne, lastPeriodeMetres]);

  useEffect(() => {
    if (periode) {
      setIsDecompteDernier(periode.isDecompteDernier || false);
    }
  }, [periode]);

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
                .map((l, idx) => ({ ...l, numero: idx + 1 })), // Keep original designation, only update numero
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
    if (!user || !projectId || !bordereau || !periode) return;

    setIsSaving(true);

    try {
      const now = new Date().toISOString();

      // Update période if needed
      if (isDecompteDernier !== periode.isDecompteDernier) {
        await db.periodes.update(periode.id, {
          isDecompteDernier,
          updatedAt: now,
        });
        await logSyncOperation('UPDATE', 'periode', periode.id.replace('periode:', ''), { isDecompteDernier }, user.id);
      }

      for (const metreQuick of metresQuick) {
        // Calculate total partiel
        const totalPartiel = metreQuick.lignes.reduce((sum, ligne) => sum + (Number(ligne.partiel) || 0), 0);

        // Skip if no measurements (but keep existing if any)
        if (metreQuick.lignes.length === 0) continue;

        // Calculate cumulative and percentage
        const totalCumule = totalPartiel + (Number(metreQuick.cumulPrecedent) || 0);
        const pourcentage = metreQuick.quantiteBordereau > 0
          ? (totalCumule / metreQuick.quantiteBordereau) * 100
          : 0;

        // Find existing metre for this période and line
        const existingMetre = metresForPeriode?.find(
          (m) => m.bordereauLigneId === metreQuick.bordereauLigneId
        );

        if (existingMetre) {
          // Update existing metre
          await db.metres.update(existingMetre.id, {
            lignes: metreQuick.lignes,
            totalPartiel,
            totalCumule,
            pourcentageRealisation: pourcentage,
            updatedAt: now,
          });

          await logSyncOperation(
            'UPDATE',
            'metre',
            existingMetre.id.replace('metre:', ''),
            {
              lignes: metreQuick.lignes,
              totalPartiel,
              totalCumule,
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
            periodeId: periodeId,
            bordereauLigneId: metreQuick.bordereauLigneId,
            userId: user.id,
            reference: `METRE-P${periode.numero}-L${metreQuick.numeroLigne}`,
            designationBordereau: metreQuick.designation,
            unite: metreQuick.unite,
            lignes: metreQuick.lignes,
            totalPartiel,
            totalCumule,
            quantiteBordereau: metreQuick.quantiteBordereau,
            pourcentageRealisation: pourcentage,
            createdAt: now,
            updatedAt: now,
          };

          await db.metres.add(newMetre);
          await logSyncOperation('CREATE', 'metre', metreId.replace('metre:', ''), newMetre, user.id);
        }
      }

      // Update décompte lignes
      await updateDecompte();

      alert('✅ Métré enregistré avec succès !');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('❌ Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const updateDecompte = async () => {
    if (!user || !bordereau || !periode) return;

    const decompte = await db.decompts
      .where('periodeId')
      .equals(periodeId)
      .first();

    if (!decompte) return;

    const now = new Date().toISOString();
    
    // Build décompte lignes from metres
    const lignes = metresQuick
      .filter(m => m.lignes.length > 0)
      .map(m => {
        const totalPartiel = m.lignes.reduce((sum, l) => sum + (Number(l.partiel) || 0), 0);
        const totalCumule = totalPartiel + (Number(m.cumulPrecedent) || 0);
        
        return {
          prixNo: m.numeroLigne,
          designation: m.designation,
          unite: m.unite,
          quantiteBordereau: m.quantiteBordereau,
          quantiteRealisee: totalCumule,
          prixUnitaireHT: Number(m.prixUnitaire) || 0,
          montantHT: totalCumule * (Number(m.prixUnitaire) || 0),
          bordereauLigneId: m.bordereauLigneId,
        };
      });

    const montantTotal = lignes.reduce((sum, l) => sum + l.montantHT, 0);
    const tauxTVA = periode.tauxTVA || 20;
    const totalTTC = montantTotal * (1 + tauxTVA / 100);

    await db.decompts.update(decompte.id, {
      lignes,
      montantTotal,
      totalTTC,
      updatedAt: now,
    });

    await logSyncOperation('UPDATE', 'decompt', decompte.id.replace('decompt:', ''), { lignes, montantTotal, totalTTC }, user.id);
  };

  // ============== REFRESH FUNCTION ==============

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const rawId = projectId.replace('project:', '');
      await pullLatestData(rawId);
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportAttachement = () => {
    navigate(`/projects/${rawProjectId}/periodes/${rawPeriodeId}/attachement`);
  };

  const handleGoToDecompte = () => {
    navigate(`/projects/${rawProjectId}/decompte/${rawPeriodeId}`);
  };

  // ============== CALCULATIONS ==============

  const getTotalPartiel = () => {
    return metresQuick.reduce((sum, item) => {
      return sum + item.lignes.reduce((s, ligne) => s + ligne.partiel, 0);
    }, 0);
  };

  const getTotalCumule = () => {
    return metresQuick.reduce((sum, item) => {
      const partiel = item.lignes.reduce((s, ligne) => s + (Number(ligne.partiel) || 0), 0);
      return sum + partiel + (Number(item.cumulPrecedent) || 0);
    }, 0);
  };

  const getMontantPartiel = () => {
    return metresQuick.reduce((sum, item) => {
      const totalPartiel = item.lignes.reduce((s, ligne) => s + (Number(ligne.partiel) || 0), 0);
      return sum + (totalPartiel * (Number(item.prixUnitaire) || 0));
    }, 0);
  };

  const getMontantCumule = () => {
    return metresQuick.reduce((sum, item) => {
      const totalPartiel = item.lignes.reduce((s, ligne) => s + (Number(ligne.partiel) || 0), 0);
      const totalCumule = totalPartiel + (Number(item.cumulPrecedent) || 0);
      return sum + (totalCumule * (Number(item.prixUnitaire) || 0));
    }, 0);
  };

  const displayItems = showOnlyWithData
    ? metresQuick.filter((m) => m.lignes.length > 0 || (Number(m.cumulPrecedent) || 0) > 0)
    : metresQuick;

  // ============== LOADING STATES ==============

  if (!project || !periode) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!bordereau) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate(`/projects/${rawProjectId}/metres`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Retour aux métrés
          </button>
        </div>

        <div className="card">
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun bordereau</h3>
            <p className="text-gray-600">Créez d'abord un bordereau</p>
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
          onClick={() => navigate(`/projects/${rawProjectId}/metres`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Retour aux métrés
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">
              Métré N° {periode.numero.toString().padStart(2, '0')}
              {isDecompteDernier && <span className="ml-2 text-lg text-purple-600">(et dernier)</span>}
            </h1>
            <p className="text-gray-700 font-medium">{project.objet}</p>
            <p className="text-sm text-gray-500">
              Marché N° {project.marcheNo} - {project.annee}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
            </button>
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
              onClick={handleGoToDecompte}
              className="btn btn-secondary flex items-center gap-2"
            >
              <DollarSign className="w-4 h-4" />
              Décompte {periode.numero}
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

      {/* Settings Panel */}
      {showSettings && (
        <div className="card mb-6 bg-gray-50 border-2 border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-4">Paramètres du métré</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isDecompteDernier}
              onChange={(e) => setIsDecompteDernier(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-gray-700">Marquer comme décompte dernier (final)</span>
          </label>
        </div>
      )}

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
              <p className="text-2xl font-bold text-gray-900">{getTotalPartiel().toFixed(2)}</p>
              <p className="text-sm text-gray-600">Partiel (ce métré)</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-600">{getTotalCumule().toFixed(2)}</p>
              <p className="text-sm text-gray-600">Cumulé (total)</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {getMontantPartiel().toLocaleString('fr-FR')} MAD
              </p>
              <p className="text-sm text-gray-600">Montant partiel HT</p>
            </div>
          </div>
        </div>
      </div>

      {/* Financial summary */}
      <div className="card mb-6 bg-gradient-to-r from-primary-50 to-blue-50">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Montant Partiel (ce métré)</p>
            <p className="text-xl font-bold text-gray-900">
              {getMontantPartiel().toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Montant Cumulé (total)</p>
            <p className="text-xl font-bold text-primary-600">
              {getMontantCumule().toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD
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
          {showOnlyWithData ? 'Afficher tout' : 'Uniquement avec données'}
        </button>
        <span className="text-sm text-gray-500">
          {displayItems.length} / {metresQuick.length} lignes affichées
        </span>
      </div>

      {/* Main accordion list */}
      <div className="card">
        <div className="space-y-3">
          {displayItems.map((item) => {
            const totalPartiel = item.lignes.reduce((sum, ligne) => sum + (Number(ligne.partiel) || 0), 0);
            const cumulPrecedent = Number(item.cumulPrecedent) || 0;
            const totalCumule = totalPartiel + cumulPrecedent;
            const pourcentage = item.quantiteBordereau > 0
              ? (totalCumule / item.quantiteBordereau) * 100
              : 0;
            const isComplete = pourcentage >= 100;
            const isStarted = totalPartiel > 0 || cumulPrecedent > 0;

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

                  <div className="text-right min-w-32">
                    <div className="text-xs text-gray-500">Bordereau: {item.quantiteBordereau.toLocaleString()}</div>
                    {cumulPrecedent > 0 && (
                      <div className="text-xs text-gray-500">Cumul préc: {cumulPrecedent.toFixed(2)}</div>
                    )}
                    <div className="text-sm font-bold text-primary-600">
                      Partiel: {totalPartiel.toFixed(2)} | Cumul: {totalCumule.toFixed(2)}
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
                                {(Number(ligne.partiel) || 0).toFixed(2)}
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
                              {item.lignes.reduce((sum, l) => sum + (Number(l.partiel) || 0), 0).toFixed(2)}
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

export default MetreEditPage;
