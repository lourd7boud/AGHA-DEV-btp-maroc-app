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
import { isWeb } from '../utils/platform';
import { apiService } from '../services/apiService';

// ============================================================
// 🔒 FINANCE ENGINE - المرجع الوحيد للحسابات المالية
// ============================================================
// ⚠️ كل الحسابات المالية تتم فقط عبر financeEngine
// ⛔ ممنوع استخدام number أو Math مباشرة للحسابات المالية
// ============================================================
import {
  calculateMontantHT,
  calculateMontantHTInternal,
  calculateTotalHTWithInternal,
  calculateTVAWithInternal,
  calculateTTCWithInternal,
  formatMontant,
  toDecimal,
  round2,
  trunc2,
  toNumber,
  Decimal,
  type LigneDecompte as FinanceLigneDecompte,
  type CalculatedLigne,
} from '../utils/financeEngine';

// Alias للتوافق مع الكود القديم (سيتم إزالته تدريجياً)
const majoration = (value: number | undefined | null): number => {
  return Number(value) || 0;
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
  
  // ============================================================
  // 🔴 FIX CUMUL: حساب الكميات التراكمية بشكل صحيح
  // ============================================================
  // المنطق: لكل سطر بوردرو، نجمع كل الـ partiels من كل الفترات حتى الفترة الحالية
  // ============================================================
  
  const cumulativeQuantities = useMemo(() => {
    if (!serverMetres || !serverPeriodes || !periode) return new Map<string, number>();
    
    // Get all periodes sorted by numero (order)
    const sortedPeriodes = [...serverPeriodes]
      .filter(p => !p.deletedAt)
      .sort((a, b) => (a.numero || 0) - (b.numero || 0));
    
    // Find current periode index
    const currentPeriodeIndex = sortedPeriodes.findIndex(p => {
      const pId = p.id?.includes(':') ? p.id : `periode:${p.id}`;
      return pId === periodeId;
    });
    
    if (currentPeriodeIndex === -1) return new Map<string, number>();
    
    // Get all periode IDs up to and including current
    const relevantPeriodeIds = sortedPeriodes
      .slice(0, currentPeriodeIndex + 1)
      .map(p => p.id?.includes(':') ? p.id : `periode:${p.id}`);
    
    console.log('🔴 [DECOMPTE CUMUL] Calculating cumulative quantities:', {
      currentPeriode: periodeId,
      currentPeriodeNumero: periode.numero,
      relevantPeriodeIds,
      totalMetres: serverMetres.length
    });
    
    // For each bordereauLigneId, SUM all partiels from all relevant periodes
    const quantitesByLigne = new Map<string, number>();
    
    serverMetres
      .filter(m => !m.deletedAt)
      .forEach(m => {
        const mPeriodeId = m.periodeId?.includes(':') ? m.periodeId : `periode:${m.periodeId}`;
        
        // Only consider metres from periodes up to current
        if (!relevantPeriodeIds.includes(mPeriodeId)) return;
        
        const key = m.bordereauLigneId;
        
        // حساب مجموع الـ partiels من lignes
        let metreTotal = 0;
        if (m.lignes && m.lignes.length > 0) {
          metreTotal = m.lignes.reduce((sum: number, l: any) => sum + (Number(l.partiel) || 0), 0);
        } else {
          metreTotal = Number(m.totalPartiel) || 0;
        }
        
        // إضافة للمجموع التراكمي
        const currentSum = quantitesByLigne.get(key) || 0;
        quantitesByLigne.set(key, currentSum + metreTotal);
        
        console.log(`  📊 [CUMUL] ${key}: +${metreTotal.toFixed(2)} (période ${mPeriodeId}) → total = ${(currentSum + metreTotal).toFixed(2)}`);
      });
    
    // تقريب جميع القيم لرقمين
    const roundedQuantities = new Map<string, number>();
    quantitesByLigne.forEach((value, key) => {
      roundedQuantities.set(key, Number(value.toFixed(2)));
    });
    
    console.log('🔴 [DECOMPTE CUMUL] Final cumulative quantities:', Object.fromEntries(roundedQuantities));
    
    return roundedQuantities;
  }, [serverMetres, serverPeriodes, periodeId, periode]);

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
    cumulativeQuantitiesCount: cumulativeQuantities.size,
    serverMetresCount: serverMetres?.length,
    periodeId,
    serverLoading,
    serverError,
    cumulativeQuantities: Object.fromEntries(cumulativeQuantities)
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
  // 🔴 FIX: Use serverDecompts for Web mode instead of IndexedDB
  useEffect(() => {
    const calculatePreviousPayments = async () => {
      if (!periode || !projectId || !project) return;

      // 🔴 Use serverDecompts (from API) instead of db.decompts (IndexedDB)
      const allDecomptes = serverDecompts?.filter(d => !d.deletedAt) || [];

      // Filter to get only previous décomptes (numero < current)
      const decomptesPrecedentsArray = allDecomptes.filter(d => d.numero < periode.numero);

      console.log('📊 Calculating previous payments:', {
        projectId,
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
        // 🔴 FIX: Use serverPeriodes instead of db.periodes for Web mode
        const periodeDecompt = serverPeriodes?.find(p => {
          const pId = p.id?.includes(':') ? p.id : `periode:${p.id}`;
          const dPId = decompt.periodeId?.includes(':') ? decompt.periodeId : `periode:${decompt.periodeId}`;
          return pId === dPId;
        });
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
  }, [periode, projectId, project, serverDecompts, serverPeriodes]);

  // Helper to normalize bordereauLigneId (remove prefix if present)
  const normalizeBordereauLigneId = (id: string): string => {
    if (!id) return '';
    return id.replace(/^bordereau:/, '');
  };

  // Charger les lignes du décompte - TOUJOURS mettre à jour les quantités depuis les métrés
  useEffect(() => {
    // ============================================================
    // 🔴 CUMUL: استخدام الكميات التراكمية المحسوبة من كل الفترات
    // ============================================================
    if (bordereau && cumulativeQuantities.size > 0) {
      const cleanBordereauId = normalizeBordereauLigneId(bordereau.id);
      
      const decompteLines: DecompteLigne[] = bordereau.lignes.map((ligne: { numero: number; designation: string; unite: string; quantite: number; prixUnitaire?: number }) => {
        const ligneId = `${cleanBordereauId}-ligne-${ligne.numero}`;
        
        // 🔴 جلب الكمية التراكمية من Map (مجموع كل الفترات)
        const quantiteRealisee = cumulativeQuantities.get(ligneId) || 0;
        
        console.log(`📊 [DECOMPTE LIGNE] Article ${ligne.numero}: cumul = ${quantiteRealisee}`);
        
        const prixUnitaireHT = ligne.prixUnitaire || 0;
        
        return {
          prixNo: ligne.numero,
          designation: ligne.designation,
          unite: ligne.unite,
          quantiteBordereau: ligne.quantite,
          quantiteRealisee,
          prixUnitaireHT,
          montantHT: 0, // سيُحسب في calculatedLignes via financeEngine
          bordereauLigneId: ligneId,
        };
      });

      setLignes(decompteLines);
    } else if (bordereau && cumulativeQuantities.size === 0) {
      const cleanBordereauId = normalizeBordereauLigneId(bordereau.id);
      
      // إذا لم يكن هناك ميتري، عرض البوردرو فقط بكميات صفر
      const decompteLines: DecompteLigne[] = bordereau.lignes.map((ligne: { numero: number; designation: string; unite: string; quantite: number; prixUnitaire?: number }) => {
        const prixUnitaireHT = ligne.prixUnitaire || 0;
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
  }, [bordereau, cumulativeQuantities]);

  // ============================================================
  // CALCULS FINANCIERS - 🔒 VIA FINANCE ENGINE v2
  // ============================================================
  // ⚠️ EXCEL COMPLIANCE: القيم الداخلية vs المعروضة
  // ============================================================
  
  // تحويل lignes إلى الشكل المطلوب من financeEngine
  const financeLignes: FinanceLigneDecompte[] = lignes.map(l => ({
    prixNo: l.prixNo,
    designation: l.designation,
    unite: l.unite,
    quantiteBordereau: l.quantiteBordereau,
    quantiteRealisee: l.quantiteRealisee,  // ⚠️ هذه مخزنة مقربة من الميتري
    prixUnitaireHT: l.prixUnitaireHT,
  }));

  // حساب montantHT لكل سطر مع الاحتفاظ بالقيمة الداخلية
  const calculatedLignes: CalculatedLigne[] = financeLignes.map(l => ({
    ...l,
    montantHTInternal: calculateMontantHTInternal(l.quantiteRealisee, l.prixUnitaireHT),
    montantHT: calculateMontantHT(l.quantiteRealisee, l.prixUnitaireHT),
  }));

  // ============================================================
  // حساب المجاميع مع القيم الداخلية (EXCEL COMPLIANCE)
  // ============================================================
  const totalHTResult = calculateTotalHTWithInternal(calculatedLignes);
  const totalHT = totalHTResult.display;
  const totalHTInternal = totalHTResult.internal;
  
  const tvaResult = calculateTVAWithInternal(totalHTInternal, Number(tauxTVA) || 20);
  const montantTVA = tvaResult.display;
  const tvaInternal = tvaResult.internal;
  
  // 🔒 EXCEL: TTC = HT_Internal + TVA_Display (TRUNC)
  // نمرر TVA المقطوعة كـ Decimal
  const ttcResult = calculateTTCWithInternal(totalHTInternal, toDecimal(montantTVA));
  const totalTTC = ttcResult.display;
  const ttcInternal = ttcResult.internal;
  
  // Log للتحقق
  console.log("[FINANCE ENGINE v2] Calculs:", {
    totalHT_internal: totalHTInternal.toString(),
    totalHT_display: totalHT,
    tva_internal: tvaInternal.toString(),
    tva_display: montantTVA,
    ttc_internal: ttcInternal.toString(),
    ttc_display: totalTTC
  });

  // Récapitulatif - حساب بطريقة Excel
  // 🔒 EXCEL: يعرض قيم مقربة لكنه يحسب بالقيم الداخلية الكاملة
  const getRecapCalculations = (): RecapCalculations => {
    // ============================================================
    // 🔒 EXCEL COMPLIANCE: نستخدم ttcInternal (القيمة الداخلية الكاملة)
    // Excel يحسب بالقيم الداخلية ثم يعرض مقربة
    // ============================================================
    
    const anterieurs = toDecimal(depensesExercicesAnterieurs);
    const precedents = toDecimal(decomptesPrecedents);
    
    // 🔒 EXCEL: نستخدم القيمة الداخلية (الكاملة) للحسابات
    const totalAvantRetenue = ttcInternal;

    // ============================================================
    // RETENUE DE GARANTIE: MIN(TRUNC(TTC×10%;2); TRUNC(Marché×7%;2))
    // ============================================================
    
    // حساب مبلغ الصفقة الكلي TTC من البوردرو (بدقة كاملة)
    let montantMarcheTTC = new Decimal(0);
    if (bordereau?.lignes) {
      for (const ligne of bordereau.lignes) {
        const qte = toDecimal(ligne.quantite);
        const pu = toDecimal(ligne.prixUnitaire);
        const montantHT = qte.times(pu);
        const montantTTC = montantHT.times(1.2);
        montantMarcheTTC = montantMarcheTTC.plus(montantTTC);
      }
    }
    
    // 🔒 TRUNC(TTC_INTERNAL × 10%, 2) - استخدام القيمة الداخلية
    const retenue10Pourcent = trunc2(ttcInternal.times(0.10));
    
    // TRUNC(Marché × 7%, 2)
    const retenue7Pourcent = trunc2(montantMarcheTTC.times(0.07));
    
    // MIN
    const retenueGarantie = Decimal.min(retenue10Pourcent, retenue7Pourcent);
    
    console.log('[RETENUE] Calcul:', {
      ttcInternal: ttcInternal.toString(),
      montantMarcheTTC: montantMarcheTTC.toString(),
      retenue10Pourcent: retenue10Pourcent.toString(),
      retenue7Pourcent: retenue7Pourcent.toString(),
      retenueGarantie: retenueGarantie.toString()
    });

    // ============================================================
    // 🔒 EXCEL: حسابات بالقيم الداخلية (الكاملة)
    // ============================================================
    
    // Restes = TTC_INTERNAL - Retenue (بدون تقريب وسيط)
    const restes = totalAvantRetenue.minus(retenueGarantie);
    
    // Reste à payer = Restes - Exercices antérieurs
    const resteAPayer = restes.minus(anterieurs);
    
    // Total à déduire
    const totalADeduire = anterieurs.plus(precedents);
    
    // Montant de l'acompte = Reste à payer - Décomptes précédents
    // 🔒 EXCEL: يستخدم floating point وليس Decimal
    // لذلك نحول إلى Number قبل التقريب لمحاكاة Excel
    const montantAcompteExact = resteAPayer.minus(precedents);
    const montantAcompteFloat = montantAcompteExact.toNumber(); // Convert to floating point like Excel
    const montantAcompte = toDecimal(montantAcompteFloat.toFixed(2)); // Round like Excel
    
    console.log('[RECAP v2] Calcul final:', {
      ttcInternal: ttcInternal.toString(),
      retenueGarantie: retenueGarantie.toString(),
      restes: restes.toString(),
      resteAPayer: resteAPayer.toString(),
      precedents: precedents.toString(),
      montantAcompteExact: montantAcompteExact.toString(),
      montantAcompteFinal: montantAcompte.toString()
    });

    return {
      // ⚠️ للعرض فقط: نستخدم totalTTC (display) وليس ttcInternal
      travauxTermines: periode?.isDecompteDernier ? totalTTC : 0,
      travauxNonTermines: periode?.isDecompteDernier ? 0 : totalTTC,
      approvisionnements: 0,
      totalAvantRetenue: totalTTC, // ⚠️ display للعرض في Montants
      retenueGarantie: toNumber(retenueGarantie),
      resteAPayer: toNumber(round2(restes)),
      depensesExercicesAnterieurs: toNumber(round2(anterieurs)),
      totalADeduire: toNumber(round2(totalADeduire)),
      montantAcompte: toNumber(montantAcompte),
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
      const rawProjectId = cleanProjectId || projectId.replace('project:', '');
      const rawPeriodeId = periodeId.replace('periode:', '');

      if (isWeb()) {
        // ============================================================
        // 🌐 WEB MODE: استخدام API
        // ============================================================
        console.log('🌐 [WEB] Saving décompte via API...');

        // 1. تحديث الفترة
        await apiService.updatePeriode(rawPeriodeId, {
          tauxTVA,
          tauxRetenue,
          depensesExercicesAnterieurs,
          decomptesPrecedents,
        });
        console.log('✅ [WEB] Période updated');

        // 2. حفظ أو تحديث الديكونت
        const decompteData = {
          projectId: rawProjectId,
          periodeId: rawPeriodeId,
          userId: user.id.replace('user:', ''),
          numero: periode.numero,
          lignes: lignes,
          montantTotal: recap.montantAcompte,
          totalTTC: totalTTC,
          statut: 'draft',
        };

        if (existingDecompte) {
          const rawDecomptId = existingDecompte.id.replace('decompt:', '');
          await apiService.updateDecompt(rawDecomptId, decompteData);
          console.log('✅ [WEB] Décompte updated:', rawDecomptId);
        } else {
          await apiService.createDecompt(decompteData);
          console.log('✅ [WEB] Décompte created');
        }

        // إعادة تحميل البيانات
        refreshServerData();
        
      } else {
        // ============================================================
        // 🖥️ ELECTRON MODE: استخدام IndexedDB
        // ============================================================
        
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
          rawPeriodeId,
          { tauxTVA, tauxRetenue, depensesExercicesAnterieurs, decomptesPrecedents },
          user.id
        );

        // 2. Sauvegarder le décompte
        if (existingDecompte) {
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
          const decomptId = `decompt:${uuidv4()}`;

          const newDecompte = {
            id: decomptId,
            projectId: projectId,
            periodeId: periodeId,
            userId: user.id,
            numero: periode.numero,
            lignes: lignes,
            montantTotal: recap.montantAcompte,
            totalTTC: totalTTC,
            statut: 'draft' as const,
            createdAt: now,
            updatedAt: now,
          };

          await db.decompts.add(newDecompte);
          await logSyncOperation('CREATE', 'decompt', decomptId.replace('decompt:', ''), newDecompte, user.id);
        }
      }

      alert('Décompte enregistré avec succès !');
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
              {/* ⚠️ استخدام calculatedLignes من financeEngine - وليس lignes */}
              {calculatedLignes.map((ligne, index) => (
                <tr key={lignes[index]?.bordereauLigneId || index} className="hover:bg-gray-50">
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
