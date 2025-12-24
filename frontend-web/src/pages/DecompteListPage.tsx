import { FC, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Periode, Decompt } from '../db/database';
// Auth store imported for future use if needed
import {
  ArrowLeft,
  DollarSign,
  ChevronRight,
  RefreshCw,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Printer,
  TrendingUp,
} from 'lucide-react';
import { pullLatestData } from '../hooks/useSyncManager';

// ============== MAIN COMPONENT ==============

const DecompteListPage: FC = () => {
  const { projectId: rawProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Normalize project ID - support both formats
  const projectId = rawProjectId?.includes(':') ? rawProjectId : `project:${rawProjectId}`;
  const rawId = rawProjectId?.includes(':') ? rawProjectId.replace('project:', '') : rawProjectId;

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

  // Get all périodes for this project
  const periodes = useLiveQuery(
    async () => {
      let periods = await db.periodes
        .where('projectId')
        .equals(projectId)
        .and((p) => !p.deletedAt)
        .sortBy('numero');
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

  // ============== HANDLERS ==============

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await pullLatestData(rawId || '');
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenDecompte = (periodeId: string) => {
    const rawPeriodeId = periodeId.replace('periode:', '');
    navigate(`/projects/${rawProjectId}/decompte/${rawPeriodeId}`);
  };

  const handleExportDecompte = (periodeId: string) => {
    const rawPeriodeId = periodeId.replace('periode:', '');
    window.open(`/projects/${rawProjectId}/periodes/${rawPeriodeId}/decompte-pdf`, '_blank');
  };

  // ============== HELPERS ==============

  const getDecompteForPeriode = (periodeId: string): Decompt | undefined => {
    return decomptes?.find((d: Decompt) => d.periodeId === periodeId);
  };

  const getStatutBadge = (decompte: Decompt | undefined, _periode: Periode) => {
    if (!decompte) {
      return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
        Non créé
      </span>;
    }

    switch (decompte.statut) {
      case 'draft':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Brouillon
        </span>;
      case 'submitted':
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 flex items-center gap-1">
          <FileText className="w-3 h-3" /> Soumis
        </span>;
      case 'validated':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Validé
        </span>;
      case 'paid':
        return <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 flex items-center gap-1">
          <DollarSign className="w-3 h-3" /> Payé
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
              Vous devez d'abord créer un bordereau et des métrés
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Décomptes</h1>
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
              onClick={() => navigate(`/projects/${rawProjectId}/metres`)}
              className="btn btn-primary flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              Gérer les métrés
            </button>
          </div>
        </div>
      </div>

      {/* Liste des Décomptes */}
      {!periodes || periodes.length === 0 ? (
        <div className="card">
          <div className="text-center py-16">
            <DollarSign className="w-20 h-20 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">Aucun décompte</h3>
            <p className="text-gray-600 mb-6">
              Les décomptes sont créés automatiquement avec les métrés
            </p>
            <button
              onClick={() => navigate(`/projects/${rawProjectId}/metres`)}
              className="btn btn-primary btn-lg inline-flex items-center gap-2"
            >
              <TrendingUp className="w-5 h-5" />
              Créer un métré
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {periodes.map((periode) => {
            const decompte = getDecompteForPeriode(periode.id);

            return (
              <div
                key={periode.id}
                className="card hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleOpenDecompte(periode.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center">
                      <DollarSign className="w-7 h-7 text-green-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Décompte N° {periode.numero.toString().padStart(2, '0')}
                          {periode.isDecompteDernier && ' et dernier'}
                        </h3>
                        {getStatutBadge(decompte, periode)}
                      </div>
                      <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(periode.dateDebut).toLocaleDateString('fr-FR')}
                        {' • '}
                        Lié au Métré {periode.numero}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Stats */}
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Montant HT</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {(decompte?.montantTotal || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Montant TTC</p>
                      <p className="text-lg font-semibold text-green-600">
                        {(decompte?.totalTTC || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleExportDecompte(periode.id)}
                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg"
                        title="Exporter Décompte PDF"
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
      {periodes && periodes.length > 0 && decomptes && (
        <div className="mt-6 card bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900">Récapitulatif</h4>
              <p className="text-sm text-gray-600">{periodes.length} décompte(s)</p>
            </div>
            <div className="flex gap-8">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {decomptes.reduce((sum: number, d: Decompt) => sum + (d.montantTotal || 0), 0).toLocaleString('fr-FR')} MAD
                </p>
                <p className="text-xs text-gray-500">Total HT</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {decomptes.reduce((sum: number, d: Decompt) => sum + (d.totalTTC || 0), 0).toLocaleString('fr-FR')} MAD
                </p>
                <p className="text-xs text-gray-500">Total TTC</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DecompteListPage;
