import { FC, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAuthStore } from '../store/authStore';
import {
  ArrowLeft,
  Plus,
  FileText,
  Upload,
  Copy,
  Library,
  AlertCircle,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { logSyncOperation } from '../services/syncService';
import {
  BordereauTable,
  CreateBordereauModal,
  ImportExcelModal,
  TemplateLibraryModal,
  CopyFromProjectModal,
} from '../components/bordereau';

type CreateMode = 'blank' | 'template' | 'copy' | 'import' | null;

const BordereauPage: FC = () => {

  const { projectId: rawProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [createMode, setCreateMode] = useState<CreateMode>(null);

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

  const handleCreateBlank = async (data: { reference: string; designation: string }) => {
    if (!user || !projectId) return;

    const bordereauId = `bordereau:${uuidv4()}`;
    const now = new Date().toISOString();

    const newBordereau = {
      id: bordereauId,
      projectId: projectId,
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

  // Handle loading timeout
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!project) setLoadingTimeout(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [project]);

  if (!project) {
    if (loadingTimeout) {
      return (
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <p className="text-gray-700 font-medium mb-2">Projet non trouvé</p>
            <p className="text-gray-500 text-sm mb-4">Synchronisez les données ou vérifiez l'URL</p>
            <button onClick={() => navigate('/projects')} className="btn btn-primary">
              Retour aux projets
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Bordereau des Prix</h1>
            <p className="text-gray-600">{project.objet}</p>
            <p className="text-sm text-gray-500">Marché N° {project.marcheNo} - {project.annee}</p>
          </div>
        </div>
      </div>

      {/* Si bordereau existe, l'afficher directement */}
      {bordereau ? (
        <BordereauTable bordereauId={bordereau.id} onClose={() => navigate(`/projects/${projectId}`)} />
      ) : (
        /* Sinon, afficher les options de création */
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

      {/* Modals */}
      {createMode === 'blank' && (
        <CreateBordereauModal
          onClose={() => setCreateMode(null)}
          onCreate={handleCreateBlank}
        />
      )}

      {createMode === 'template' && (
        <TemplateLibraryModal
          projectId={projectId!}
          onClose={() => setCreateMode(null)}
          onCreated={() => setCreateMode(null)}
        />
      )}

      {createMode === 'copy' && (
        <CopyFromProjectModal
          currentProjectId={projectId!}
          onClose={() => setCreateMode(null)}
          onCopied={() => setCreateMode(null)}
        />
      )}

      {createMode === 'import' && (
        <ImportExcelModal
          projectId={projectId!}
          onClose={() => setCreateMode(null)}
          onImported={() => setCreateMode(null)}
        />
      )}
    </div>
  );
};

export default BordereauPage;
