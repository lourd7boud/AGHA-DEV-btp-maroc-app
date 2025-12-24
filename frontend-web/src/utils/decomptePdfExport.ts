import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Project, Bordereau, Periode } from '../db/database';

interface DecompteLigne {
  prixNo: number;
  designation: string;
  unite: string;
  quantiteBordereau: number;
  quantiteRealisee: number;
  prixUnitaireHT: number;
  montantHT: number;
}

interface DecomptePrecedent {
  numero: number;
  date: string;
  montant: number;
  isDecompteDernier?: boolean;
}

interface RecapData {
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

// Conversion des nombres en lettres (français)
function numberToWords(num: number): string {
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
      const baseTen = tens[ten];
      const remainder = 10 + unit;
      if (remainder < 20) return baseTen + '-' + teens[remainder - 10];
      return baseTen + '-' + units[unit];
    }

    if (ten === 8) {
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
}

// Helper function for consistent 2-decimal rounding (standard accounting rounding)
function formatMontant(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString('fr-MA', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
}

export async function generateDecomptePDF(
  project: Project,
  periode: Periode,
  _bordereau: Bordereau, // Prefixed with _ to indicate intentionally unused
  lignes: DecompteLigne[],
  recap: RecapData,
  tauxTVA: number,
  totalHT: number,
  montantTVA: number,
  totalTTC: number,
  decomptsPrecedents: DecomptePrecedent[] = [],
  printDirectly: boolean = false // خيار الطباعة المباشرة
): Promise<void> {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  let yPos = 15;

  // === PAGE 1: Header + Informations + Table ===
  
  // Header - ROYAUME DU MAROC
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
  yPos += 4;
  doc.text('TATA', 55, yPos, { align: 'center' });
  yPos += 10;

  // Box informations - EXER, Chapitre, Programme, Projet, Ligne
  const infoBoxX = pageWidth - 60;
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('EXER: ' + project.annee, infoBoxX + 2, 20);
  doc.text('Chapitre: ' + (project.chapitre || ''), infoBoxX + 2, 25);
  doc.text('Programme: ' + (project.programme || ''), infoBoxX + 2, 30);
  doc.text('Projet: ' + (project.projet || ''), infoBoxX + 2, 35);
  doc.text('Ligne: ' + (project.ligne || ''), infoBoxX + 2, 40);

  // Marché N° et Titre du projet
  yPos = 55;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  
  // عرض عنوان المشروع حسب النوع
  if (project.typeMarche === 'negocie') {
    const marcheText = 'MARCHE NEGOCIE N°' + project.marcheNo;
    doc.text(marcheText, pageWidth / 2, yPos, { align: 'center' });
    // رسم خط تحت النص
    const textWidth = doc.getTextWidth(marcheText);
    const textX = (pageWidth - textWidth) / 2;
    doc.setLineWidth(0.3);
    doc.line(textX, yPos + 1, textX + textWidth, yPos + 1);
  } else {
    doc.text('MARCHE N°' + project.marcheNo, pageWidth / 2, yPos, { align: 'center' });
  }
  yPos += 6;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const titleLines = doc.splitTextToSize(project.objet, pageWidth - 20);
  titleLines.forEach((line: string) => {
    doc.text(line, pageWidth / 2, yPos, { align: 'center' });
    yPos += 5;
  });

  yPos += 5;

  // Informations société (afficher seulement les champs remplis)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  // Position de départ pour les infos société
  const societeStartY = yPos;
  
  // Afficher seulement les champs qui ont des valeurs
  if (project.societe) {
    doc.text('Société: ' + project.societe, 10, yPos);
    yPos += 5;
  }
  if (project.rc) {
    doc.text('R. C. n°: ' + project.rc, 10, yPos);
    yPos += 5;
  }
  if (project.cb) {
    doc.text('C.B n°: ' + project.cb, 10, yPos);
    yPos += 5;
  }
  if (project.cnss) {
    doc.text('C.N.S.S. n°: ' + project.cnss, 10, yPos);
    yPos += 5;
  }
  if (project.patente) {
    doc.text('Patente: ' + project.patente, 10, yPos);
    yPos += 5;
  }
  
  // Montant de l'acompte (dans un cadre) - positionné à droite au niveau du début des infos société
  const montantBoxX = pageWidth - 70;
  const montantBoxWidth = 60;
  const montantBoxHeight = 12;
  doc.rect(montantBoxX, societeStartY - 4, montantBoxWidth, montantBoxHeight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Montant de l\'acompte en Dhs:', montantBoxX + montantBoxWidth / 2, societeStartY, { align: 'center' });
  
  doc.setFontSize(10);
  doc.text(formatMontant(recap.montantAcompte), montantBoxX + montantBoxWidth / 2, societeStartY + 5, { align: 'center' });
  
  // Ajouter un espacement si aucune info société n'a été affichée
  if (yPos === societeStartY) {
    yPos += 10;
  } else {
    yPos += 5;
  }

  // DECOMPTE PROVISOIRE N°
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const decompteSuffix = periode.isDecompteDernier ? ' et dernier' : '';
  doc.text('DECOMPTE PROVISOIRE N°' + periode.numero + decompteSuffix, pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const periodeText = `Des travaux exécutés au: ${new Date(periode.dateFin).toLocaleDateString('fr-FR')}`;
  doc.text(periodeText, pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  // Table des prestations
  const tableData = lignes.map(ligne => [
    ligne.prixNo,
    ligne.designation,
    ligne.unite,
    ligne.quantiteRealisee.toFixed(2),
    ligne.prixUnitaireHT.toFixed(2),
    (ligne.quantiteRealisee * ligne.prixUnitaireHT).toFixed(2),
  ]);

  let footerStartX = 0;
  let footerEndX = 0;
  let footerEndY = 0;
  let bodyEndY = 0;
  let tableLeftX = 0;
  
  autoTable(doc, {
    startY: yPos,
    head: [['Prix N°', 'DESIGNATIONS DES PRESTATIONS', 'U', 'Quantité', 'Prix U En DH\nhors TVA', 'Prix Total En DH\nhors TVA']],
    body: tableData,
    foot: [
      [
       { content: '', colSpan: 3, styles: { halign: 'left' } },
       { content: 'Total Général Hors TVA', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, 
       { content: formatMontant(totalHT), styles: { halign: 'right', fontStyle: 'bold' } }],
      [
       { content: '', colSpan: 3, styles: { halign: 'left' } },
       { content: `Total TVA (${tauxTVA}%)`, colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
       { content: formatMontant(montantTVA), styles: { halign: 'right', fontStyle: 'bold' } }],
      [
       { content: '', colSpan: 3, styles: { halign: 'left' } },
       { content: 'Total Général (T.T.C)', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
       { content: formatMontant(totalTTC), styles: { halign: 'right', fontStyle: 'bold' } }],
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold' },
    tableLineWidth: 0.1,
    tableLineColor: [200, 200, 200],
    willDrawCell: (data: any) => {
      // إخفاء الخطوط للخلايا الفارغة في footer (الأعمدة 0، 1، 2)
      if (data.section === 'foot' && data.column.index < 3) {
        data.cell.styles.lineWidth = 0;
        data.cell.styles.lineColor = [255, 255, 255];
      }
    },
    didDrawCell: (data: any) => {
      // حفظ موقع نهاية body
      if (data.section === 'body' && data.row.index === data.table.body.length - 1 && data.column.index === 0) {
        bodyEndY = data.cell.y + data.cell.height;
      }
      if (data.section === 'body' && data.row.index === data.table.body.length - 1 && data.column.index === 3) {
        footerStartX = data.cell.x;
      }
      if (data.section === 'body' && data.row.index === data.table.body.length - 1 && data.column.index === 5) {
        footerEndX = data.cell.x + data.cell.width;
      }
      
      // حفظ موقع بداية الجدول (الحافة اليسرى)
      if (data.section === 'body' && data.row.index === 0 && data.column.index === 0) {
        tableLeftX = data.cell.x;
      }
      
      // حفظ موقع نهاية footer
      if (data.section === 'foot' && data.row.index === 2 && data.column.index === 3) {
        footerEndY = data.cell.y + data.cell.height;
      }
      
      // رسم إطار بنفس ستيل الجدول حول الخلايا الثلاثة الأخيرة في footer
      if (data.section === 'foot' && data.column.index >= 3) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height);
      }
    },
    didDrawPage: () => {
      // Page drawn callback
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 30, halign: 'right' },
    },
  });

  // رسم الخطين العموديين بعد الانتهاء من رسم الجدول (بنفس ستيل الجدول)
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.1);
  // الخط الأيسر العمودي
  doc.line(footerStartX, bodyEndY, footerStartX, footerEndY);
  // الخط الأيمن العمودي
  doc.line(footerEndX, bodyEndY, footerEndX, footerEndY);
  // الخط الأفقي العلوي من بداية الجدول إلى الخط الأيسر (إغلاق عمود 8 من الأعلى)
  doc.line(tableLeftX, bodyEndY, footerStartX, bodyEndY);
  
  // إخفاء الخط الأيسر للجدول في منطقة footer (العمودي والأفقي السفلي)
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(1);
  // إخفاء الخط العمودي الأيسر
  doc.line(tableLeftX, bodyEndY + 0.5, tableLeftX, footerEndY + 0.5);
  // إخفاء الخط الأفقي السفلي
  doc.line(tableLeftX, footerEndY, footerStartX, footerEndY);

  // === PAGE 2: Ordre de service + Récapitulation ===
  doc.addPage();
  yPos = 20;

  // Ordre de service et délais
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  // تنسيق تاريخ OSC
  const oscDate = project.osc ? new Date(project.osc).toLocaleDateString('fr-FR') : '../../....';
  doc.text('Ordre de service de commencer les travaux du: ' + oscDate, 10, yPos);
  yPos += 10;

  doc.text('Délais d\'exécution: ' + (project.delaisExecution || '10') + ' mois', 10, yPos);
  yPos += 5;
  
  // Tableau des décomptes précédents + décompte actuel (dans l'ordre)
  console.log('📄 PDF - Décomptes précédents reçus:', decomptsPrecedents);
  
  // Afficher d'abord les décomptes précédents (ordre croissant: 1, 2, 3...)
  if (decomptsPrecedents && decomptsPrecedents.length > 0) {
    console.log('📄 PDF - Affichage de', decomptsPrecedents.length, 'décomptes précédents');
    decomptsPrecedents.forEach((dp) => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const dpSuffix = dp.isDecompteDernier ? ' et dernier' : '';
      const dpText = `D.P.n° ${dp.numero}${dpSuffix} du ${dp.date} montant: ${formatMontant(dp.montant)} DH`;
      console.log('📄 PDF - Ligne:', dpText);
      doc.text(dpText, 10, yPos);
      yPos += 5;
    });
  } else {
    console.log('📄 PDF - Aucun décompte précédent à afficher');
  }
  
  // Afficher le décompte actuel en dernier
  const dpSuffixActuel = periode.isDecompteDernier ? ' et dernier' : '';
  const dpLine = `D.P.n° ${periode.numero}${dpSuffixActuel} du ${new Date(periode.dateFin).toLocaleDateString('fr-FR')} montant: ${formatMontant(recap.montantAcompte)} DH`;
  doc.text(dpLine, 10, yPos);
  yPos += 9;

  // RECAPITULATION
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('RECAPITULATION', pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  // Table Récapitulation - selon isDecompteDernier
  const recapData = periode.isDecompteDernier ? [
    // Décompte dernier: tout dans Travaux terminés
    ['Travaux terminés', recap.travauxTermines.toFixed(2), recap.retenueGarantie.toFixed(2), (recap.travauxTermines - recap.retenueGarantie).toFixed(2)],
    ['Travaux non terminés', '0.00', '0.00', '0.00'],
    ['Approvisionnements', recap.approvisionnements.toFixed(2), '0.00', recap.approvisionnements.toFixed(2)],
  ] : [
    // Décompte normal: tout dans Travaux non terminés
    ['Travaux terminés', recap.travauxTermines.toFixed(2), '0.00', '0.00'],
    ['Travaux non terminés', recap.travauxNonTermines.toFixed(2), recap.retenueGarantie.toFixed(2), (recap.travauxNonTermines - recap.retenueGarantie).toFixed(2)],
    ['Approvisionnements', recap.approvisionnements.toFixed(2), '0.00', recap.approvisionnements.toFixed(2)],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [['NATURE DES DEPENSES', 'MONTANTS', 'RETENUE DE', 'RESTES']],
    body: recapData,
    foot: [
      [{ content: 'TOTAUX', styles: { fontStyle: 'bold' } },
       { content: recap.totalAvantRetenue.toFixed(2), styles: { halign: 'right', fontStyle: 'bold' } },
       { content: recap.retenueGarantie.toFixed(2), styles: { halign: 'right', fontStyle: 'bold' } },
       { content: recap.resteAPayer.toFixed(2), styles: { halign: 'right', fontStyle: 'bold' } }],
      [{ content: 'À déduire les dépenses imputées sur exercices antérieurs', colSpan: 3, styles: { fillColor: [255, 255, 255], textColor: 0 } },
       { content: recap.depensesExercicesAnterieurs.toFixed(2), styles: { fillColor: [255, 255, 255], textColor: 0, halign: 'right' } }],
      [{ content: 'Reste à payer sur l\'exercice en cours', colSpan: 3, styles: { fillColor: [255, 255, 255], textColor: 0 } },
       { content: recap.resteAPayer.toFixed(2), styles: { fillColor: [255, 255, 255], textColor: 0, halign: 'right' } }],
      [{ content: 'À déduire le montant des acomptes délivrés sur l\'exercice en cours', colSpan: 3, styles: { fillColor: [255, 255, 255], textColor: 0 } },
       { content: (recap.totalADeduire - recap.depensesExercicesAnterieurs).toFixed(2), styles: { fillColor: [255, 255, 255], textColor: 0, halign: 'right' } }],
      [{ content: 'Montant de l\'acompte à délivrer:', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: 0 } },
       { content: recap.montantAcompte.toFixed(2), styles: { fontStyle: 'bold', fontSize: 10, fillColor: [255, 255, 255], textColor: 0, halign: 'right' } }],
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
    footStyles: { fillColor: [255, 255, 255], textColor: 0 },
    didDrawCell: (data: any) => {
      // رسم إطار بنفس لون وسمك الجدول حول خلايا footer
      if (data.section === 'foot') {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height);
      }
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 35, halign: 'right' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Note explicative
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  const note = 'Dressé par 1. Le responsable du Service d\'Aménagement Hydro-Agricole ou son représentant  et 2. Le Chef de Mission AT Gzouli Ingénieur Conseil; responsable de suivi des travaux, qui certifie que les quantités portées au présent décompte correspondent aux travaux réellement exécutés conformément aux plans et aux stipulations du marché.';
  const noteLines = doc.splitTextToSize(note, pageWidth - 20);
  noteLines.forEach((line: string) => {
    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = 20;
    }
    doc.text(line, 10, yPos);
    yPos += 4;
  });

  yPos += 10;

  // Signatures
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('1-', 10, yPos);
  doc.text('2-', pageWidth / 2, yPos);
  yPos += 20;
  
  doc.text('Vu et vérifié', 10, yPos);
  yPos += 25;

  // Box blanc - Arrêté par nous
  doc.setFillColor(255, 255, 255); // Blanc
  doc.rect(10, yPos, pageWidth - 20, 15, 'F');
  doc.setDrawColor(0);
  doc.setLineWidth(0.2); // سمك الإطار أرق
  doc.rect(10, yPos, pageWidth - 20, 15, 'S');
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0); // Noir
  const arreteText = `Arrêté par nous, Sous-Ordonnateur, à la somme de: ${numberToWords(recap.montantAcompte)}`;
  const arreteLines = doc.splitTextToSize(arreteText, pageWidth - 25);
  let arreteY = yPos + 5;
  arreteLines.forEach((line: string) => {
    doc.text(line, 12, arreteY);
    arreteY += 4;
  });

  yPos += 20;
  doc.text('A Tata, Le:', 10, yPos);
  yPos += 10;
  doc.text('Tata, le:', pageWidth / 2, yPos);

  // Save or Print PDF
  const fileName = `Decompte_${project.marcheNo}_Periode_${periode.numero}_${new Date().toISOString().split('T')[0]}.pdf`;
  
  if (printDirectly) {
    // طباعة مباشرة باستخدام iframe مخفي
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    // إنشاء iframe مخفي
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.src = pdfUrl;
    
    document.body.appendChild(iframe);
    
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print();
        // حذف iframe بعد الطباعة
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(pdfUrl);
        }, 1000);
      }, 500);
    };
  } else {
    // حفظ PDF كملف
    doc.save(fileName);
  }
}
