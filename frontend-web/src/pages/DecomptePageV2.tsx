import { FC, useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Decompt, Metre } from '../db/database';
import { useAuthStore } from '../store/authStore';
import {
  ArrowLeft,
  Save,
  Download,
  Calculator,
  CheckCircle2,
  FileText,
  TrendingUp,
  DollarSign,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { logSyncOperation } from '../services/syncService';

// ============== INTERFACES ==============

interface DecompteLigne {
  prixNo: number;
  designation: string;
  unite: string;
  quantiteBordereau: number;
  quantiteRealisee: number;
  prixUnitaireHT: number;
  montantHT: number;
  bordereauLigneId: string;
  metreId?: string;
}

interface RecapCalculations {
  travauxTermines: number;
  travauxNonTermines: number;
  approvisionnements: number;
  totalAvantRetenue: number;
  retenueGarantie: number;
  resteAPayer: number;
  depensesExercicesAnterieurs: number;
  totalADeduire: number;
  montantAcompte: number;
}

// Fonction de majoration (arrondi vers le haut) à 2 décimales
const majoration = (value: number): number => {
  return Math.ceil(value * 100) / 100;
};

// ============== MAIN COMPONENT ==============

const DecomptePageV2: FC = () => {
  const { projectId: rawProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // State
  const [isSaving, setIsSaving] = useState(false);
  const [lignes, setLignes] = useState<DecompteLigne[]>([]);
  const [tauxTVA, setTauxTVA] = useState(20);
  const [tauxRetenue, setTauxRetenue] = useState(10);
  const [isLastDecompte, setIsLastDecompte] = useState(false);
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

  // Get ALL metres for this project
  const allMetres = useLiveQuery(
    () =>
      db.metres
        .where('projectId')
        .equals(projectId)
        .and((m) => !m.deletedAt)
        .toArray(),
    [projectId]
  );

  // Get existing decompte
  const existingDecompte = useLiveQuery(
    () =>
      db.decompts
        .where('projectId')
        .equals(projectId)
        .and((d) => !d.deletedAt)
        .first(),
    [projectId]
  );

  // ============== COMPUTED VALUES ==============

  // Group metres by bordereauLigneId
  const metresByLigne = useMemo(() => {
    if (!allMetres) return new Map<string, Metre>();

    const grouped = new Map<string, Metre>();
    for (const metre of allMetres) {
      // Keep the latest metre for each line
      const existing = grouped.get(metre.bordereauLigneId);
      if (!existing || new Date(metre.updatedAt) > new Date(existing.updatedAt)) {
        grouped.set(metre.bordereauLigneId, metre);
      }
    }
    return grouped;
  }, [allMetres]);

  // ============== INITIALIZATION ==============

  useEffect(() => {
    if (bordereau && allMetres !== undefined) {
      const decompteLines: DecompteLigne[] = bordereau.lignes.map((ligne) => {
        const ligneId = `${bordereau.id}-ligne-${ligne.numero}`;
        const metre = metresByLigne.get(ligneId);

        const quantiteRealisee = majoration(metre?.totalPartiel || 0);
        const prixUnitaireHT = majoration(ligne.prixUnitaire || 0);
        const montantHT = majoration(quantiteRealisee * prixUnitaireHT);

        return {
          prixNo: ligne.numero,
          designation: ligne.designation,
          unite: ligne.unite,
          quantiteBordereau: ligne.quantite,
          quantiteRealisee,
          prixUnitaireHT,
          montantHT,
          bordereauLigneId: ligneId,
          metreId: metre?.id,
        };
      });

      setLignes(decompteLines);
    }
  }, [bordereau, allMetres, metresByLigne]);

  // ============== CALCULATIONS ==============

  const totalHT = majoration(lignes.reduce((sum, ligne) => sum + ligne.montantHT, 0));
  const montantTVA = majoration((totalHT * tauxTVA) / 100);
  const totalTTC = majoration(totalHT + montantTVA);

  const getRecapCalculations = (): RecapCalculations => {
    let travauxTermines = 0;
    let travauxNonTermines = 0;

    if (isLastDecompte) {
      travauxTermines = totalTTC;
      travauxNonTermines = 0;
    } else {
      travauxTermines = 0;
      travauxNonTermines = totalTTC;
    }

    const approvisionnements = 0;
    const totalAvantRetenue = totalTTC;

    // Calculate market total
    const montantMarcheTTC = majoration(bordereau?.lignes.reduce((sum, ligne) => {
      const montantHT = majoration(ligne.quantite * (ligne.prixUnitaire || 0));
      return sum + majoration(montantHT * 1.2);
    }, 0) || 0);

    const retenue10Pourcent = majoration(totalTTC * 0.10);
    const retenue7Pourcent = majoration(montantMarcheTTC * 0.07);
    const retenueGarantie = majoration(Math.min(retenue10Pourcent, retenue7Pourcent));

    const totalRestes = majoration(totalAvantRetenue - retenueGarantie);
    const depensesExercicesAnterieurs = 0; // Simplified - no periods
    const resteAPayer = majoration(totalRestes - depensesExercicesAnterieurs);
    const decomptesPrecedents = 0; // Simplified
    const totalADeduire = majoration(depensesExercicesAnterieurs + decomptesPrecedents);
    const montantAcompte = majoration(resteAPayer - decomptesPrecedents);

    return {
      travauxTermines,
      travauxNonTermines,
      approvisionnements,
      totalAvantRetenue,
      retenueGarantie,
      resteAPayer,
      depensesExercicesAnterieurs,
      totalADeduire,
      montantAcompte,
    };
  };

  const recap = getRecapCalculations();

  // ============== HANDLERS ==============

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsRefreshing(false);
  };

  const handleSave = async () => {
    if (!user || !projectId) return;

    setIsSaving(true);

    try {
      const now = new Date().toISOString();

      if (existingDecompte) {
        // Update existing decompte
        await db.decompts.update(existingDecompte.id, {
          lignes: lignes,
          montantTotal: recap.montantAcompte,
          totalTTC: totalTTC,
          statut: 'draft',
          updatedAt: now,
        });

        await logSyncOperation(
          'UPDATE',
          'decompt',
          existingDecompte.id.replace('decompt:', ''),
          { montantTotal: recap.montantAcompte, lignesCount: lignes.length },
          user.id
        );
      } else {
        // Create new decompte
        const decomptId = `decompt:${uuidv4()}`;

        const newDecompte: Decompt = {
          id: decomptId,
          projectId: projectId,
          periodeId: '', // No longer required
          userId: user.id,
          numero: 1,
          lignes: lignes,
          montantTotal: recap.montantAcompte,
          totalTTC: totalTTC,
          statut: 'draft',
          createdAt: now,
          updatedAt: now,
        };

        await db.decompts.add(newDecompte);
        await logSyncOperation('CREATE', 'decompt', decomptId.replace('decompt:', ''), newDecompte, user.id);
      }

      alert('✅ Décompte enregistré avec succès !');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('❌ Erreur lors de la sauvegarde du décompte');
    } finally {
      setIsSaving(false);
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
              Vous devez d'abord créer un bordereau avant de faire des décomptes
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

  // Check if there are metres
  const hasMetres = allMetres && allMetres.length > 0;

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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Décompte{isLastDecompte ? ' Définitif' : ''}
            </h1>
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
              onClick={() => navigate(`/projects/${projectId}/metre`)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              Métré
            </button>
            <button className="btn btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Exporter PDF
            </button>
            <button
              onClick={handleSave}
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

      {/* Warning if no metres */}
      {!hasMetres && (
        <div className="card mb-6 border-2 border-yellow-400 bg-yellow-50">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">Aucun métré enregistré</p>
              <p className="text-sm text-yellow-600">
                Vous devez d'abord saisir des métrés pour calculer le décompte.{' '}
                <button
                  onClick={() => navigate(`/projects/${projectId}/metre`)}
                  className="underline font-medium"
                >
                  Aller aux métrés
                </button>
              </p>
            </div>
          </div>
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
              <p className="text-2xl font-bold text-gray-900">{lignes.length}</p>
              <p className="text-sm text-gray-600">Lignes</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {totalHT.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-gray-600">Total HT</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {totalTTC.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-gray-600">Total TTC</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-r from-primary-50 to-blue-50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-100 text-primary-600 rounded-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-600">
                {recap.montantAcompte.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-gray-600">Montant Acompte</p>
            </div>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Paramètres du décompte</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Taux TVA (%)
            </label>
            <input
              type="number"
              value={tauxTVA}
              onChange={(e) => setTauxTVA(parseFloat(e.target.value) || 0)}
              className="input w-full"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Taux Retenue de garantie (%)
            </label>
            <input
              type="number"
              value={tauxRetenue}
              onChange={(e) => setTauxRetenue(parseFloat(e.target.value) || 0)}
              className="input w-full"
              step="0.1"
            />
          </div>
          <div className="flex items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isLastDecompte}
                onChange={(e) => setIsLastDecompte(e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">
                Décompte définitif et dernier
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Decompte table */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Détail des travaux</h2>
        <div className="overflow-x-auto">
          <table className="w-full border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-300 w-16">
                  N° Prix
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-300">
                  Désignation
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-16">
                  U
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-r border-gray-300 w-24">
                  Qté Bordereau
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-r border-gray-300 w-24">
                  Qté Réalisée
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-r border-gray-300 w-28">
                  Prix U. HT
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 w-32 bg-blue-50">
                  Montant HT
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {lignes.map((ligne) => {
                const pourcentage = ligne.quantiteBordereau > 0
                  ? (ligne.quantiteRealisee / ligne.quantiteBordereau) * 100
                  : 0;
                
                return (
                  <tr key={ligne.prixNo} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700 font-medium border-r border-gray-200">
                      {ligne.prixNo}
                    </td>
                    <td className="px-3 py-2 text-gray-900 border-r border-gray-200">
                      {ligne.designation}
                    </td>
                    <td className="px-3 py-2 text-center border-r border-gray-200">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                        {ligne.unite}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 border-r border-gray-200">
                      {ligne.quantiteBordereau.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium border-r border-gray-200 ${
                      pourcentage > 100 ? 'text-orange-600' : 'text-primary-600'
                    }`}>
                      {ligne.quantiteRealisee.toFixed(2)}
                      {pourcentage > 100 && (
                        <span className="ml-1 text-xs">({pourcentage.toFixed(0)}%)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 border-r border-gray-200">
                      {ligne.prixUnitaireHT.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-primary-700 bg-blue-50">
                      {ligne.montantHT.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-100">
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right font-semibold text-gray-700">
                  Total HT:
                </td>
                <td className="px-3 py-2 text-right font-bold text-gray-900 bg-gray-200">
                  {totalHT.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
                </td>
              </tr>
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right font-medium text-gray-600">
                  TVA ({tauxTVA}%):
                </td>
                <td className="px-3 py-2 text-right font-medium text-gray-700">
                  {montantTVA.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
                </td>
              </tr>
              <tr className="bg-primary-50">
                <td colSpan={6} className="px-3 py-2 text-right font-bold text-primary-800">
                  Total TTC:
                </td>
                <td className="px-3 py-2 text-right font-bold text-primary-800">
                  {totalTTC.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Recap */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Récapitulatif</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Travaux terminés</span>
              <span className="font-medium text-gray-900">
                {recap.travauxTermines.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Travaux non terminés</span>
              <span className="font-medium text-gray-900">
                {recap.travauxNonTermines.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Approvisionnements</span>
              <span className="font-medium text-gray-900">
                {recap.approvisionnements.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b bg-gray-50 px-2 -mx-2 rounded">
              <span className="font-semibold text-gray-700">Total avant retenue</span>
              <span className="font-bold text-gray-900">
                {recap.totalAvantRetenue.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Retenue de garantie</span>
              <span className="font-medium text-red-600">
                -{recap.retenueGarantie.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Reste à payer</span>
              <span className="font-medium text-gray-900">
                {recap.resteAPayer.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Dépenses exercices antérieurs</span>
              <span className="font-medium text-gray-900">
                {recap.depensesExercicesAnterieurs.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
              </span>
            </div>
            <div className="flex justify-between items-center py-3 bg-primary-50 px-3 -mx-2 rounded-lg">
              <span className="font-bold text-primary-800">Montant de l'acompte</span>
              <span className="font-bold text-xl text-primary-800">
                {recap.montantAcompte.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DecomptePageV2;
