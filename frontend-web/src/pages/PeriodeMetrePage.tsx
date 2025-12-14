import { FC, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
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
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { logSyncOperation } from '../services/syncService';
import { calculatePartiel, getCalculationType, type UniteType } from '../utils/metreCalculations';

interface MetreLigneInput {
  id: string;
  numero: number;
  designation: string;
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
  prixUnitaire: number; // السعر الوحدوي من البوردرو
  lignes: MetreLigneInput[];
  isExpanded: boolean;
}

const PeriodeMetrePage: FC = () => {
  const { projectId: rawProjectId, periodeId: rawPeriodeId } = useParams<{ projectId: string; periodeId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [metresQuick, setMetresQuick] = useState<MetreQuick[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Normalize IDs - ensure they have the correct prefix
  const projectId = rawProjectId?.includes(':') ? rawProjectId : `project:${rawProjectId}`;
  const periodeId = rawPeriodeId?.includes(':') ? rawPeriodeId : `periode:${rawPeriodeId}`;

  const project = useLiveQuery(
    () => db.projects.get(projectId),
    [projectId]
  );

  const periode = useLiveQuery(
    () => db.periodes.get(periodeId),
    [periodeId]
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

  const existingMetres = useLiveQuery(
    () =>
      db.metres
        .where('periodeId')
        .equals(periodeId)
        .and((m) => !m.deletedAt)
        .toArray(),
    [periodeId]
  );

  // Initialiser les données au chargement
  useEffect(() => {
    if (bordereau && existingMetres !== undefined) {
      const quickData: MetreQuick[] = bordereau.lignes.map((ligne) => {
        const existingMetre = existingMetres.find(
          (m) => m.bordereauLigneId === `${bordereau.id}-ligne-${ligne.numero}`
        );

        return {
          bordereauLigneId: `${bordereau.id}-ligne-${ligne.numero}`,
          numeroLigne: ligne.numero,
          designation: ligne.designation,
          unite: ligne.unite,
          quantiteBordereau: ligne.quantite,
          prixUnitaire: ligne.prixUnitaire || 0, // إضافة السعر الوحدوي
          lignes: existingMetre?.lignes || [],
          isExpanded: false,
        };
      });

      setMetresQuick(quickData);
    }
  }, [bordereau, existingMetres]);

  // Gérer l'expansion/réduction d'un item
  const handleToggleExpand = (bordereauLigneId: string) => {
    setMetresQuick((prev) =>
      prev.map((item) =>
        item.bordereauLigneId === bordereauLigneId
          ? { ...item, isExpanded: !item.isExpanded }
          : item
      )
    );
  };

  // Ajouter une ligne de mesure
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
          ? { ...m, lignes: [...m.lignes, newLigne] }
          : m
      )
    );
  };

  // Supprimer une ligne de mesure
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

  // Modifier un champ d'une ligne de mesure
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

          // Recalculer le partiel si c'est un champ de calcul
          if (['longueur', 'largeur', 'profondeur', 'nombre', 'diametre'].includes(field)) {
            updated.partiel = calculatePartiel(
              item.unite as UniteType,
              updated.longueur,
              updated.largeur,
              updated.profondeur,
              updated.nombre,
              updated.diametre
            );
          }

          return updated;
        });

        return { ...item, lignes: updatedLignes };
      })
    );
  };

  // Helper pour calculer le pourcentage
  const calculatePourcentage = (realise: number, bordereau: number): number => {
    return bordereau > 0 ? (realise / bordereau) * 100 : 0;
  };

  const handleSaveAll = async () => {
    if (!user || !projectId || !periodeId || !periode) return;

    setIsSaving(true);

    try {
      const now = new Date().toISOString();

      for (const metreQuick of metresQuick) {
        // Skip si pas de lignes de mesure
        if (metreQuick.lignes.length === 0) continue;

        // Calculer le total partiel (somme de tous les partiels des lignes)
        const totalPartiel = metreQuick.lignes.reduce((sum, ligne) => sum + ligne.partiel, 0);

        // Chercher si un métré existe déjà pour cette ligne dans cette période
        const existingMetre = existingMetres?.find(
          (m) => m.bordereauLigneId === metreQuick.bordereauLigneId
        );

        if (existingMetre) {
          // Mettre à jour le métré existant
          await db.metres.update(existingMetre.id, {
            lignes: metreQuick.lignes,
            totalPartiel,
            totalCumule: totalPartiel,
            pourcentageRealisation: calculatePourcentage(
              totalPartiel,
              metreQuick.quantiteBordereau
            ),
            updatedAt: now,
          });

          await logSyncOperation(
            'UPDATE',
            'metre',
            existingMetre.id.replace('metre:', ''),
            { lignes: metreQuick.lignes },
            user.id
          );
        } else {
          // Créer un nouveau métré
          const metreId = `metre:${uuidv4()}`;

          const newMetre = {
            id: metreId,
            projectId: projectId,
            periodeId: periodeId!,
            bordereauLigneId: metreQuick.bordereauLigneId,
            userId: user.id,
            reference: `METRE P${periode.numero}-L${metreQuick.numeroLigne}`,
            designationBordereau: metreQuick.designation,
            unite: metreQuick.unite,
            lignes: metreQuick.lignes,
            totalPartiel,
            totalCumule: totalPartiel,
            quantiteBordereau: metreQuick.quantiteBordereau,
            pourcentageRealisation: calculatePourcentage(
              totalPartiel,
              metreQuick.quantiteBordereau
            ),
            createdAt: now,
            updatedAt: now,
          };

          await db.metres.add(newMetre);
          await logSyncOperation('CREATE', 'metre', metreId.replace('metre:', ''), newMetre, user.id);
        }
      }

      alert('Métrés enregistrés avec succès !');
      navigate(`/projects/${projectId}/periodes`);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde des métrés');
    } finally {
      setIsSaving(false);
    }
  };

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

  // حساب المبلغ المنجز (الكمية المنجزة × السعر)
  const getMontantRealise = () => {
    return metresQuick.reduce((sum, item) => {
      const totalPartiel = item.lignes.reduce((s, ligne) => s + ligne.partiel, 0);
      return sum + (totalPartiel * item.prixUnitaire);
    }, 0);
  };

  // حساب مبلغ البوردرو الإجمالي
  const getMontantBordereau = () => {
    return metresQuick.reduce((sum, m) => sum + (m.quantiteBordereau * m.prixUnitaire), 0);
  };

  // نسبة التقدم المالي
  const getPourcentageFinancier = () => {
    const total = getMontantBordereau();
    return total > 0 ? (getMontantRealise() / total) * 100 : 0;
  };

  if (!project || !periode || !bordereau) {
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
          onClick={() => navigate(`/projects/${projectId}/periodes`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Retour aux périodes
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Saisie rapide des métrés</h1>
            <p className="text-gray-700 font-medium">{periode.libelle}</p>
            <p className="text-sm text-gray-500">
              {format(new Date(periode.dateDebut), 'dd MMM yyyy', { locale: fr })} →{' '}
              {format(new Date(periode.dateFin), 'dd MMM yyyy', { locale: fr })}
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => navigate(`/projects/${projectId}/periodes/${periodeId}/attachement`)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Attachement
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
                  Tout enregistrer
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Stats rapides */}
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
              <p className="text-2xl font-bold text-gray-900">{getPourcentageGlobal().toFixed(1)}%</p>
              <p className="text-sm text-gray-600">Avancement quantité</p>
            </div>
          </div>
        </div>

        <div className={`card ${getPourcentageFinancier() > 100 ? 'border-2 border-red-400 bg-red-50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${getPourcentageFinancier() > 100 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${getPourcentageFinancier() > 100 ? 'text-red-600' : 'text-gray-900'}`}>
                {getPourcentageFinancier().toFixed(1)}%
              </p>
              <p className="text-sm text-gray-600">Avancement financier</p>
              {getPourcentageFinancier() > 100 && (
                <p className="text-xs text-red-500 font-medium">⚠️ Dépassement!</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Accordéon de saisie */}
      <div className="card">
        <div className="space-y-4">
          {metresQuick.map((item) => {
            const totalPartiel = item.lignes.reduce((sum, ligne) => sum + ligne.partiel, 0);
            const pourcentage =
              item.quantiteBordereau > 0 ? (totalPartiel / item.quantiteBordereau) * 100 : 0;
            const isComplete = pourcentage >= 100;
            const isStarted = totalPartiel > 0;

            const calculationType = getCalculationType(item.unite as UniteType);
            const champs = calculationType?.champs || [];

            return (
              <div
                key={item.bordereauLigneId}
                className={`border rounded-lg overflow-hidden ${
                  isComplete ? 'border-green-500 bg-green-50' : 'border-gray-200'
                }`}
              >
                {/* En-tête de l'accordéon */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => handleToggleExpand(item.bordereauLigneId)}
                >
                  {/* Icône expand/collapse */}
                  {item.isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  )}

                  {/* N° */}
                  <div className="w-12 text-gray-700 font-bold">{item.numeroLigne}</div>

                  {/* Désignation */}
                  <div className="flex-1 text-gray-900 font-medium">{item.designation}</div>

                  {/* Unité */}
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                    {item.unite}
                  </span>

                  {/* Quantités */}
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Bordereau: {item.quantiteBordereau.toLocaleString()}</div>
                    <div className="text-sm font-bold text-primary-600">Réalisé: {totalPartiel.toFixed(2)}</div>
                  </div>

                  {/* Barre de progression */}
                  <div className="w-32">
                    <div className="flex items-center gap-2">
                      {isComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : isStarted ? (
                        <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isComplete
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
                      <span className="text-xs font-medium text-gray-700 w-10 text-right">
                        {pourcentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contenu de l'accordéon (table de mesures) */}
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
                                    handleLigneChange(
                                      item.bordereauLigneId,
                                      ligne.id,
                                      'designation',
                                      e.target.value
                                    )
                                  }
                                  className="input text-sm w-full"
                                  placeholder="Description..."
                                />
                              </td>
                              {champs.includes('longueur') && (
                                <td className="px-3 py-2 border-r border-gray-200">
                                  <input
                                    type="number"
                                    value={ligne.longueur || ''}
                                    onChange={(e) =>
                                      handleLigneChange(
                                        item.bordereauLigneId,
                                        ligne.id,
                                        'longueur',
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="input text-center text-sm w-full"
                                    placeholder="0"
                                    step="0.01"
                                    min="0"
                                  />
                                </td>
                              )}
                              {champs.includes('largeur') && (
                                <td className="px-3 py-2 border-r border-gray-200">
                                  <input
                                    type="number"
                                    value={ligne.largeur || ''}
                                    onChange={(e) =>
                                      handleLigneChange(
                                        item.bordereauLigneId,
                                        ligne.id,
                                        'largeur',
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="input text-center text-sm w-full"
                                    placeholder="0"
                                    step="0.01"
                                    min="0"
                                  />
                                </td>
                              )}
                              {champs.includes('profondeur') && (
                                <td className="px-3 py-2 border-r border-gray-200">
                                  <input
                                    type="number"
                                    value={ligne.profondeur || ''}
                                    onChange={(e) =>
                                      handleLigneChange(
                                        item.bordereauLigneId,
                                        ligne.id,
                                        'profondeur',
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="input text-center text-sm w-full"
                                    placeholder="0"
                                    step="0.01"
                                    min="0"
                                  />
                                </td>
                              )}
                              {champs.includes('nombre') && (
                                <td className="px-3 py-2 border-r border-gray-200">
                                  <input
                                    type="number"
                                    value={ligne.nombre || ''}
                                    onChange={(e) =>
                                      handleLigneChange(
                                        item.bordereauLigneId,
                                        ligne.id,
                                        'nombre',
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="input text-center text-sm w-full"
                                    placeholder="0"
                                    step="1"
                                    min="0"
                                  />
                                </td>
                              )}
                              {champs.includes('diametre') && (
                                <td className="px-3 py-2 border-r border-gray-200">
                                  <input
                                    type="number"
                                    value={ligne.diametre || ''}
                                    onChange={(e) =>
                                      handleLigneChange(
                                        item.bordereauLigneId,
                                        ligne.id,
                                        'diametre',
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="input text-center text-sm w-full"
                                    placeholder="0"
                                    step="1"
                                    min="0"
                                  />
                                </td>
                              )}
                              <td className="px-3 py-2 text-right font-bold text-gray-900 border-r border-gray-200 bg-blue-50">
                                {ligne.partiel.toFixed(3)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={() => handleDeleteLigne(item.bordereauLigneId, ligne.id)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                          <tr>
                            <td
                              colSpan={champs.length + 2}
                              className="px-3 py-2 text-right font-bold text-gray-900"
                            >
                              TOTAL:
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-xl text-primary-600 border-r border-gray-300 bg-blue-50">
                              {totalPartiel.toFixed(3)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Bouton Ajouter une ligne */}
                    <div className="mt-3">
                      <button
                        onClick={() => handleAddLigne(item.bordereauLigneId)}
                        className="btn-secondary text-sm flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Ajouter une mesure
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Récapitulatif global */}
        <div className="mt-6 p-4 bg-gray-100 border border-gray-300 rounded-lg">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-1">Total Bordereau</div>
              <div className="text-2xl font-bold text-gray-900">{getTotalBordereau().toFixed(2)}</div>
            </div>
            <div className="text-center border-l border-r border-gray-300">
              <div className="text-sm text-gray-600 mb-1">Total Réalisé</div>
              <div className="text-2xl font-bold text-primary-600">{getTotalRealise().toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-1">Progression Globale</div>
              <div className="text-2xl font-bold text-primary-600">{getPourcentageGlobal().toFixed(1)}%</div>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900 font-medium mb-1">💡 Conseil</p>
          <p className="text-xs text-blue-700">
            Cliquez sur chaque ligne pour la développer et saisir les mesures détaillées. Les calculs se
            font automatiquement en fonction de l'unité.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PeriodeMetrePage;
