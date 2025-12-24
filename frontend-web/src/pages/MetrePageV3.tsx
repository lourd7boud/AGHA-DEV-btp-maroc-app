import { FC, useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Metre, MetreSection, MetreSubSection } from '../db/database';
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
  Layers,
  MapPin,
  Building2,
  Edit3,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { logSyncOperation } from '../services/syncService';
import { calculatePartiel, getCalculationType, type UniteType } from '../utils/metreCalculations';
import { pullLatestData } from '../hooks/useSyncManager';

// ============== INTERFACES ==============

interface MetreLigneInput {
  id: string;
  sectionId?: string;
  subSectionId?: string;
  numero: number;
  designation: string;
  nombreSemblables?: number;
  longueur?: number;
  largeur?: number;
  profondeur?: number;
  nombre?: number;
  diametre?: number;
  partiel: number;
  observations?: string;
}

interface MetreQuickV3 {
  bordereauLigneId: string;
  numeroLigne: number;
  designation: string;
  unite: string;
  quantiteBordereau: number;
  prixUnitaire: number;
  // Hierarchical structure
  sections: MetreSection[];
  subSections: MetreSubSection[];
  lignes: MetreLigneInput[];
  isExpanded: boolean;
  cumulPrecedent: number;
}

// ============== SECTION COLORS ==============
const SECTION_COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800', header: 'bg-blue-500' },
  { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800', header: 'bg-green-500' },
  { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-800', header: 'bg-purple-500' },
  { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-800', header: 'bg-orange-500' },
  { bg: 'bg-pink-100', border: 'border-pink-400', text: 'text-pink-800', header: 'bg-pink-500' },
  { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-800', header: 'bg-cyan-500' },
];

const SUBSECTION_COLORS = [
  { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700' },
  { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700' },
  { bg: 'bg-lime-50', border: 'border-lime-300', text: 'text-lime-700' },
  { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-700' },
  { bg: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-700' },
];

// ============== MAIN COMPONENT ==============

const MetrePageV3: FC = () => {
  const { projectId: rawProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // State
  const [metresQuick, setMetresQuick] = useState<MetreQuickV3[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showOnlyWithData, setShowOnlyWithData] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSubSectionId, setEditingSubSectionId] = useState<string | null>(null);

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

  const allMetres = useLiveQuery(
    () =>
      db.metres
        .where('projectId')
        .equals(projectId)
        .and((m) => !m.deletedAt)
        .toArray(),
    [projectId]
  );

  // ============== HELPER FUNCTIONS ==============

  const normalizeBordereauLigneId = (id: string): string => {
    if (!id) return '';
    return id.replace(/^bordereau:/, '');
  };

  const getSectionColor = (index: number) => SECTION_COLORS[index % SECTION_COLORS.length];
  const getSubSectionColor = (index: number) => SUBSECTION_COLORS[index % SUBSECTION_COLORS.length];

  // ============== COMPUTED VALUES ==============

  const metresByCumulatif = useMemo(() => {
    if (!allMetres) return new Map<string, { total: number; metres: Metre[] }>();

    const grouped = new Map<string, { total: number; metres: Metre[] }>();

    for (const metre of allMetres) {
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
      const quickData: MetreQuickV3[] = bordereau.lignes.map((ligne) => {
        const cleanBordereauId = normalizeBordereauLigneId(bordereau.id);
        const ligneId = `${cleanBordereauId}-ligne-${ligne.numero}`;
        const cumulData = metresByCumulatif.get(ligneId);

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
          sections: latestMetre?.sections || [],
          subSections: latestMetre?.subSections || [],
          lignes: latestMetre?.lignes || [],
          isExpanded: false,
          cumulPrecedent: cumulData?.total || 0,
        };
      });

      setMetresQuick(quickData);
    }
  }, [bordereau, allMetres, metresByCumulatif]);

  // ============== SECTION HANDLERS ==============

  const handleAddSection = (bordereauLigneId: string) => {
    const item = metresQuick.find((m) => m.bordereauLigneId === bordereauLigneId);
    if (!item) return;

    const newSection: MetreSection = {
      id: `section-${uuidv4()}`,
      titre: 'Nouvelle Section (Douar/Lieu)',
      ordre: item.sections.length + 1,
      isCollapsed: false,
    };

    setMetresQuick((prev) =>
      prev.map((m) =>
        m.bordereauLigneId === bordereauLigneId
          ? { ...m, sections: [...m.sections, newSection], isExpanded: true }
          : m
      )
    );
    setEditingSectionId(newSection.id);
  };

  const handleUpdateSection = (bordereauLigneId: string, sectionId: string, titre: string) => {
    setMetresQuick((prev) =>
      prev.map((m) =>
        m.bordereauLigneId === bordereauLigneId
          ? {
              ...m,
              sections: m.sections.map((s) =>
                s.id === sectionId ? { ...s, titre } : s
              ),
            }
          : m
      )
    );
  };

  const handleDeleteSection = (bordereauLigneId: string, sectionId: string) => {
    if (!confirm('Supprimer cette section et toutes ses sous-sections et mesures ?')) return;

    setMetresQuick((prev) =>
      prev.map((m) =>
        m.bordereauLigneId === bordereauLigneId
          ? {
              ...m,
              sections: m.sections.filter((s) => s.id !== sectionId),
              subSections: m.subSections.filter((ss) => ss.sectionId !== sectionId),
              lignes: m.lignes.filter((l) => l.sectionId !== sectionId),
            }
          : m
      )
    );
  };

  const handleToggleSection = (bordereauLigneId: string, sectionId: string) => {
    setMetresQuick((prev) =>
      prev.map((m) =>
        m.bordereauLigneId === bordereauLigneId
          ? {
              ...m,
              sections: m.sections.map((s) =>
                s.id === sectionId ? { ...s, isCollapsed: !s.isCollapsed } : s
              ),
            }
          : m
      )
    );
  };

  // ============== SUBSECTION HANDLERS ==============

  const handleAddSubSection = (bordereauLigneId: string, sectionId: string) => {
    const item = metresQuick.find((m) => m.bordereauLigneId === bordereauLigneId);
    if (!item) return;

    const sectionSubSections = item.subSections.filter((ss) => ss.sectionId === sectionId);

    const newSubSection: MetreSubSection = {
      id: `subsection-${uuidv4()}`,
      sectionId,
      titre: 'Nouvel Élément',
      ordre: sectionSubSections.length + 1,
      isCollapsed: false,
    };

    setMetresQuick((prev) =>
      prev.map((m) =>
        m.bordereauLigneId === bordereauLigneId
          ? { ...m, subSections: [...m.subSections, newSubSection] }
          : m
      )
    );
    setEditingSubSectionId(newSubSection.id);
  };

  const handleUpdateSubSection = (bordereauLigneId: string, subSectionId: string, titre: string) => {
    setMetresQuick((prev) =>
      prev.map((m) =>
        m.bordereauLigneId === bordereauLigneId
          ? {
              ...m,
              subSections: m.subSections.map((ss) =>
                ss.id === subSectionId ? { ...ss, titre } : ss
              ),
            }
          : m
      )
    );
  };

  const handleDeleteSubSection = (bordereauLigneId: string, subSectionId: string) => {
    if (!confirm('Supprimer cette sous-section et toutes ses mesures ?')) return;

    setMetresQuick((prev) =>
      prev.map((m) =>
        m.bordereauLigneId === bordereauLigneId
          ? {
              ...m,
              subSections: m.subSections.filter((ss) => ss.id !== subSectionId),
              lignes: m.lignes.filter((l) => l.subSectionId !== subSectionId),
            }
          : m
      )
    );
  };

  const handleToggleSubSection = (bordereauLigneId: string, subSectionId: string) => {
    setMetresQuick((prev) =>
      prev.map((m) =>
        m.bordereauLigneId === bordereauLigneId
          ? {
              ...m,
              subSections: m.subSections.map((ss) =>
                ss.id === subSectionId ? { ...ss, isCollapsed: !ss.isCollapsed } : ss
              ),
            }
          : m
      )
    );
  };

  // ============== LIGNE HANDLERS ==============

  const handleAddLigne = (bordereauLigneId: string, sectionId?: string, subSectionId?: string) => {
    const item = metresQuick.find((m) => m.bordereauLigneId === bordereauLigneId);
    if (!item) return;

    // Filter lignes by context
    let contextLignes = item.lignes;
    if (subSectionId) {
      contextLignes = item.lignes.filter((l) => l.subSectionId === subSectionId);
    } else if (sectionId) {
      contextLignes = item.lignes.filter((l) => l.sectionId === sectionId && !l.subSectionId);
    }

    const newLigneNumero = contextLignes.length + 1;

    const newLigne: MetreLigneInput = {
      id: `${bordereauLigneId}-mesure-${Date.now()}`,
      sectionId,
      subSectionId,
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
              lignes: m.lignes.filter((l) => l.id !== ligneId),
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

  const handleToggleExpand = (bordereauLigneId: string) => {
    setMetresQuick((prev) =>
      prev.map((item) =>
        item.bordereauLigneId === bordereauLigneId
          ? { ...item, isExpanded: !item.isExpanded }
          : item
      )
    );
  };

  // ============== SAVE FUNCTION ==============

  const handleSaveAll = async () => {
    if (!user || !projectId || !bordereau) return;

    setIsSaving(true);

    try {
      const now = new Date().toISOString();

      for (const metreQuick of metresQuick) {
        if (metreQuick.lignes.length === 0 && metreQuick.sections.length === 0) continue;

        const totalPartiel = metreQuick.lignes.reduce((sum, ligne) => sum + ligne.partiel, 0);
        const pourcentage = metreQuick.quantiteBordereau > 0
          ? (totalPartiel / metreQuick.quantiteBordereau) * 100
          : 0;

        const existingMetre = allMetres?.find(
          (m) => m.bordereauLigneId === metreQuick.bordereauLigneId
        );

        if (existingMetre) {
          await db.metres.update(existingMetre.id, {
            sections: metreQuick.sections,
            subSections: metreQuick.subSections,
            lignes: metreQuick.lignes,
            totalPartiel,
            totalCumule: totalPartiel,
            pourcentageRealisation: pourcentage,
            updatedAt: now,
          });

          await logSyncOperation(
            'UPDATE',
            'metre',
            existingMetre.id.replace('metre:', ''),
            {
              sections: metreQuick.sections,
              subSections: metreQuick.subSections,
              lignes: metreQuick.lignes,
              totalPartiel,
              totalCumule: totalPartiel,
              pourcentageRealisation: pourcentage,
            },
            user.id
          );
        } else {
          const metreId = `metre:${uuidv4()}`;

          const newMetre: Metre = {
            id: metreId,
            projectId: projectId,
            periodeId: '',
            bordereauLigneId: metreQuick.bordereauLigneId,
            userId: user.id,
            reference: `METRE-L${metreQuick.numeroLigne}`,
            designationBordereau: metreQuick.designation,
            unite: metreQuick.unite,
            sections: metreQuick.sections,
            subSections: metreQuick.subSections,
            lignes: metreQuick.lignes,
            totalPartiel,
            totalCumule: totalPartiel,
            quantiteBordereau: metreQuick.quantiteBordereau,
            pourcentageRealisation: pourcentage,
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const rawProjectId = projectId.replace('project:', '');
      await pullLatestData(rawProjectId);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportAttachement = () => {
    const rawProjectId = projectId.replace('project:', '');
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

  // Calculate section total
  const getSectionTotal = (item: MetreQuickV3, sectionId: string) => {
    return item.lignes
      .filter((l) => l.sectionId === sectionId)
      .reduce((sum, l) => sum + l.partiel, 0);
  };

  // Calculate subsection total
  const getSubSectionTotal = (item: MetreQuickV3, subSectionId: string) => {
    return item.lignes
      .filter((l) => l.subSectionId === subSectionId)
      .reduce((sum, l) => sum + l.partiel, 0);
  };

  const displayItems = showOnlyWithData
    ? metresQuick.filter((m) => m.lignes.length > 0 || m.sections.length > 0)
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

  // ============== RENDER TABLE FOR A CONTEXT ==============

  const renderMeasurementTable = (
    item: MetreQuickV3,
    sectionId?: string,
    subSectionId?: string,
    colorClass?: string
  ) => {
    const calculationType = getCalculationType(item.unite as UniteType);
    const champs = calculationType?.champs || [];

    // Filter lignes based on context
    let contextLignes = item.lignes;
    if (subSectionId) {
      contextLignes = item.lignes.filter((l) => l.subSectionId === subSectionId);
    } else if (sectionId) {
      contextLignes = item.lignes.filter((l) => l.sectionId === sectionId && !l.subSectionId);
    } else {
      // Root level - lignes without section
      contextLignes = item.lignes.filter((l) => !l.sectionId);
    }

    if (contextLignes.length === 0) {
      return (
        <div className="text-center py-4 text-gray-500 text-sm">
          <p>Aucune mesure. Cliquez sur "+ Ajouter mesure" pour commencer.</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className={`w-full border ${colorClass || 'border-gray-300'}`}>
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-300 w-12">N°</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-300">Désignation</th>
              {['M³', 'M²', 'ML', 'M'].includes(item.unite) && (
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-16" title="Nombre des parties semblables">Nbre</th>
              )}
              {champs.includes('longueur') && (
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-24">Longueur (m)</th>
              )}
              {champs.includes('largeur') && (
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-24">Largeur (m)</th>
              )}
              {champs.includes('profondeur') && (
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-24">Profondeur (m)</th>
              )}
              {champs.includes('nombre') && (
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-20">Nombre</th>
              )}
              {champs.includes('diametre') && (
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 w-24">Diamètre (mm)</th>
              )}
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border-r border-gray-300 w-28 bg-blue-50">Partiel</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 w-16">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {contextLignes.map((ligne, idx) => (
              <tr key={ligne.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-700 font-medium border-r border-gray-200">{idx + 1}</td>
                <td className="px-3 py-2 border-r border-gray-200">
                  <input
                    type="text"
                    value={ligne.designation}
                    onChange={(e) => handleLigneChange(item.bordereauLigneId, ligne.id, 'designation', e.target.value)}
                    className="input text-sm w-full"
                    placeholder="Description..."
                  />
                </td>
                {['M³', 'M²', 'ML', 'M'].includes(item.unite) && (
                  <td className="px-3 py-2 border-r border-gray-200">
                    <input
                      type="number"
                      value={ligne.nombreSemblables || ''}
                      onChange={(e) => handleLigneChange(item.bordereauLigneId, ligne.id, 'nombreSemblables', parseInt(e.target.value) || 1)}
                      className="input text-sm text-center w-full"
                      step="1"
                      min="1"
                      placeholder="1"
                    />
                  </td>
                )}
                {champs.includes('longueur') && (
                  <td className="px-3 py-2 border-r border-gray-200">
                    <input
                      type="number"
                      value={ligne.longueur || ''}
                      onChange={(e) => handleLigneChange(item.bordereauLigneId, ligne.id, 'longueur', parseFloat(e.target.value) || 0)}
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
                      onChange={(e) => handleLigneChange(item.bordereauLigneId, ligne.id, 'largeur', parseFloat(e.target.value) || 0)}
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
                      onChange={(e) => handleLigneChange(item.bordereauLigneId, ligne.id, 'profondeur', parseFloat(e.target.value) || 0)}
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
                      onChange={(e) => handleLigneChange(item.bordereauLigneId, ligne.id, 'nombre', parseInt(e.target.value) || 0)}
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
                      onChange={(e) => handleLigneChange(item.bordereauLigneId, ligne.id, 'diametre', parseFloat(e.target.value) || 0)}
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
              <td colSpan={2 + champs.length + (['M³', 'M²', 'ML', 'M'].includes(item.unite) ? 1 : 0)} className="px-3 py-2 text-right font-semibold text-gray-700 border-r border-gray-300">
                Total:
              </td>
              <td className="px-3 py-2 text-right font-bold text-primary-700 bg-primary-50 border-r border-gray-300">
                {contextLignes.reduce((sum, l) => sum + l.partiel, 0).toFixed(2)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  // ============== MAIN RENDER ==============

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
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">Métré V3</h1>
              <span className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold rounded-full">
                Hiérarchique
              </span>
            </div>
            <p className="text-gray-700 font-medium">{project.objet}</p>
            <p className="text-sm text-gray-500">Marché N° {project.marcheNo} - {project.annee}</p>
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

      {/* Stats Cards */}
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
            </div>
          </div>
        </div>

        <div className={`card ${getPourcentageFinancier() > 100 ? 'border-2 border-orange-400 bg-orange-50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${getPourcentageFinancier() > 100 ? 'text-orange-600' : 'text-gray-900'}`}>
                {getPourcentageFinancier().toFixed(1)}%
              </p>
              <p className="text-sm text-gray-600">Avancement financier</p>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
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

      {/* Legend */}
      <div className="card mb-4 bg-gradient-to-r from-gray-50 to-slate-50">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span className="font-medium">Section</span>
            <span className="text-gray-500">= Douar / Lieu</span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-red-600" />
            <span className="font-medium">Sous-section</span>
            <span className="text-gray-500">= Élément (semeille, radier, voile...)</span>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-gray-600" />
            <span className="font-medium">Mesure</span>
            <span className="text-gray-500">= Ligne de calcul</span>
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

      {/* Main Accordion List */}
      <div className="card">
        <div className="space-y-3">
          {displayItems.map((item) => {
            const totalPartiel = item.lignes.reduce((sum, ligne) => sum + ligne.partiel, 0);
            const pourcentage = item.quantiteBordereau > 0
              ? (totalPartiel / item.quantiteBordereau) * 100
              : 0;
            const isComplete = pourcentage >= 100;
            const isStarted = totalPartiel > 0;

            return (
              <div
                key={item.bordereauLigneId}
                className={`border-2 rounded-xl overflow-hidden shadow-sm ${
                  isComplete
                    ? pourcentage > 100
                      ? 'border-orange-400 bg-orange-50/50'
                      : 'border-green-400 bg-green-50/50'
                    : 'border-gray-200'
                }`}
              >
                {/* Article Header */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition bg-white"
                  onClick={() => handleToggleExpand(item.bordereauLigneId)}
                >
                  {item.isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  )}

                  <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-700 font-bold rounded-lg text-lg">
                    {item.numeroLigne}
                  </div>

                  <div className="flex-1">
                    <p className="text-gray-900 font-semibold">{item.designation}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                        {item.unite}
                      </span>
                      {item.sections.length > 0 && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                          {item.sections.length} section(s)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-gray-600">
                      Bordereau: {Number(item.quantiteBordereau || 0).toLocaleString()}
                    </div>
                    <div className="text-lg font-bold text-primary-600">
                      Réalisé: {Number(totalPartiel || 0).toFixed(2)}
                    </div>
                  </div>

                  <div className="w-36">
                    <div className="flex items-center gap-2">
                      {isComplete ? (
                        pourcentage > 100 ? (
                          <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        )
                      ) : isStarted ? (
                        <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              pourcentage > 100
                                ? 'bg-gradient-to-r from-orange-400 to-red-500'
                                : isComplete
                                ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                                : pourcentage >= 75
                                ? 'bg-gradient-to-r from-blue-400 to-cyan-500'
                                : 'bg-gradient-to-r from-yellow-400 to-orange-500'
                            }`}
                            style={{ width: `${Math.min(pourcentage, 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className={`text-sm font-bold w-16 text-right ${pourcentage > 100 ? 'text-orange-600' : 'text-gray-700'}`}>
                        {pourcentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {item.isExpanded && (
                  <div className="border-t-2 border-gray-200 bg-gray-50 p-4">
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200">
                      <button
                        onClick={() => handleAddSection(item.bordereauLigneId)}
                        className="btn btn-secondary flex items-center gap-2 text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                      >
                        <MapPin className="w-4 h-4" />
                        + Ajouter Section (Douar)
                      </button>
                      <button
                        onClick={() => handleAddLigne(item.bordereauLigneId)}
                        className="btn btn-secondary flex items-center gap-2 text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        + Ajouter Mesure Directe
                      </button>
                    </div>

                    {/* Root Level Measurements (without section) */}
                    {item.lignes.filter((l) => !l.sectionId).length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-600 mb-2">Mesures Générales</h4>
                        {renderMeasurementTable(item)}
                        <button
                          onClick={() => handleAddLigne(item.bordereauLigneId)}
                          className="mt-2 text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Ajouter mesure
                        </button>
                      </div>
                    )}

                    {/* Sections */}
                    {item.sections.map((section, sectionIndex) => {
                      const sectionColor = getSectionColor(sectionIndex);
                      const sectionSubSections = item.subSections.filter((ss) => ss.sectionId === section.id);
                      const sectionTotal = getSectionTotal(item, section.id);

                      return (
                        <div
                          key={section.id}
                          className={`mb-4 rounded-lg border-2 ${sectionColor.border} ${sectionColor.bg} overflow-hidden`}
                        >
                          {/* Section Header */}
                          <div
                            className={`flex items-center gap-3 px-4 py-3 ${sectionColor.header} text-white cursor-pointer`}
                            onClick={() => handleToggleSection(item.bordereauLigneId, section.id)}
                          >
                            {section.isCollapsed ? (
                              <ChevronRight className="w-5 h-5" />
                            ) : (
                              <ChevronDown className="w-5 h-5" />
                            )}
                            <MapPin className="w-5 h-5" />
                            
                            {editingSectionId === section.id ? (
                              <input
                                type="text"
                                value={section.titre}
                                onChange={(e) => handleUpdateSection(item.bordereauLigneId, section.id, e.target.value)}
                                onBlur={() => setEditingSectionId(null)}
                                onKeyDown={(e) => e.key === 'Enter' && setEditingSectionId(null)}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 bg-white/20 text-white placeholder-white/70 px-2 py-1 rounded border-0 focus:ring-2 focus:ring-white/50"
                                autoFocus
                              />
                            ) : (
                              <span className="flex-1 font-bold text-lg">{section.titre}</span>
                            )}

                            <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-semibold">
                              Total: {sectionTotal.toFixed(2)}
                            </span>

                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setEditingSectionId(section.id)}
                                className="p-1 hover:bg-white/20 rounded"
                                title="Modifier"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteSection(item.bordereauLigneId, section.id)}
                                className="p-1 hover:bg-white/20 rounded"
                                title="Supprimer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Section Content */}
                          {!section.isCollapsed && (
                            <div className="p-4">
                              {/* Add SubSection Button */}
                              <div className="flex items-center gap-2 mb-4">
                                <button
                                  onClick={() => handleAddSubSection(item.bordereauLigneId, section.id)}
                                  className="btn btn-secondary flex items-center gap-2 text-sm bg-white"
                                >
                                  <Building2 className="w-4 h-4" />
                                  + Ajouter Élément (semeille, radier...)
                                </button>
                                <button
                                  onClick={() => handleAddLigne(item.bordereauLigneId, section.id)}
                                  className="btn btn-secondary flex items-center gap-2 text-sm bg-white"
                                >
                                  <Plus className="w-4 h-4" />
                                  + Mesure directe
                                </button>
                              </div>

                              {/* Section-level measurements (without subsection) */}
                              {item.lignes.filter((l) => l.sectionId === section.id && !l.subSectionId).length > 0 && (
                                <div className="mb-4 bg-white rounded-lg p-3">
                                  {renderMeasurementTable(item, section.id, undefined, sectionColor.border)}
                                </div>
                              )}

                              {/* SubSections */}
                              {sectionSubSections.map((subSection, subIndex) => {
                                const subColor = getSubSectionColor(subIndex);
                                const subSectionTotal = getSubSectionTotal(item, subSection.id);

                                return (
                                  <div
                                    key={subSection.id}
                                    className={`mb-3 rounded-lg border ${subColor.border} ${subColor.bg} overflow-hidden`}
                                  >
                                    {/* SubSection Header */}
                                    <div
                                      className={`flex items-center gap-3 px-3 py-2 bg-white border-b ${subColor.border} cursor-pointer`}
                                      onClick={() => handleToggleSubSection(item.bordereauLigneId, subSection.id)}
                                    >
                                      {subSection.isCollapsed ? (
                                        <ChevronRight className="w-4 h-4 text-gray-500" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                      )}
                                      <Building2 className={`w-4 h-4 ${subColor.text}`} />
                                      
                                      {editingSubSectionId === subSection.id ? (
                                        <input
                                          type="text"
                                          value={subSection.titre}
                                          onChange={(e) => handleUpdateSubSection(item.bordereauLigneId, subSection.id, e.target.value)}
                                          onBlur={() => setEditingSubSectionId(null)}
                                          onKeyDown={(e) => e.key === 'Enter' && setEditingSubSectionId(null)}
                                          onClick={(e) => e.stopPropagation()}
                                          className={`flex-1 px-2 py-1 rounded border ${subColor.border} focus:ring-2 focus:ring-primary-300`}
                                          autoFocus
                                        />
                                      ) : (
                                        <span className={`flex-1 font-semibold ${subColor.text}`}>{subSection.titre}</span>
                                      )}

                                      <span className={`px-2 py-0.5 ${subColor.bg} ${subColor.text} rounded text-sm font-medium`}>
                                        {subSectionTotal.toFixed(2)}
                                      </span>

                                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <button
                                          onClick={() => setEditingSubSectionId(subSection.id)}
                                          className="p-1 hover:bg-gray-100 rounded"
                                          title="Modifier"
                                        >
                                          <Edit3 className="w-3 h-3 text-gray-500" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteSubSection(item.bordereauLigneId, subSection.id)}
                                          className="p-1 hover:bg-gray-100 rounded"
                                          title="Supprimer"
                                        >
                                          <Trash2 className="w-3 h-3 text-gray-500" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* SubSection Content */}
                                    {!subSection.isCollapsed && (
                                      <div className="p-3">
                                        {renderMeasurementTable(item, section.id, subSection.id, subColor.border)}
                                        <button
                                          onClick={() => handleAddLigne(item.bordereauLigneId, section.id, subSection.id)}
                                          className="mt-2 text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                        >
                                          <Plus className="w-3 h-3" />
                                          Ajouter mesure
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Grand Total */}
                    <div className="mt-4 pt-4 border-t-2 border-gray-300 bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-gray-700">TOTAL PARTIEL (Article {item.numeroLigne})</span>
                        <span className="text-2xl font-bold text-primary-700">
                          {totalPartiel.toFixed(2)} {item.unite}
                        </span>
                      </div>
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

export default MetrePageV3;
