import { FC, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft,
  Plus,
  Calendar,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Clock,
  FileText,
  Edit2,
  Trash2,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { logSyncOperation } from '../services/syncService';

const PeriodesPage: FC = () => {
  const { projectId: rawProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Normalize ID - ensure it has the 'project:' prefix
  const projectId = rawProjectId?.includes(':') ? rawProjectId : `project:${rawProjectId}`;

  const project = useLiveQuery(
    () => db.projects.get(projectId),
    [projectId]
  );

  const periodes = useLiveQuery(
    () =>
      db.periodes
        .where('projectId')
        .equals(projectId)
        .and((p) => !p.deletedAt)
        .reverse()
        .sortBy('numero'),
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

  const decompts = useLiveQuery(
    () =>
      db.decompts
        .where('projectId')
        .equals(projectId)
        .and((d) => !d.deletedAt)
        .toArray(),
    [projectId]
  );

  // جلب البوردرو لحساب مبلغ المشروع الأصلي
  const bordereaux = useLiveQuery(
    () =>
      db.bordereaux
        .where('projectId')
        .equals(projectId)
        .and((b) => !b.deletedAt)
        .toArray(),
    [projectId]
  );

  const handleCreatePeriode = async (data: {
    libelle: string;
    dateFin: string;
    isDecompteDernier?: boolean;
  }) => {
    if (!user || !projectId) return;

    const periodeId = `periode:${uuidv4()}`;
    const now = new Date().toISOString();
    const numero = (periodes?.length || 0) + 1;

    const newPeriode = {
      id: periodeId,
      projectId: projectId,
      userId: user.id,
      numero,
      libelle: data.libelle || `Décompte N°${numero}`,
      dateDebut: data.dateFin,
      dateFin: data.dateFin,
      statut: 'en_cours' as const,
      isDecompteDernier: data.isDecompteDernier || false,
      createdAt: now,
      updatedAt: now,
    };

    await db.periodes.add(newPeriode);
    await logSyncOperation('CREATE', 'periode', periodeId.replace('periode:', ''), newPeriode, user.id);

    // CUMUL: Copier les métrés de la période précédente
    if (numero > 1 && periodes && periodes.length > 0) {
      // Trouver la période précédente (numéro = numero - 1)
      const periodePrecedente = periodes.find((p) => p.numero === numero - 1);
      
      if (periodePrecedente) {
        // Récupérer tous les métrés de la période précédente
        const metresPrecedents = await db.metres
          .where('periodeId')
          .equals(periodePrecedente.id)
          .and((m) => !m.deletedAt)
          .toArray();

        // Copier chaque métré dans la nouvelle période
        for (const metrePrecedent of metresPrecedents) {
          const newMetreId = `metre:${uuidv4()}`;
          
          const newMetre = {
            ...metrePrecedent,
            id: newMetreId,
            periodeId: periodeId, // Nouvelle période
            createdAt: now,
            updatedAt: now,
            // Supprimer les champs techniques
            _rev: undefined,
            deletedAt: undefined,
          };

          await db.metres.add(newMetre);
          await logSyncOperation('CREATE', 'metre', newMetreId.replace('metre:', ''), newMetre, user.id);
        }
      }
    }

    setShowCreateModal(false);
  };

  const handleDeletePeriode = async (periodeId: string) => {
    if (!user) return;
    if (!confirm('Supprimer cette période ? Les métrés et décomptes associés seront également supprimés.'))
      return;

    const now = new Date().toISOString();

    // Soft delete de la période
    await db.periodes.update(periodeId, {
      deletedAt: now,
      updatedAt: now,
    });

    // Soft delete des métrés associés
    const metresAssocies = await db.metres
      .where('periodeId')
      .equals(periodeId)
      .toArray();

    for (const metre of metresAssocies) {
      await db.metres.update(metre.id, { deletedAt: now, updatedAt: now });
    }

    // Soft delete des décomptes associés
    const decomptsAssocies = await db.decompts
      .where('periodeId')
      .equals(periodeId)
      .toArray();

    for (const decompt of decomptsAssocies) {
      await db.decompts.update(decompt.id, { deletedAt: now, updatedAt: now });
    }

    await logSyncOperation('DELETE', 'periode', periodeId.replace('periode:', ''), null, user.id);
  };

  // حساب مبلغ المشروع TTC من البوردرو (montantTotal هو HT، نضيف TVA 20%)
  const montantProjetHT = bordereaux?.reduce((sum, b) => sum + (b.montantTotal || 0), 0) || 0;
  const montantProjetTTC = montantProjetHT * 1.2; // +20% TVA

  // إيجاد آخر ديكونت (الأعلى رقماً)
  const dernierDecompte = decompts?.reduce((latest, d) => {
    if (!latest || d.numero > latest.numero) return d;
    return latest;
  }, null as typeof decompts extends (infer T)[] | undefined ? T | null : never);

  // مبلغ آخر ديكونت TTC (نستخدم totalTTC إن وجد، وإلا نستخدم montantTotal)
  const montantDernierDecompteTTC = (dernierDecompte as any)?.totalTTC || dernierDecompte?.montantTotal || 0;

  // المبلغ المتبقي = مبلغ المشروع TTC - مبلغ آخر ديكونت TTC
  const montantRestant = montantProjetTTC - montantDernierDecompteTTC;

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'en_cours':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            <Clock className="w-4 h-4" />
            En cours
          </span>
        );
      case 'validee':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Validée
          </span>
        );
      case 'facturee':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
            <DollarSign className="w-4 h-4" />
            Facturée
          </span>
        );
      default:
        return null;
    }
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Périodes & Décomptes</h1>
            <p className="text-gray-600">{project.objet}</p>
            <p className="text-sm text-gray-500">Marché N° {project.marcheNo} - {project.annee}</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouvelle période
          </button>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{periodes?.length || 0}</p>
              <p className="text-sm text-gray-600">Périodes</p>
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

        <div className={`card ${montantRestant < 0 ? 'border-2 border-red-400 bg-red-50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${montantRestant < 0 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className={`text-lg font-bold ${montantRestant < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {montantRestant.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD
              </p>
              <p className="text-sm text-gray-600">Reste à facturer</p>
              {montantRestant < 0 && (
                <p className="text-xs text-red-500 font-medium">⚠️ Dépassement!</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Liste des périodes */}
      {periodes && periodes.length > 0 ? (
        <div className="space-y-4">
          {periodes.map((periode) => {
            const metresPeriode = metres?.filter((m) => m.periodeId === periode.id) || [];
            const decomptsPeriode = decompts?.filter((d) => d.periodeId === periode.id) || [];

            return (
              <div key={periode.id} className="card hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 bg-primary-100 text-primary-700 rounded-lg flex items-center justify-center font-bold text-2xl">
                      {periode.numero}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-1">{periode.libelle}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(periode.dateDebut), 'dd MMM yyyy', { locale: fr })}
                          {' → '}
                          {format(new Date(periode.dateFin), 'dd MMM yyyy', { locale: fr })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {periode.isDecompteDernier && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-300 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        Dernier
                      </span>
                    )}
                    {getStatutBadge(periode.statut)}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-blue-600" />
                      <p className="text-xs text-blue-600 font-medium">Métrés</p>
                    </div>
                    <p className="text-2xl font-bold text-blue-700">{metresPeriode.length}</p>
                  </div>

                  <div className="bg-green-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-green-600" />
                      <p className="text-xs text-green-600 font-medium">Décomptes</p>
                    </div>
                    <p className="text-2xl font-bold text-green-700">{decomptsPeriode.length}</p>
                  </div>

                  <div className="bg-purple-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-purple-600" />
                      <p className="text-xs text-purple-600 font-medium">Montant</p>
                    </div>
                    <p className="text-lg font-bold text-purple-700">
                      {decomptsPeriode.reduce((sum, d) => sum + d.montantTotal, 0).toLocaleString()} MAD
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-200">
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/projects/${projectId}/periodes/${periode.id}/metre`)}
                      className="btn btn-secondary text-sm flex items-center gap-2"
                    >
                      <TrendingUp className="w-4 h-4" />
                      Saisir métrés
                    </button>
                    <button
                      onClick={() => navigate(`/projects/${projectId}/periodes/${periode.id}/decompte`)}
                      className="btn btn-secondary text-sm flex items-center gap-2"
                    >
                      <DollarSign className="w-4 h-4" />
                      Décompte
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Modifier"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePeriode(periode.id)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <div className="text-center py-12">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune période</h3>
            <p className="text-gray-600 mb-4">
              Créez une première période pour commencer à saisir vos métrés et décomptes
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Créer la première période
            </button>
          </div>
        </div>
      )}

      {/* Modal de création */}
      {showCreateModal && (
        <CreatePeriodeModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreatePeriode}
          nextNumero={(periodes?.length || 0) + 1}
        />
      )}
    </div>
  );
};

interface CreatePeriodeModalProps {
  onClose: () => void;
  onCreate: (data: { libelle: string; dateFin: string; isDecompteDernier?: boolean }) => void;
  nextNumero: number;
}

const CreatePeriodeModal: FC<CreatePeriodeModalProps> = ({ onClose, onCreate, nextNumero }) => {
  const [libelle, setLibelle] = useState(`Décompte N°${nextNumero}`);
  const [dateFin, setDateFin] = useState('');
  const [isDecompteDernier, setIsDecompteDernier] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateFin) {
      alert('Veuillez renseigner la date');
      return;
    }
    onCreate({ libelle, dateFin, isDecompteDernier });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 text-primary-600 rounded-lg">
              <Calendar className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Nouvelle période</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Libellé <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              className="input w-full"
              placeholder={`Décompte N°${nextNumero}`}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date de fin <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="input w-full"
              required
            />
          </div>

          <div className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
            onClick={() => setIsDecompteDernier(!isDecompteDernier)}
          >
            <input
              type="checkbox"
              checked={isDecompteDernier}
              onChange={(e) => setIsDecompteDernier(e.target.checked)}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label className="text-sm font-medium text-gray-700 cursor-pointer">
              Décompte Dernier (Final)
            </label>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-medium mb-1">
              Période N°{nextNumero}
            </p>
            <p className="text-xs text-blue-700">
              Cette période regroupera les métrés et le décompte correspondant
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Annuler
            </button>
            <button type="submit" className="btn btn-primary">
              Créer la période
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PeriodesPage;
