import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Project, Bordereau, MetreSection, MetreSubSection } from '../db/database';
import { savePDF, hasFileSystemAccess } from './desktopFileService';

// ============================================================
// 📊 METRE PDF EXPORT - تصدير تفاصيل الميتري
// ============================================================

// Interface للـ Periode مرنة تدعم كلا النوعين (database و useWebData)
interface PeriodeForExport {
  id: string;
  numero: number;
  libelle?: string;
  dateDebut: string;
  dateFin: string;
  isDecompteDernier?: boolean;
}

interface MetreLigneInput {
  id: string;
  sectionId?: string;
  subSectionId?: string;
  numero: number;
  designation: string;
  nombreSemblables?: number;
  nombreElements?: number;
  longueur?: number;
  largeur?: number;
  profondeur?: number;
  nombre?: number;
  diametre?: number;
  partiel: number;
  observations?: string;
  isFromPreviousPeriode?: boolean;
  periodeNumero?: number;
}

interface MetreQuickData {
  bordereauLigneId: string;
  numeroLigne: number;
  designation: string;
  unite: string;
  quantiteBordereau: number;
  prixUnitaire: number;
  sections: MetreSection[];
  subSections: MetreSubSection[];
  lignes: MetreLigneInput[];
  cumulPrecedent: number;
}

// تنسيق الأرقام
function formatNumber(value: number | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null || isNaN(value)) return '';
  return value.toFixed(decimals);
}

// الحصول على رؤوس الأعمدة حسب الوحدة
function getColumnHeaders(unite: string): string[] {
  if (unite === 'KG' || unite === 'T') {
    return ['N°', 'Désignation', 'Nbre', 'Long.', 'Ø', 'Partiel'];
  } else if (unite === 'M3' || unite === 'M³') {
    return ['N°', 'Désignation', 'Nbre', 'Long.', 'Larg.', 'Prof.', 'Partiel'];
  } else if (unite === 'M2' || unite === 'M²') {
    return ['N°', 'Désignation', 'Nbre', 'Long.', 'Larg.', 'Partiel'];
  } else if (unite === 'ML' || unite === 'M') {
    return ['N°', 'Désignation', 'Nbre', 'Long.', 'Partiel'];
  } else {
    return ['N°', 'Désignation', 'Nbre', 'Partiel'];
  }
}

// بناء صف البيانات حسب الوحدة
function buildDataRow(ligne: MetreLigneInput, unite: string): (string | number)[] {
  const nbreSemblables = ligne.nombreSemblables && ligne.nombreSemblables > 1 ? ligne.nombreSemblables : '';
  
  if (unite === 'KG' || unite === 'T') {
    return [
      ligne.numero,
      ligne.designation || '',
      ligne.nombre || '',
      formatNumber(ligne.longueur),
      ligne.diametre || '',
      formatNumber(ligne.partiel)
    ];
  } else if (unite === 'M3' || unite === 'M³') {
    return [
      ligne.numero,
      ligne.designation || '',
      nbreSemblables,
      formatNumber(ligne.longueur),
      formatNumber(ligne.largeur),
      formatNumber(ligne.profondeur),
      formatNumber(ligne.partiel)
    ];
  } else if (unite === 'M2' || unite === 'M²') {
    return [
      ligne.numero,
      ligne.designation || '',
      nbreSemblables,
      formatNumber(ligne.longueur),
      formatNumber(ligne.largeur),
      formatNumber(ligne.partiel)
    ];
  } else if (unite === 'ML' || unite === 'M') {
    return [
      ligne.numero,
      ligne.designation || '',
      nbreSemblables,
      formatNumber(ligne.longueur),
      formatNumber(ligne.partiel)
    ];
  } else {
    return [
      ligne.numero,
      ligne.designation || '',
      ligne.nombre || nbreSemblables || '',
      formatNumber(ligne.partiel)
    ];
  }
}

// الحصول على عرض الأعمدة حسب الوحدة
function getColumnStyles(unite: string): { [key: number]: { cellWidth: number | 'auto'; halign: 'left' | 'center' | 'right' } } {
  if (unite === 'KG' || unite === 'T') {
    return {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 22, halign: 'right' },
    };
  } else if (unite === 'M3' || unite === 'M³') {
    return {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 16, halign: 'right' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 16, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
    };
  } else if (unite === 'M2' || unite === 'M²') {
    return {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
    };
  } else if (unite === 'ML' || unite === 'M') {
    return {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
    };
  } else {
    return {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 25, halign: 'right' },
    };
  }
}

