import { FC, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAuthStore } from '../store/authStore';
import {
  ArrowLeft,
  Plus,
  FileText,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { logSyncOperation } from '../services/syncService';
import MetreTable from '../components/metre/MetreTable';
import CreateMetreModal from '../components/metre/CreateMetreModal';

type CreateMode = 'select' | null;

const MetrePage: FC = () => {
  const { projectId: rawProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [selectedMetreId, setSelectedMetreId] = useState<string | null>(null);

  // Normalize ID - ensure it has the 'project:' prefix
  const projectId = rawProjectId?.includes(':') ? rawProjectId : `project:${rawProjectId}`;

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

  const metres = useLiveQuery(
    () =>
      db.metres
        .where('projectId')
        .equals(projectId)
        .and((m) => !m.deletedAt)
        .toArray(),
    [projectId]
  );

  const handleCreateMetre = async (bordereauLigneIndex: number) => {
    if (!user || !projectId || !bordereau) return;

    const ligne = bordereau.lignes[bordereauLigneIndex];
    if (!ligne) return;

    const metreId = `metre:${uuidv4()}`;
    const now = new Date().toISOString();

    const newMetre = {
      id: metreId,
      projectId: projectId,
      periodeId: '', // Sera rempli lors de la migration vers le système de périodes
      bordereauLigneId: `${bordereau.id}-ligne-${ligne.numero}`,
      userId: user.id,
      reference: `METRE N° ${String((metres?.length || 0) + 1).padStart(2, '0')}`,
      designationBordereau: ligne.designation,
      unite: ligne.unite,
      lignes: [],
      totalPartiel: 0,
      totalCumule: 0,
      quantiteBordereau: ligne.quantite,
      pourcentageRealisation: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.metres.add(newMetre);
    await logSyncOperation('CREATE', 'metre', metreId.replace('metre:', ''), newMetre, user.id);

    setSelectedMetreId(metreId);
    setCreateMode(null);
  };

  if (!project) {
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

  // Grouper les métrés par ligne de bordereau
  const metresByLigne = new Map<number, typeof metres>();
  metres?.forEach((metre) => {
    const ligneNumero = parseInt(metre.bordereauLigneId.split('-ligne-')[1]);
    if (!metresByLigne.has(ligneNumero)) {
      metresByLigne.set(ligneNumero, []);
    }
    metresByLigne.get(ligneNumero)?.push(metre);
  });

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
            <p className="text-gray-600">{project.objet}</p>
            <p className="text-sm text-gray-500">Marché N° {project.marcheNo} - {project.annee}</p>
          </div>
        </div>
      </div>

      {/* Si un métré est sélectionné, l'afficher */}
      {selectedMetreId ? (
        <MetreTable metreId={selectedMetreId} onClose={() => setSelectedMetreId(null)} />
      ) : (
        <>
          {/* Stats rapides */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                  <FileText className="w-6 h-6" />
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
                  <p className="text-2xl font-bold text-gray-900">{metres?.length || 0}</p>
                  <p className="text-sm text-gray-600">Métrés effectués</p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {metresByLigne.size}
                  </p>
                  <p className="text-sm text-gray-600">Lignes métrées</p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {bordereau.lignes.length - metresByLigne.size}
                  </p>
                  <p className="text-sm text-gray-600">En attente</p>
                </div>
              </div>
            </div>
          </div>

          {/* Liste des lignes du bordereau */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Lignes du bordereau</h2>
              <button
                onClick={() => setCreateMode('select')}
                className="btn btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Nouveau métré
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 w-16">N°</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Désignation</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 w-20">U</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 w-32">Qté Bordereau</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 w-32">Qté Réalisée</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 w-32">Progression</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {bordereau.lignes.map((ligne, index) => {
                    const ligneMetres = metresByLigne.get(ligne.numero) || [];
                    const totalRealise = ligneMetres.reduce((sum, m) => sum + m.totalCumule, 0);
                    const pourcentage = ligne.quantite > 0 ? (totalRealise / ligne.quantite) * 100 : 0;
                    const hasMetres = ligneMetres.length > 0;

                    return (
                      <tr key={ligne.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">{ligne.numero}</td>
                        <td className="px-4 py-3 text-gray-900">{ligne.designation}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            {ligne.unite}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {ligne.quantite.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-primary-600">
                          {totalRealise.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  pourcentage >= 100
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
                            <span className="text-xs font-medium text-gray-700 w-12 text-right">
                              {pourcentage.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            {hasMetres ? (
                              <button
                                onClick={() => setSelectedMetreId(ligneMetres[ligneMetres.length - 1].id)}
                                className="btn btn-secondary text-xs flex items-center gap-1"
                              >
                                <TrendingUp className="w-3 h-3" />
                                Voir ({ligneMetres.length})
                              </button>
                            ) : (
                              <button
                                onClick={() => handleCreateMetre(index)}
                                className="btn btn-primary text-xs flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                Créer métré
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal de sélection */}
      {createMode === 'select' && bordereau && (
        <CreateMetreModal
          bordereau={bordereau}
          onClose={() => setCreateMode(null)}
          onCreate={handleCreateMetre}
        />
      )}
    </div>
  );
};

export default MetrePage;
