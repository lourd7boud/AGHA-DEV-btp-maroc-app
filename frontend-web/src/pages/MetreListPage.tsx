import { FC, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Periode, Decompt } from '../db/database';
import { useAuthStore } from '../store/authStore';
import {
  ArrowLeft,
  Plus,
  FileText,
  TrendingUp,
  DollarSign,
  ChevronRight,
  RefreshCw,
  Calendar,
  CheckCircle2,
  Clock,
  Printer,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { logSyncOperation } from '../services/syncService';
import { pullLatestData } from '../hooks/useSyncManager';

// ============== MAIN COMPONENT ==============

const MetreListPage: FC = () => {
  const { projectId: rawProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Normalize project ID - support both formats
  const projectId = rawProjectId?.includes(':') ? rawProjectId : `project:${rawProjectId}`;
  const rawId = rawProjectId?.includes(':') ? rawProjectId.replace('project:', '') : rawProjectId;

  // ============== DATA QUERIES ==============

  const project = useLiveQuery(
    async () => {
      // Try with prefix first
      let proj = await db.projects.get(projectId);
      // If not found, try without prefix
      if (!proj && rawId) {
        proj = await db.projects.get(rawId);
      }
      return proj;
    },
    [projectId, rawId]
  );

  const bordereau = useLiveQuery(
    async () => {
      // Try with prefix first
      let bord = await db.bordereaux
        .where('projectId')
        .equals(projectId)
        .and((b) => !b.deletedAt)
        .first();
      // If not found, try without prefix
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

  // Get all périodes (Métré sessions) for this project
  const periodes = useLiveQuery(
    async () => {
      // Try with prefix first
      let periods = await db.periodes
        .where('projectId')
        .equals(projectId)
        .and((p) => !p.deletedAt)
        .sortBy('numero');
      // If not found, try without prefix
      if ((!periods || periods.length === 0) && rawId) {
        periods = await db.periodes
          .where('projectId')
          .equals(rawId)
          .and((p) => !p.deletedAt)
          .sortBy('numero');
      }
      return periods;
    },
    [projectId, rawId]
  );

  // Get all décomptes for this project
  const decomptes = useLiveQuery(
    async () => {
      let decomps = await db.decompts
        .where('projectId')
        .equals(projectId)
        .and((d: Decompt) => !d.deletedAt)
        .toArray();
      if ((!decomps || decomps.length === 0) && rawId) {
        decomps = await db.decompts
          .where('projectId')
          .equals(rawId)
          .and((d: Decompt) => !d.deletedAt)
          .toArray();
      }
      return decomps;
    },
    [projectId, rawId]
  );

  // Get all metres to calculate totals per période
  const allMetres = useLiveQuery(
    async () => {
      let metres = await db.metres
        .where('projectId')
        .equals(projectId)
        .and((m) => !m.deletedAt)
        .toArray();
      if ((!metres || metres.length === 0) && rawId) {
        metres = await db.metres
          .where('projectId')
          .equals(rawId)
          .and((m) => !m.deletedAt)
          .toArray();
      }
      return metres;
    },
    [projectId, rawId]
  );

  // ============== HANDLERS ==============

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

  const handleCreateMetre = async () => {
    if (!user || !projectId || !bordereau) return;

    setIsCreating(true);
    try {
      const now = new Date().toISOString();
      const nextNumero = (periodes?.length || 0) + 1;

      // 1. Create new Période (Métré session)
      const periodeId = `periode:${uuidv4()}`;
      const newPeriode: Periode = {
        id: periodeId,
        projectId: projectId,
        userId: user.id,
        numero: nextNumero,
        libelle: `Métré ${nextNumero}`,
        dateDebut: now.split('T')[0],
        dateFin: now.split('T')[0],
        statut: 'en_cours',
        isDecompteDernier: false,
        tauxTVA: 20,
        tauxRetenue: 10,
        createdAt: now,
        updatedAt: now,
      };

      await db.periodes.add(newPeriode);
      await logSyncOperation('CREATE', 'periode', periodeId.replace('periode:', ''), newPeriode, user.id);

      // 2. Create associated Décompte automatically
      const decompteId = `decompt:${uuidv4()}`;
      const newDecompte: Decompt = {
        id: decompteId,
        projectId: projectId,
        periodeId: periodeId,
        userId: user.id,
        numero: nextNumero,
        lignes: [],
        montantTotal: 0,
        totalTTC: 0,
        statut: 'draft',
        createdAt: now,
        updatedAt: now,
      };

      await db.decompts.add(newDecompte);
      await logSyncOperation('CREATE', 'decompt', decompteId.replace('decompt:', ''), newDecompte, user.id);

      // 3. Navigate to the new Métré edit page
      navigate(`/projects/${rawProjectId}/metre/${periodeId.replace('periode:', '')}`);

    } catch (error) {
      console.error('Error creating métré:', error);
      alert('❌ Erreur lors de la création du métré');
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenMetre = (periodeId: string) => {
    const rawPeriodeId = periodeId.replace('periode:', '');
    navigate(`/projects/${rawProjectId}/metre/${rawPeriodeId}`);
  };

  const handleExportAttachement = (periodeId: string) => {
    const rawPeriodeId = periodeId.replace('periode:', '');
    window.open(`/projects/${rawProjectId}/periodes/${rawPeriodeId}/attachement`, '_blank');
  };

  // ============== CALCULATIONS ==============

  // Calculate Montant Global du Marché TTC from bordereau
  const getMontantMarcheTTC = () => {
    if (!bordereau) return 0;
    const montantHT = bordereau.lignes.reduce((sum, ligne) => {
      return sum + (Number(ligne.quantite) || 0) * (Number(ligne.prixUnitaire) || 0);
    }, 0);
    return montantHT * 1.2; // TTC = HT + 20% TVA
  };

  const montantMarcheTTC = getMontantMarcheTTC();

  const getMetreTotals = (periodeId: string) => {
    if (!allMetres || !bordereau) return { totalPartiel: 0, avancement: 0, montantHT: 0, montantTTC: 0 };

    const metresForPeriode = allMetres.filter(m => m.periodeId === periodeId);
    
    let montantHT = 0;

    // Helper to normalize bordereauLigneId
    const normalizeBordereauLigneId = (id: string): string => {
      if (id.includes('-ligne-')) {
        const match = id.match(/ligne-(\d+)/);
        return match ? match[1] : id;
      }
      return id;
    };

    metresForPeriode.forEach(metre => {
      const metreLineNum = normalizeBordereauLigneId(metre.bordereauLigneId);
      const ligne = bordereau.lignes.find(l => 
        String(l.numero) === metreLineNum || 
        `${bordereau.id}-ligne-${l.numero}` === metre.bordereauLigneId
      );
      
      if (ligne) {
        const prixUnitaire = Number(ligne.prixUnitaire) || 0;
        const totalPartiel = Number(metre.totalPartiel) || 0;
        montantHT += totalPartiel * prixUnitaire;
      }
    });

    const montantTTC = montantHT * 1.2; // TVA 20%
    
    // Avancement = Total Général TTC (décompte) / Montant Global Marché TTC × 100
    // For this métré, we use the TTC amount calculated
    const avancement = montantMarcheTTC > 0 ? (montantTTC / montantMarcheTTC) * 100 : 0;

    return { 
      totalPartiel: metresForPeriode.reduce((sum, m) => sum + (Number(m.totalPartiel) || 0), 0),
      avancement: isNaN(avancement) ? 0 : avancement, 
      montantHT: isNaN(montantHT) ? 0 : montantHT,
      montantTTC: isNaN(montantTTC) ? 0 : montantTTC
    };
  };

  // Calculate cumulative avancement up to a specific période
  const getCumulativeAvancement = (periodeId: string) => {
    if (!periodes || !decomptes) return 0;
    
    const targetPeriode = periodes.find(p => p.id === periodeId);
    if (!targetPeriode) return 0;

    // Find the décompte for this période to get its Total TTC
    const decompte = decomptes.find(d => d.periodeId === periodeId);
    if (!decompte) return 0;

    // Use totalTTC from décompte (this is Total Général TTC)
    const totalTTC = Number(decompte.totalTTC) || 0;
    
    // Avancement = Total Général TTC / Montant Global Marché TTC × 100
    const avancement = montantMarcheTTC > 0 ? (totalTTC / montantMarcheTTC) * 100 : 0;
    
    return isNaN(avancement) ? 0 : avancement;
  };

  const getDecompteForPeriode = (periodeId: string): Decompt | undefined => {
    return decomptes?.find((d: Decompt) => d.periodeId === periodeId);
  };

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'en_cours':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1">
          <Clock className="w-3 h-3" /> En cours
        </span>;
      case 'validee':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Validé
        </span>;
      case 'facturee':
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 flex items-center gap-1">
          <DollarSign className="w-3 h-3" /> Facturé
        </span>;
      default:
        return null;
    }
  };

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
      <div className="max-w-4xl mx-auto">
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
    <div className="max-w-4xl mx-auto">
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Métrés</h1>
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
              onClick={handleCreateMetre}
              disabled={isCreating}
              className="btn btn-primary flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Ajouter Métré {(periodes?.length || 0) + 1}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Liste des Métrés */}
      {!periodes || periodes.length === 0 ? (
        <div className="card">
          <div className="text-center py-16">
            <TrendingUp className="w-20 h-20 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">Aucun métré</h3>
            <p className="text-gray-600 mb-6">
              Commencez par créer votre premier métré pour ce projet
            </p>
            <button
              onClick={handleCreateMetre}
              disabled={isCreating}
              className="btn btn-primary btn-lg inline-flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Créer Métré 1
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {periodes.map((periode) => {
            const totals = getMetreTotals(periode.id);
            const decompte = getDecompteForPeriode(periode.id);
            const avancement = getCumulativeAvancement(periode.id);
            const isOverBudget = avancement > 100;

            return (
              <div
                key={periode.id}
                className={`card hover:shadow-md transition-shadow cursor-pointer ${isOverBudget ? 'border-2 border-red-400' : ''}`}
                onClick={() => handleOpenMetre(periode.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${isOverBudget ? 'bg-red-100' : 'bg-primary-100'}`}>
                      <TrendingUp className={`w-7 h-7 ${isOverBudget ? 'text-red-600' : 'text-primary-600'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Métré N° {periode.numero.toString().padStart(2, '0')}
                        </h3>
                        {getStatutBadge(periode.statut)}
                        {periode.isDecompteDernier && (
                          <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                            Dernier
                          </span>
                        )}
                        {isOverBudget && (
                          <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800 flex items-center gap-1">
                            ⚠️ Dépassement
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(periode.dateDebut).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Stats */}
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Avancement</p>
                      <p className={`text-lg font-semibold ${isOverBudget ? 'text-red-600' : 'text-primary-600'}`}>
                        {avancement.toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Montant HT</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {totals.montantHT.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Montant TTC</p>
                      <p className="text-lg font-semibold text-green-600">
                        {totals.montantTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD
                      </p>
                    </div>

                    {/* Décompte Status */}
                    {decompte && (
                      <div className="text-center px-4 py-2 bg-gray-50 rounded-lg">
                        <DollarSign className="w-5 h-5 text-green-600 mx-auto" />
                        <p className="text-xs text-gray-500">Décompte {decompte.numero}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleExportAttachement(periode.id)}
                        className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                        title="Exporter Attachement"
                      >
                        <Printer className="w-5 h-5" />
                      </button>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Card */}
      {periodes && periodes.length > 0 && (() => {
        // Get the last période's avancement (cumulative up to last décompte)
        const lastPeriode = periodes[periodes.length - 1];
        const lastAvancement = getCumulativeAvancement(lastPeriode.id);
        const isOverBudget = lastAvancement > 100;
        const totalHT = periodes.reduce((sum, p) => sum + getMetreTotals(p.id).montantHT, 0);
        const totalTTC = periodes.reduce((sum, p) => sum + getMetreTotals(p.id).montantTTC, 0);

        return (
          <div className={`mt-6 card ${isOverBudget ? 'bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300' : 'bg-gradient-to-r from-primary-50 to-blue-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900">Récapitulatif</h4>
                <p className="text-sm text-gray-600">{periodes.length} métré(s) créé(s)</p>
                {isOverBudget && (
                  <p className="text-sm text-red-600 font-medium mt-1">⚠️ Attention: Dépassement du budget!</p>
                )}
              </div>
              <div className="flex gap-8">
                <div className="text-center">
                  <p className={`text-2xl font-bold ${isOverBudget ? 'text-red-600' : 'text-primary-600'}`}>
                    {lastAvancement.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500">Avancement Total</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {totalHT.toLocaleString('fr-FR')} MAD
                  </p>
                  <p className="text-xs text-gray-500">Montant Total HT</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {totalTTC.toLocaleString('fr-FR')} MAD
                  </p>
                  <p className="text-xs text-gray-500">Montant Total TTC</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default MetreListPage;