/**
 * توليد PDF لتفاصيل الميتري
 */
export async function generateMetrePDF(
  project: Project,
  periode: PeriodeForExport,
  _bordereau: Bordereau, // Prefixed with _ to indicate intentionally unused
  metresData: MetreQuickData[],
  metreDate: string
): Promise<void> {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 10;
  let yPos = 15;

  // فلترة الأرتيكلات التي لها بيانات فقط
  const articlesWithData = metresData.filter(m => m.lignes.length > 0);

  // ============================================================
  // الصفحة الأولى: الغلاف + الملخص
  // ============================================================

  // === Header ===
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ROYAUME DU MAROC', 55, yPos, { align: 'center' });
  yPos += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('MINISTERE DE L\'AGRICULTURE ET DE LA PECHE MARITIME', 55, yPos, { align: 'center' });
  yPos += 4;
  doc.text('DU DEVELOPPEMENT RURAL ET DES EAUX ET FORETS', 55, yPos, { align: 'center' });
  yPos += 4;
  doc.text('DIRECTION PROVINCIALE DE L\'AGRICULTURE', 55, yPos, { align: 'center' });

  // معلومات المشروع في الزاوية اليمنى
  const infoBoxX = pageWidth - 60;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('EXER: ' + project.annee, infoBoxX + 2, 15);
  doc.text('Marché N°: ' + project.marcheNo, infoBoxX + 2, 20);

  yPos = 40;

  // عنوان المشروع
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(project.objet, pageWidth - 40);
  titleLines.forEach((line: string) => {
    doc.text(line, pageWidth / 2, yPos, { align: 'center' });
    yPos += 5;
  });

  yPos += 8;

  // === عنوان الميتري ===
  doc.setFillColor(41, 128, 185); // أزرق
  doc.rect(margin, yPos, pageWidth - margin * 2, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const decompteSuffix = periode.isDecompteDernier ? ' et Dernier' : '';
  doc.text(`MÉTRÉ N° ${periode.numero}${decompteSuffix}`, pageWidth / 2, yPos + 8, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  yPos += 18;

  // معلومات الفترة
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Période: ${periode.libelle}`, margin, yPos);
  doc.text(`Date: ${new Date(metreDate).toLocaleDateString('fr-FR')}`, pageWidth - margin - 50, yPos);

  yPos += 10;

  // === جدول ملخص الأرتيكلات ===
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('RÉCAPITULATIF DES ARTICLES', margin, yPos);
  yPos += 6;

  const summaryData = metresData.map(m => {
    const totalPartiel = m.lignes
      .filter(l => !l.isFromPreviousPeriode)
      .reduce((sum, l) => sum + (l.partiel || 0), 0);
    const totalCumule = m.cumulPrecedent + totalPartiel;
    const pourcentage = m.quantiteBordereau > 0 ? (totalCumule / m.quantiteBordereau * 100) : 0;
    
    return [
      m.numeroLigne,
      m.designation.substring(0, 50) + (m.designation.length > 50 ? '...' : ''),
      m.unite,
      formatNumber(m.quantiteBordereau),
      formatNumber(m.cumulPrecedent),
      formatNumber(totalPartiel),
      formatNumber(totalCumule),
      formatNumber(pourcentage, 1) + '%'
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['N°', 'Désignation', 'U', 'Bordereau', 'Cumul Préc.', 'Période', 'Total', '%']],
    body: summaryData,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 20, halign: 'right' },
      7: { cellWidth: 15, halign: 'right' },
    },
  });

  // تحديث yPos بعد جدول الملخص
  yPos = (doc as any).lastAutoTable.finalY + 10;

  // ============================================================
  // تفاصيل الأرتيكلات: تستمر بعد بعضها (بدون صفحة جديدة لكل أرتيكل)
  // ============================================================

  for (const article of articlesWithData) {
    // التحقق من المساحة المتبقية - إذا كانت أقل من 60mm نبدأ صفحة جديدة
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 15;
      // رأس الصفحة
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Marché N° ${project.marcheNo}`, margin, yPos);
      doc.text(`Métré N° ${periode.numero}`, pageWidth - margin - 30, yPos);
      yPos += 8;
    }

    // === عنوان الأرتيكل ===
    doc.setFillColor(46, 204, 113); // أخضر
    doc.rect(margin, yPos, pageWidth - margin * 2, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Article ${article.numeroLigne}: ${article.designation.substring(0, 60)}`, margin + 3, yPos + 7);
    doc.setTextColor(0, 0, 0);

    yPos += 14;

    // معلومات الأرتيكل
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Unité: ${article.unite}`, margin, yPos);
    doc.text(`Quantité Bordereau: ${formatNumber(article.quantiteBordereau)}`, margin + 50, yPos);
    doc.text(`Prix Unitaire: ${formatNumber(article.prixUnitaire)} DH`, margin + 120, yPos);

    yPos += 8;

    // === بناء جدول واحد متكامل لكل Article ===
    const sectionsForArticle = article.sections || [];
    const subSectionsForArticle = article.subSections || [];
    const lignesForArticle = article.lignes || [];

    // بناء بيانات الجدول الموحد
    const tableBody: any[] = [];
    let grandTotal = 0;

    // 1. أولاً: القياسات العامة (بدون section)
    const lignesSansSection = lignesForArticle.filter(l => !l.sectionId);
    if (lignesSansSection.length > 0) {
      // صف عنوان "Mesures Générales"
      const headers = getColumnHeaders(article.unite);
      tableBody.push([{
        content: '-- Mesures Générales',
        colSpan: headers.length,
        styles: { 
          fillColor: [149, 165, 166], 
          textColor: 255, 
          fontStyle: 'bold',
          halign: 'left',
          fontSize: 8
        }
      }]);
      
      // إضافة القياسات
      lignesSansSection.forEach(l => {
        tableBody.push(buildDataRow(l, article.unite));
        grandTotal += l.partiel || 0;
      });
      
      // صف المجموع الجزئي
      const totalGeneral = lignesSansSection.reduce((sum, l) => sum + (l.partiel || 0), 0);
      tableBody.push([{
        content: 'Total Mesures Générales',
        colSpan: headers.length - 1,
        styles: { halign: 'right', fontStyle: 'italic', fillColor: [236, 240, 241] }
      }, {
        content: formatNumber(totalGeneral),
        styles: { halign: 'right', fontStyle: 'bold', fillColor: [236, 240, 241] }
      }]);
    }

    // 2. ثانياً: الأقسام (Sections)
    const sectionColors = [
      [52, 152, 219],  // أزرق
      [155, 89, 182],  // بنفسجي
      [230, 126, 34],  // برتقالي
      [26, 188, 156],  // تركواز
    ];

    for (let sectionIndex = 0; sectionIndex < sectionsForArticle.length; sectionIndex++) {
      const section = sectionsForArticle[sectionIndex];
      const sectionColor = sectionColors[sectionIndex % sectionColors.length];
      const headers = getColumnHeaders(article.unite);
      
      // صف عنوان القسم
      const periodeLabel = section.isFromPreviousPeriode ? ` (P${(section as any).periodeNumero || '?'})` : '';
      tableBody.push([{
        content: `>> ${section.titre || 'Section ' + (sectionIndex + 1)}${periodeLabel}`,
        colSpan: headers.length,
        styles: { 
          fillColor: sectionColor, 
          textColor: 255, 
          fontStyle: 'bold',
          halign: 'left',
          fontSize: 9
        }
      }]);

      // الأقسام الفرعية لهذا القسم
      const subSectionsForSection = subSectionsForArticle.filter(ss => ss.sectionId === section.id);
      let sectionTotal = 0;

      // ========================================
      // أولاً: القياسات المباشرة تحت القسم (Mesures Directes)
      // ========================================
      const lignesDirectes = lignesForArticle.filter(l => l.sectionId === section.id && !l.subSectionId);
      
      if (lignesDirectes.length > 0) {
        // إضافة القياسات المباشرة
        lignesDirectes.forEach(l => {
          tableBody.push(buildDataRow(l, article.unite));
          sectionTotal += l.partiel || 0;
          grandTotal += l.partiel || 0;
        });
        
        // صف المجموع الجزئي للقياسات المباشرة (إذا كانت هناك sous-sections أيضاً)
        if (subSectionsForSection.length > 0) {
          const totalDirectes = lignesDirectes.reduce((sum, l) => sum + (l.partiel || 0), 0);
          tableBody.push([{
            content: 'Sous-total Mesures Directes',
            colSpan: headers.length - 1,
            styles: { halign: 'right', fontStyle: 'italic', fontSize: 7, fillColor: [250, 250, 250] }
          }, {
            content: formatNumber(totalDirectes),
            styles: { halign: 'right', fontStyle: 'bold', fontSize: 7, fillColor: [250, 250, 250] }
          }]);
        }
      }

      // ========================================
      // ثانياً: الأقسام الفرعية (Sous-sections)
      // ========================================
      if (subSectionsForSection.length > 0) {
        for (const subSection of subSectionsForSection) {
          // صف عنوان القسم الفرعي
          const ssLabel = subSection.isFromPreviousPeriode ? ` (P${(subSection as any).periodeNumero || '?'})` : '';
          const nombreElementsLabel = (subSection as any).nombreElements && (subSection as any).nombreElements > 1 
            ? ` [×${(subSection as any).nombreElements}]` 
            : '';
          
          tableBody.push([{
            content: `    > ${subSection.titre || 'Élément'}${nombreElementsLabel}${ssLabel}`,
            colSpan: headers.length,
            styles: { 
              fillColor: [236, 240, 241], 
              textColor: [44, 62, 80], 
              fontStyle: 'bold',
              halign: 'left',
              fontSize: 8
            }
          }]);

          // قياسات هذا القسم الفرعي
          const lignesForSubSection = lignesForArticle.filter(l => l.subSectionId === subSection.id);
          let subSectionTotal = 0;
          
          lignesForSubSection.forEach(l => {
            tableBody.push(buildDataRow(l, article.unite));
            subSectionTotal += l.partiel || 0;
            sectionTotal += l.partiel || 0;
            grandTotal += l.partiel || 0;
          });

          // صف المجموع الجزئي للقسم الفرعي
          if (lignesForSubSection.length > 0) {
            tableBody.push([{
              content: `Sous-total ${subSection.titre || ''}`,
              colSpan: headers.length - 1,
              styles: { halign: 'right', fontStyle: 'italic', fontSize: 7, fillColor: [250, 250, 250] }
            }, {
              content: formatNumber(subSectionTotal),
              styles: { halign: 'right', fontStyle: 'bold', fontSize: 7, fillColor: [250, 250, 250] }
            }]);
          }
        }
      }

      // صف مجموع القسم الكلي
      if (sectionTotal > 0) {
        tableBody.push([{
          content: `Total ${section.titre || 'Section'}`,
          colSpan: headers.length - 1,
          styles: { halign: 'right', fontStyle: 'bold', fillColor: [220, 220, 220] }
        }, {
          content: formatNumber(sectionTotal),
          styles: { halign: 'right', fontStyle: 'bold', fillColor: [220, 220, 220] }
        }]);
      }
    }

    // رسم الجدول الموحد
    if (tableBody.length > 0) {
      const headers = getColumnHeaders(article.unite);
      
      autoTable(doc, {
        startY: yPos,
        head: [headers],
        body: tableBody,
        foot: [[{
          content: 'TOTAL ARTICLE',
          colSpan: headers.length - 1,
          styles: { halign: 'right', fontStyle: 'bold', fillColor: [44, 62, 80], textColor: 255, fontSize: 9 }
        }, {
          content: formatNumber(grandTotal),
          styles: { halign: 'right', fontStyle: 'bold', fillColor: [44, 62, 80], textColor: 255, fontSize: 9 }
        }]],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: getColumnStyles(article.unite),
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // ============================================================
  // التوقيعات - تتبع آخر أرتيكل (ليست في صفحة مستقلة)
  // ============================================================
  
  // التحقق من المساحة المتبقية للتوقيعات (نحتاج حوالي 60mm)
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = 20;
  }
  
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Dressé le: ${new Date(metreDate).toLocaleDateString('fr-FR')}`, margin, yPos);
  
  yPos += 20;
  
  // التوقيعات
  doc.text('L\'ASSISTANCE TECHNIQUE :', margin + 10, yPos);
  doc.text('Le Maître d\'Oeuvre:', pageWidth / 2, yPos);
  
  yPos += 30;
  
  doc.text('Visa:', margin + 10, yPos);
  doc.text('Visa:', pageWidth / 2, yPos);

  // === حفظ الملف ===
  const fileName = `Metre_${project.marcheNo}_N${periode.numero}_${new Date().toISOString().split('T')[0]}.pdf`;
  
  // Use native save dialog in Electron, browser download in Web
  if (hasFileSystemAccess()) {
    const pdfData = doc.output('arraybuffer');
    const result = await savePDF(new Uint8Array(pdfData), fileName);
    
    if (!result.success && !result.canceled) {
      console.error('[MetrePDF] Save failed:', result.error);
      // Fallback to browser download
      doc.save(fileName);
    } else if (result.success) {
      console.log('[MetrePDF] Saved to:', result.filePath);
    }
  } else {
    // Web: Use browser download
    doc.save(fileName);
  }
}
