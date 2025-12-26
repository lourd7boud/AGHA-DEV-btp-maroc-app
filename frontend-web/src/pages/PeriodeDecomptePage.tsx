import { FC, useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft,
  Save,
  Download,
  Calculator,
  CheckCircle2,
  FileText,
  TrendingUp,
  DollarSign,
  Printer,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { logSyncOperation } from '../services/syncService';
import { generateDecomptePDF } from '../utils/decomptePdfExport';
import { useServerProjectDetails } from '../hooks/useServerData';

// ============================================================
// FONCTIONS DE CALCUL COMPTABLE
// ============================================================
// التقريب العادي: لكل الحسابات (HT, TTC, الكميات...)
// القطع: فقط لـ TVA (يقطع بعد رقمين من الفاصلة بدون تقريب)
// ============================================================

// دالة التقريب العادي - لكل الحسابات ما عدا TVA
const arrondi2 = (value: number | undefined | null): number => {
  const num = Number(value) || 0;
  return Math.round(num * 100) / 100;
};

// Alias للتوافق
const majoration = arrondi2;

// دالة القطع - فقط لـ TVA
// مثال: 164921.486 → 164921.48 (وليس 164921.49)
const truncTVA = (value: number): number => {
  return Math.trunc(value * 100) / 100;
};

// دالة الفورمات للعرض
const formatMontant = (value: number | undefined | null): string => {
  const num = Number(value) || 0;
  return num.toLocaleString('fr-MA', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

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

const PeriodeDecomptePage: FC = () => {
  const { projectId: rawProjectId, periodeId: rawPeriodeId } = useParams<{ projectId: string; periodeId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [isSaving, setIsSaving] = useState(false);
  const [lignes, setLignes] = useState<DecompteLigne[]>([]);
  const [tauxTVA, setTauxTVA] = useState(20); // 20% par défaut
  const [tauxRetenue, setTauxRetenue] = useState(10); // 10% retenue de garantie
  const [decomptesPrecedents, setDecomptesPrecedents] = useState(0);
  const [depensesExercicesAnterieurs, setDepensesExercicesAnterieurs] = useState(0);

  // Clean IDs (without prefix) for API calls
  const cleanProjectId = rawProjectId?.includes(':') ? rawProjectId.split(':').pop()! : rawProjectId;
  // cleanPeriodeId used for debugging if needed
  const _cleanPeriodeId = rawPeriodeId?.includes(':') ? rawPeriodeId.split(':').pop()! : rawPeriodeId;
  void _cleanPeriodeId; // Suppress unused warning

  // Normalize IDs - ensure they have the correct prefix for IndexedDB
  const projectId = rawProjectId?.includes(':') ? rawProjectId : `project:${rawProjectId}`;
  const periodeId = rawPeriodeId?.includes(':') ? rawPeriodeId : `periode:${rawPeriodeId}`;

  // 🔴 SERVER-FIRST: Load data from server first, then use IndexedDB for reactivity
  const { 
    project: serverProject, 
    bordereaux: serverBordereaux,
    periodes: serverPeriodes,
    metres: serverMetres,
    decompts: serverDecompts,
    isLoading: serverLoading, 
    error: serverError,
    refresh: refreshServerData
  } = useServerProjectDetails(cleanProjectId || '', user?.id || null);

  // Get specific data from server-loaded arrays
  const project = serverProject;
  const bordereau = useMemo(() => serverBordereaux?.find(b => !b.deletedAt), [serverBordereaux]);
  const periode = useMemo(() => serverPeriodes?.find(p => {
    const pId = p.id?.includes(':') ? p.id : `periode:${p.id}`;
    return pId === periodeId && !p.deletedAt;
  }), [serverPeriodes, periodeId]);
  
  // Get metres for this specific periode
  const metres = useMemo(() => {
    return serverMetres?.filter(m => {
      const mPeriodeId = m.periodeId?.includes(':') ? m.periodeId : `periode:${m.periodeId}`;
      return mPeriodeId === periodeId && !m.deletedAt;
    }) || [];
  }, [serverMetres, periodeId]);

  // Get existing decompte for this periode
  const existingDecompte = useMemo(() => {
    return serverDecompts?.find(d => {
      const dPeriodeId = d.periodeId?.includes(':') ? d.periodeId : `periode:${d.periodeId}`;
      return dPeriodeId === periodeId && !d.deletedAt;
    });
  }, [serverDecompts, periodeId]);

  console.log('🔍 [DECOMPTE] Server data loaded:', { 
    hasProject: !!project, 
    hasBordereau: !!bordereau, 
    hasPeriode: !!periode,
    metresCount: metres.length,
    serverMetresCount: serverMetres?.length,
    periodeId,
    serverLoading,
    serverError,
    metres: metres.map(m => ({ id: m.id, periodeId: m.periodeId, bordereauLigneId: m.bordereauLigneId, totalCumule: m.totalCumule, totalPartiel: m.totalPartiel }))
  });

  // Charger les paramètres financiers depuis la période
  useEffect(() => {
    if (periode) {
      setTauxTVA(periode.tauxTVA ?? 20);
      setTauxRetenue(periode.tauxRetenue ?? 10);
      setDepensesExercicesAnterieurs(majoration(periode.depensesExercicesAnterieurs ?? 0));
      setDecomptesPrecedents(majoration(periode.decomptesPrecedents ?? 0));
    }
  }, [periode]);

  // Calculer automatiquement les dépenses et acomptes des périodes précédentes
  useEffect(() => {
    const calculatePreviousPayments = async () => {
      if (!periode || !projectId || !project) return;

      // Use the correct projectId format for query
      const queryProjectId = projectId.startsWith('project:') ? projectId : `project:${projectId}`;

      // Récupérer tous les décomptes précédents de ce projet
      const allDecomptes = await db.decompts
        .where('projectId')
        .equals(queryProjectId)
        .and((d) => !d.deletedAt)
        .toArray();

      // Filter to get only previous décomptes (numero < current)
      const decomptesPrecedentsArray = allDecomptes.filter(d => d.numero < periode.numero);

      console.log('📊 Calculating previous payments:', {
        queryProjectId,
        currentPeriodeNumero: periode.numero,
        allDecomptesCount: allDecomptes.length,
        previousDecomptesCount: decomptesPrecedentsArray.length,
        decomptes: decomptesPrecedentsArray.map(d => ({ numero: d.numero, montant: d.montantTotal }))
      });

      if (decomptesPrecedentsArray.length === 0) {
        // Pas de décomptes précédents
        setDepensesExercicesAnterieurs(0);
        setDecomptesPrecedents(0);
        return;
      }

      // Récupérer l'année de la période actuelle
      const anneePeriodeActuelle = new Date(periode.dateDebut).getFullYear();

      let totalExercicesAnterieurs = 0;
      let totalExerciceEnCours = 0;

      // Parcourir tous les décomptes précédents
      for (const decompt of decomptesPrecedentsArray) {
        // Récupérer la période du décompte pour connaître son année
        const periodeDecompt = await db.periodes.get(decompt.periodeId);
        if (!periodeDecompt) {
          console.warn('⚠️ Période not found for décompte:', decompt.id);
          continue;
        }

        const anneeDecompt = new Date(periodeDecompt.dateDebut).getFullYear();
        // Use montantTotal - this is "Montant de l'acompte à délivrer" (the net amount to pay)
        // NOT totalTTC which is "Total Général TTC"
        const montantAPrendre = decompt.montantTotal || 0;

        console.log('📅 Décompte:', {
          numero: decompt.numero,
          anneeDecompt,
          anneePeriodeActuelle,
          montant: montantAPrendre
        });

        // Si le décompte est d'une année précédente → exercices antérieurs
        if (anneeDecompt < anneePeriodeActuelle) {
          totalExercicesAnterieurs += montantAPrendre;
        } 
        // Si le décompte est de la même année → exercice en cours
        else if (anneeDecompt === anneePeriodeActuelle) {
          totalExerciceEnCours += montantAPrendre;
        }
      }

      console.log('💰 Calculated totals:', {
        totalExercicesAnterieurs,
        totalExerciceEnCours
      });

      setDepensesExercicesAnterieurs(majoration(totalExercicesAnterieurs));
      setDecomptesPrecedents(majoration(totalExerciceEnCours));
    };

    calculatePreviousPayments();
  }, [periode, projectId, project]);

  // Helper to normalize bordereauLigneId (remove prefix if present)
  const normalizeBordereauLigneId = (id: string): string => {
    if (!id) return '';
    return id.replace(/^bordereau:/, '');
  };

  // Charger les lignes du décompte - TOUJOURS mettre à jour les quantités depuis les métrés
  useEffect(() => {
    // Générer les lignes depuis bordereau + metres (les métrés sont déjà cumulés)
    if (bordereau && metres.length > 0) {
      const cleanBordereauId = normalizeBordereauLigneId(bordereau.id);
      
      const decompteLines: DecompteLigne[] = bordereau.lignes.map((ligne: { numero: number; designation: string; unite: string; quantite: number; prixUnitaire?: number }) => {
        const ligneId = `${cleanBordereauId}-ligne-${ligne.numero}`;
        
        // Trouver le métré correspondant (compare normalized IDs)
        const metre = metres.find((m) => {
          const metreLineId = normalizeBordereauLigneId(m.bordereauLigneId);
          return metreLineId === ligneId;
        });

        // Les métrés sont déjà cumulés (copiés de la période précédente + ajouts)
        // Use totalCumule for cumulative, or totalPartiel for current period
        const quantiteRealisee = majoration(metre?.totalCumule || metre?.totalPartiel || 0);
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
    } else if (bordereau && metres.length === 0) {
      const cleanBordereauId = normalizeBordereauLigneId(bordereau.id);
      
      // إذا لم يكن هناك ميتري، عرض البوردرو فقط بكميات صفر
      const decompteLines: DecompteLigne[] = bordereau.lignes.map((ligne: { numero: number; designation: string; unite: string; quantite: number; prixUnitaire?: number }) => {
        const prixUnitaireHT = majoration(ligne.prixUnitaire || 0);
        return {
          prixNo: ligne.numero,
          designation: ligne.designation,
          unite: ligne.unite,
          quantiteBordereau: ligne.quantite,
          quantiteRealisee: 0,
          prixUnitaireHT,
          montantHT: 0,
          bordereauLigneId: `${cleanBordereauId}-ligne-${ligne.numero}`,
        };
      });
      setLignes(decompteLines);
    }
  }, [bordereau, metres]);

  // ============================================================
  // CALCULS FINANCIERS
  // ============================================================
  // Total HT: تقريب عادي
  const totalHT = arrondi2(lignes.reduce((sum, ligne) => sum + (Number(ligne.montantHT) || 0), 0));
  // TVA: قطع فقط (بدون تقريب) - هذا إلزامي للتطبيقات الحكومية
  const montantTVA = truncTVA(totalHT * (Number(tauxTVA) || 20) / 100);
  // TTC: تقريب عادي
  const totalTTC = arrondi2(totalHT + montantTVA);
  
  // Log للتحقق
  console.log("[FINAL TOTALS]", { totalHT, montantTVA, totalTTC, tauxTVA });

  // Récapitulatif
  const getRecapCalculations = (): RecapCalculations => {
    // Nouvelle logique basée sur isDecompteDernier
    let travauxTermines = 0;
    let travauxNonTermines = 0;

    if (periode?.isDecompteDernier) {
      // Décompte Dernier: tout va dans Travaux terminés
      travauxTermines = totalTTC;
      travauxNonTermines = 0;
    } else {
      // Décompte normal: tout va dans Travaux non terminés
      travauxTermines = 0;
      travauxNonTermines = totalTTC;
    }

    const approvisionnements = 0; // À implémenter si nécessaire

    const totalAvantRetenue = totalTTC;

    // RETENUE DE GARANTIE: MIN(10% du décompte TTC, 7% du montant total du marché)
    // Formule Excel: =+MIN(TRUNC(I28*10%;2);TRUNC(K28*7%;2))
    const montantMarcheTTC = majoration(bordereau?.lignes.reduce((sum: number, ligne: { quantite: number; prixUnitaire?: number }) => {
      const montantHT = majoration(ligne.quantite * (ligne.prixUnitaire || 0));
      return sum + majoration(montantHT * 1.2); // +20% TVA
    }, 0) || 0);

    const retenue10Pourcent = majoration(totalTTC * 0.10); // 10% du décompte
    const retenue7Pourcent = majoration(montantMarcheTTC * 0.07); // 7% du marché
    const retenueGarantie = majoration(Math.min(retenue10Pourcent, retenue7Pourcent));

    // Calcul selon l'ordre Excel: TOTAUX - dépenses antérieurs = reste à payer
    const totalRestes = majoration(totalAvantRetenue - retenueGarantie);
    const resteAPayer = majoration(totalRestes - depensesExercicesAnterieurs);
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

  // تحديث الديكونت تلقائياً عند تغير البيانات
  useEffect(() => {
    const autoUpdateDecompte = async () => {
      if (!user || !projectId || !periodeId || !periode || !existingDecompte) return;
      if (lignes.length === 0) return;

      const now = new Date().toISOString();
      const newMontantTotal = recap.montantAcompte;

      // تحديث فقط إذا تغير المبلغ
      if (existingDecompte.montantTotal !== newMontantTotal || existingDecompte.totalTTC !== totalTTC) {
        await db.decompts.update(existingDecompte.id, {
          lignes: lignes,
          montantTotal: newMontantTotal,
          totalTTC: totalTTC,
          updatedAt: now,
        });
        console.log('✅ Décompte mis à jour automatiquement:', newMontantTotal, 'TTC:', totalTTC);
      }
    };

    autoUpdateDecompte();
  }, [lignes, recap.montantAcompte, existingDecompte, user, projectId, periodeId, periode]);
  const handleSave = async () => {
    if (!user || !projectId || !periodeId || !periode) return;

    setIsSaving(true);

    try {
      const now = new Date().toISOString();

      // 1. Sauvegarder les paramètres financiers dans la période
      await db.periodes.update(periodeId, {
        tauxTVA,
        tauxRetenue,
        depensesExercicesAnterieurs,
        decomptesPrecedents,
        updatedAt: now,
      });

      await logSyncOperation(
        'UPDATE',
        'periode',
        periodeId.replace('periode:', ''),
        { tauxTVA, tauxRetenue, depensesExercicesAnterieurs, decomptesPrecedents },
        user.id
      );

      // 2. Sauvegarder le décompte
      if (existingDecompte) {
        // Mettre à jour le décompte existant
        await db.decompts.update(existingDecompte.id, {
          lignes: lignes,
          montantTotal: recap.montantAcompte,
          totalTTC: totalTTC, // Total TTC avant retenues
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
        // Créer un nouveau décompte
        const decomptId = `decompt:${uuidv4()}`;

        const newDecompte = {
          id: decomptId,
          projectId: projectId,
          periodeId: periodeId,
          userId: user.id,
          numero: periode.numero,
          lignes: lignes,
          montantTotal: recap.montantAcompte,
          totalTTC: totalTTC, // Total TTC avant retenues
          statut: 'draft' as const,
          createdAt: now,
          updatedAt: now,
        };

        await db.decompts.add(newDecompte);
        await logSyncOperation('CREATE', 'decompt', decomptId.replace('decompt:', ''), newDecompte, user.id);
      }

      alert('Décompte enregistré avec succès !');
      // Stay on the same page - don't navigate away
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde du décompte');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPDF = async () => {
    if (!project || !periode || !bordereau || !projectId) {
      alert('Données manquantes pour générer le PDF');
      return;
    }

    try {
      console.log('🔍 Recherche des décomptes précédents...');
      console.log('🔍 Project ID:', projectId);
      console.log('🔍 Période actuelle:', periode);
      
      // Récupérer TOUS les décomptes du projet
      const tousLesDecomptes = await db.decompts
        .where('projectId')
        .equals(`project:${projectId}`)
        .toArray();
      
      console.log('🔍 TOUS les décomptes du projet:', tousLesDecomptes);
      
      // Filtrer les décomptes précédents (sans deletedAt et numero < période actuelle)
      const decomptesPrecedentsArray = tousLesDecomptes.filter(
        (d) => !d.deletedAt && d.numero < periode.numero
      );

      console.log('📊 Décomptes précédents filtrés:', decomptesPrecedentsArray);

      // Récupérer les périodes correspondantes pour avoir les dates
      const decomptsPrecedentsAvecDates = await Promise.all(
        decomptesPrecedentsArray.map(async (decompt) => {
          const periodeDecompt = await db.periodes.get(decompt.periodeId);
          console.log(`📅 Période du décompte ${decompt.numero}:`, periodeDecompt);
          return {
            numero: decompt.numero,
            date: periodeDecompt ? new Date(periodeDecompt.dateFin).toLocaleDateString('fr-FR') : '',
            montant: decompt.montantTotal,
            isDecompteDernier: periodeDecompt?.isDecompteDernier || false,
          };
        })
      );

      // Trier par numéro
      decomptsPrecedentsAvecDates.sort((a, b) => a.numero - b.numero);

      console.log('📊 Décomptes précédents avec dates (triés):', decomptsPrecedentsAvecDates);

      await generateDecomptePDF(
        project,
        periode,
        bordereau,
        lignes,
        recap,
        tauxTVA,
        totalHT,
        montantTVA,
        totalTTC,
        decomptsPrecedentsAvecDates
      );
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      alert('Erreur lors de la génération du PDF');
    }
  };

  // Fonction d'impression directe
  const handlePrint = async () => {
    if (!project || !periode || !bordereau || !projectId) {
      alert('Données manquantes pour imprimer');
      return;
    }

    try {
      // Récupérer les décomptes précédents pour l'impression
      const decomptsPrecedentsAvecDates = (serverDecompts || [])
        .filter((d) => d.numero < periode.numero)
        .map((decompt) => {
          const periodeDecompt = serverPeriodes?.find(
            (p) => p.id === decompt.periodeId || 
                   p.id === decompt.periodeId.replace('periode:', '') ||
                   `periode:${p.id}` === decompt.periodeId
          );
          return {
            numero: decompt.numero,
            date: periodeDecompt ? new Date(periodeDecompt.dateFin).toLocaleDateString('fr-FR') : '',
            montant: decompt.montantTotal,
            isDecompteDernier: periodeDecompt?.isDecompteDernier || false,
          };
        })
        .sort((a, b) => a.numero - b.numero);

      await generateDecomptePDF(
        project,
        periode,
        bordereau,
        lignes,
        recap,
        tauxTVA,
        totalHT,
        montantTVA,
        totalTTC,
        decomptsPrecedentsAvecDates,
        true // طباعة مباشرة
      );
    } catch (error) {
      console.error('Erreur lors de l\'impression:', error);
      alert('Erreur lors de l\'impression');
    }
  };

  // Show loading state
  if (serverLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Chargement des données du serveur...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (serverError) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center text-red-600">
          <p className="text-lg font-medium mb-2">Erreur de chargement</p>
          <p className="text-sm">{serverError}</p>
          <button 
            onClick={refreshServerData} 
            className="mt-4 btn-primary"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!project || !periode || !bordereau) {
    console.log('🔴 [DECOMPTE] Missing data after server load:', { 
      hasProject: !!project, 
      hasPeriode: !!periode, 
      hasBordereau: !!bordereau,
      projectId,
      periodeId,
      serverPeriodesCount: serverPeriodes?.length,
      serverBordereauxCount: serverBordereaux?.length
    });
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Chargement...</p>
          <p className="text-xs text-gray-400 mt-2">
            Project: {project ? '✓' : '✗'} | Période: {periode ? '✓' : '✗'} | Bordereau: {bordereau ? '✓' : '✗'}
          </p>
          <button 
            onClick={refreshServerData} 
            className="mt-4 text-sm text-primary-600 hover:underline"
          >
            Rafraîchir les données
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(`/projects/${rawProjectId}`)}
          className="btn-secondary mb-4 flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour au projet
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Décompte Provisoire N°{periode.numero.toString().padStart(2, '0')}{periode.isDecompteDernier ? ' et dernier' : ''}
            </h1>
            <p className="text-gray-600">
              Période: {periode.libelle} •{' '}
              {format(new Date(periode.dateDebut), 'dd/MM/yyyy', { locale: fr })} -{' '}
              {format(new Date(periode.dateFin), 'dd/MM/yyyy', { locale: fr })}
            </p>
            <p className="text-sm text-gray-500 mt-1">{project.objet}</p>
          </div>

          <div className="flex gap-3">
            <button onClick={handleExportPDF} className="btn-secondary flex items-center gap-2">
              <Download className="w-5 h-5" />
              Exporter PDF
            </button>
            <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Imprimer
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              {isSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>

      {/* Informations du projet */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary-600" />
          Informations du Projet
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-semibold text-gray-700">Maître d'ouvrage:</span>
            <p className="text-gray-900">ROYAUME DU MAROC - Ministère de l'Agriculture</p>
          </div>
          <div>
            <span className="font-semibold text-gray-700">Projet:</span>
            <p className="text-gray-900">{project.objet}</p>
          </div>
          <div>
            <span className="font-semibold text-gray-700">Marché N°:</span>
            <p className="text-gray-900">{project.marcheNo}</p>
          </div>
          <div>
            <span className="font-semibold text-gray-700">Montant du marché (TTC):</span>
            <p className="text-gray-900 font-bold text-primary-600">
              {bordereau.lignes
                .reduce((sum: number, l: { quantite: number; prixUnitaire?: number }) => {
                  const montantHT = l.quantite * (l.prixUnitaire || 0);
                  const montantTTC = montantHT * 1.2; // +20% TVA
                  return sum + montantTTC;
                }, 0)
                .toFixed(2)
                .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}{' '}
              DH
            </p>
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
              <p className="text-2xl font-bold text-gray-900">{lignes.length}</p>
              <p className="text-sm text-gray-600">Lignes</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatMontant(totalHT)}
              </p>
              <p className="text-sm text-gray-600">Total HT (DH)</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatMontant(totalTTC)}
              </p>
              <p className="text-sm text-gray-600">Total TTC (DH)</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatMontant(recap.montantAcompte)}
              </p>
              <p className="text-sm text-gray-600">À payer (DH)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tableau des prestations */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Désignations des Prestations</h2>
        <div className="overflow-x-auto">
          <table className="w-full border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-r border-gray-300 w-16">
                  Prix N°
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-r border-gray-300">
                  Désignation des Prestations
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-r border-gray-300 w-16">
                  U
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 border-r border-gray-300 w-28">
                  Quantité
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 border-r border-gray-300 w-32">
                  Prix U En DH hors TVA
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 w-36">
                  Prix Total En DH hors TVA
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {lignes.map((ligne) => (
                <tr key={ligne.bordereauLigneId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 font-medium border-r border-gray-200">
                    {ligne.prixNo}
                  </td>
                  <td className="px-4 py-3 text-gray-900 border-r border-gray-200">
                    {ligne.designation}
                  </td>
                  <td className="px-4 py-3 text-center border-r border-gray-200">
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                      {ligne.unite}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-700 border-r border-gray-200">
                    {formatMontant(ligne.quantiteRealisee)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-700 border-r border-gray-200">
                    {formatMontant(ligne.prixUnitaireHT)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {formatMontant(ligne.montantHT)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100 border-t-2 border-gray-300">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right font-bold text-gray-900">
                  Total Général Hors TVA
                </td>
                <td className="px-4 py-3 text-right font-bold text-xl text-primary-600">
                  {formatMontant(totalHT)}
                </td>
              </tr>
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right font-bold text-gray-900">
                  Total TVA ({tauxTVA}%)
                </td>
                <td className="px-4 py-3 text-right font-bold text-xl text-primary-600">
                  {formatMontant(montantTVA)}
                </td>
              </tr>
              <tr className="bg-primary-50">
                <td colSpan={5} className="px-4 py-3 text-right font-bold text-gray-900">
                  Total Général (T.T.C)
                </td>
                <td className="px-4 py-3 text-right font-bold text-2xl text-primary-600">
                  {formatMontant(totalTTC)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Récapitulation */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Récapitulation</h2>
        <div className="overflow-x-auto">
          <table className="w-full border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-r border-gray-300">
                  Nature des Dépenses
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 border-r border-gray-300 w-40 whitespace-nowrap">
                  Montants
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 border-r border-gray-300 w-48 whitespace-nowrap">
                  Retenue de Garantie
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 w-40 whitespace-nowrap">
                  Restes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="px-4 py-3 text-gray-900 border-r border-gray-200">Travaux terminés</td>
                <td className="px-4 py-3 text-right font-medium text-gray-700 border-r border-gray-200">
                  {formatMontant(recap.travauxTermines)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-700 border-r border-gray-200">
                  {periode?.isDecompteDernier ? formatMontant(recap.retenueGarantie) : ''}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-700">
                  {periode?.isDecompteDernier ? formatMontant(recap.travauxTermines - recap.retenueGarantie) : ''}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-gray-900 border-r border-gray-200">
                  Travaux non terminés
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-700 border-r border-gray-200">
                  {formatMontant(recap.travauxNonTermines)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-700 border-r border-gray-200">
                  {!periode?.isDecompteDernier ? formatMontant(recap.retenueGarantie) : ''}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-700">
                  {!periode?.isDecompteDernier ? formatMontant(recap.travauxNonTermines - recap.retenueGarantie) : ''}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-gray-900 border-r border-gray-200">
                  Approvisionnements
                </td>
                <td className="px-4 py-3 border-r border-gray-200"></td>
                <td className="px-4 py-3 border-r border-gray-200"></td>
                <td className="px-4 py-3"></td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-3 text-gray-900 font-bold border-r border-gray-200">TOTAUX</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900 border-r border-gray-200">
                  {formatMontant(recap.totalAvantRetenue)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900 border-r border-gray-200">
                  {formatMontant(recap.retenueGarantie)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {formatMontant(recap.totalAvantRetenue - recap.retenueGarantie)}
                </td>
              </tr>
              <tr className="bg-gray-50">
                <td
                  colSpan={3}
                  className="px-4 py-3 text-right text-gray-900 font-semibold border-r border-gray-200"
                >
                  À déduire les dépenses imputées sur exercices antérieurs
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-700">
                  {formatMontant(recap.depensesExercicesAnterieurs)}
                </td>
              </tr>
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-3 text-right text-gray-900 font-semibold border-r border-gray-200"
                >
                  Reste à payer sur l'exercice en cours
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {formatMontant(recap.resteAPayer)}
                </td>
              </tr>
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-3 text-right text-gray-900 font-semibold border-r border-gray-200"
                >
                  À déduire le montant des acomptes délivrés sur l'exercice en cours
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-700">
                  {formatMontant(decomptesPrecedents)}
                </td>
              </tr>
              <tr className="bg-primary-50">
                <td
                  colSpan={3}
                  className="px-4 py-3 text-right text-gray-900 font-bold border-r border-gray-200"
                >
                  Montant de l'acompte à délivrer:
                </td>
                <td className="px-4 py-3 text-right font-bold text-2xl text-primary-600">
                  {formatMontant(recap.montantAcompte)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900 font-medium">
            Arrêté par nous, Sous-Ordonnateur, à la somme de: <span className="font-bold">{numberToWords(recap.montantAcompte)}</span>
          </p>
        </div>
      </div>

      {/* Paramètres */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Paramètres du Décompte</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Taux TVA (%)</label>
            <input
              type="number"
              value={tauxTVA}
              onChange={(e) => setTauxTVA(parseFloat(e.target.value) || 0)}
              className="input"
              min="0"
              max="100"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Retenue de garantie (%)
            </label>
            <input
              type="number"
              value={tauxRetenue}
              onChange={(e) => setTauxRetenue(parseFloat(e.target.value) || 0)}
              className="input"
              min="0"
              max="100"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Dépenses exercices antérieurs (DH)
            </label>
            <input
              type="number"
              value={depensesExercicesAnterieurs}
              onChange={(e) => setDepensesExercicesAnterieurs(majoration(parseFloat(e.target.value) || 0))}
              className="input"
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Décomptes précédents (DH)
            </label>
            <input
              type="number"
              value={decomptesPrecedents}
              onChange={(e) => setDecomptesPrecedents(majoration(parseFloat(e.target.value) || 0))}
              className="input"
              min="0"
              step="0.01"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper pour convertir les nombres en lettres (français - format officiel Maroc)
const numberToWords = (num: number): string => {
  // Séparer la partie entière et les centimes
  const dirhams = Math.floor(num);
  const centimes = Math.round((num - dirhams) * 100);

  const convertNumber = (n: number): string => {
    const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
    const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
    const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

    if (n === 0) return '';
    if (n < 10) return units[n];
    if (n >= 10 && n < 20) return teens[n - 10];

    const ten = Math.floor(n / 10);
    const unit = n % 10;

    if (ten === 7 || ten === 9) {
      // 70-79: soixante-dix, soixante-onze, etc.
      // 90-99: quatre-vingt-dix, quatre-vingt-onze, etc.
      const baseTen = tens[ten];
      const remainder = 10 + unit;
      if (remainder < 20) {
        return baseTen + '-' + teens[remainder - 10];
      }
      return baseTen + '-' + units[unit];
    }

    if (ten === 8) {
      // 80: quatre-vingts, 81-89: quatre-vingt-un, etc.
      if (unit === 0) return 'quatre-vingts';
      return 'quatre-vingt-' + units[unit];
    }

    if (unit === 0) return tens[ten];
    if (unit === 1 && ten === 2) return 'vingt et un';
    if (unit === 1 && (ten === 3 || ten === 4 || ten === 5 || ten === 6)) return tens[ten] + ' et un';
    
    return tens[ten] + '-' + units[unit];
  };

  const convertHundreds = (n: number): string => {
    if (n === 0) return '';
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;

    let result = '';
    if (hundred > 1) {
      result = convertNumber(hundred) + ' cent';
      if (remainder === 0) result += 's';
    } else if (hundred === 1) {
      result = 'cent';
    }

    if (remainder > 0) {
      if (result) result += ' ';
      result += convertNumber(remainder);
    }

    return result;
  };

  const convertThousands = (n: number): string => {
    if (n === 0) return 'zéro';
    
    const millions = Math.floor(n / 1000000);
    const thousands = Math.floor((n % 1000000) / 1000);
    const hundreds = n % 1000;

    let result = '';

    if (millions > 0) {
      if (millions === 1) {
        result += 'un million';
      } else {
        result += convertHundreds(millions) + ' millions';
      }
    }

    if (thousands > 0) {
      if (result) result += ' ';
      if (thousands === 1) {
        result += 'mille';
      } else {
        result += convertHundreds(thousands) + ' mille';
      }
    }

    if (hundreds > 0) {
      if (result) result += ' ';
      result += convertHundreds(hundreds);
    }

    return result;
  };

  let result = convertThousands(dirhams).trim();
  result = result.charAt(0).toUpperCase() + result.slice(1);
  result += ' DIRHAMS';

  if (centimes > 0) {
    result += ', ' + centimes.toString().padStart(2, '0') + ' CTS';
  }

  return result;
};

export default PeriodeDecomptePage;
