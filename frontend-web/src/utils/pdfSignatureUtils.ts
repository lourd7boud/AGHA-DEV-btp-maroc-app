import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { apiService } from '../services/apiService';

export interface SignatureData {
  signatureUrl: string | null;
  stampUrl: string | null;
  signerName: string;
  signerTitle: string;
  companyName: string;
}

/**
 * Load the current user's signature data from the API
 */
export async function loadSignatureData(): Promise<SignatureData | null> {
  try {
    const response = await apiService.getProfile();
    if (response.success && response.data) {
      const d = response.data;
      return {
        signatureUrl: d.signatureUrl || null,
        stampUrl: d.stampUrl || null,
        signerName: `${d.firstName || ''} ${d.lastName || ''}`.trim(),
        signerTitle: d.jobTitle || '',
        companyName: d.companyName || '',
      };
    }
  } catch (err) {
    console.warn('[SignaturePDF] Failed to load signature data:', err);
  }
  return null;
}

/**
 * Load an image from a URL and return as base64 data URL
 */
async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    // Build the full URL from the API base
    const fullUrl = apiService.getSignatureImageUrl(url);
    if (!fullUrl) return null;

    const response = await fetch(fullUrl, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
      },
    });
    
    if (!response.ok) return null;
    
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[SignaturePDF] Failed to load image:', err);
    return null;
  }
}

/**
 * Generate a QR code as base64 PNG data URL
 */
async function generateQRCode(verificationUrl: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(verificationUrl, {
      width: 80,
      margin: 1,
      color: {
        dark: '#1a365d',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.warn('[SignaturePDF] Failed to generate QR code:', err);
    return null;
  }
}

/**
 * Log a document signing event and get the verification code
 */
export async function logDocumentSigning(
  documentType: string,
  documentId?: string,
  projectId?: string,
  documentHash?: string,
): Promise<{ verificationCode: string; verificationUrl: string } | null> {
  try {
    const response = await apiService.signDocument({
      documentType,
      documentId,
      projectId,
      documentHash,
    });
    if (response.success) {
      return {
        verificationCode: response.data.verificationCode,
        verificationUrl: response.data.verificationUrl,
      };
    }
  } catch (err) {
    console.warn('[SignaturePDF] Failed to log signing:', err);
  }
  return null;
}

interface EmbedSignatureOptions {
  doc: jsPDF;
  x: number;          // X position for signature
  y: number;          // Y position for signature  
  signatureData: SignatureData;
  verificationUrl?: string;
  signatureWidth?: number;
  signatureHeight?: number;
  stampWidth?: number;
  stampHeight?: number;
  showQR?: boolean;
  qrSize?: number;
  showSignerInfo?: boolean;
}

/**
 * Embed signature + stamp + QR code into a PDF at the specified position
 * Returns the Y position after the signature block
 */
export async function embedSignatureBlock(options: EmbedSignatureOptions): Promise<number> {
  const {
    doc,
    x,
    y,
    signatureData,
    verificationUrl,
    signatureWidth = 40,
    signatureHeight = 20,
    stampWidth = 25,
    stampHeight = 25,
    showQR = true,
    qrSize = 18,
    showSignerInfo = true,
  } = options;

  let currentY = y;

  // Load signature image if available
  if (signatureData.signatureUrl) {
    const sigImage = await loadImageAsBase64(signatureData.signatureUrl);
    if (sigImage) {
      try {
        doc.addImage(sigImage, 'PNG', x, currentY, signatureWidth, signatureHeight);
      } catch (err) {
        console.warn('[SignaturePDF] Failed to embed signature image:', err);
      }
    }
  }

  // Load stamp image if available (right of signature)
  if (signatureData.stampUrl) {
    const stampImage = await loadImageAsBase64(signatureData.stampUrl);
    if (stampImage) {
      try {
        const stampX = x + signatureWidth + 2;
        doc.addImage(stampImage, 'PNG', stampX, currentY - 2, stampWidth, stampHeight);
      } catch (err) {
        console.warn('[SignaturePDF] Failed to embed stamp image:', err);
      }
    }
  }

  currentY += signatureHeight + 2;

  // Signer info
  if (showSignerInfo && signatureData.signerName) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(signatureData.signerName, x, currentY);
    currentY += 3;

    if (signatureData.signerTitle) {
      doc.text(signatureData.signerTitle, x, currentY);
      currentY += 3;
    }
    doc.setTextColor(0, 0, 0);
  }

  // QR Code for verification
  if (showQR && verificationUrl) {
    const qrImage = await generateQRCode(verificationUrl);
    if (qrImage) {
      try {
        doc.addImage(qrImage, 'PNG', x, currentY, qrSize, qrSize);
        doc.setFontSize(5);
        doc.setTextColor(120, 120, 120);
        doc.text('Vérifier:', x, currentY + qrSize + 2);
        doc.text(verificationUrl, x, currentY + qrSize + 4);
        doc.setTextColor(0, 0, 0);
        currentY += qrSize + 6;
      } catch (err) {
        console.warn('[SignaturePDF] Failed to embed QR code:', err);
      }
    }
  }

  return currentY;
}

/**
 * Add a signature verification footer to the bottom of the current page
 */
export function addVerificationFooter(doc: jsPDF, verificationCode: string): void {
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;

  doc.setFontSize(6);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Document signé électroniquement — Code de vérification: ${verificationCode} — https://marocinfra.com/verify/${verificationCode}`,
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' }
  );
  doc.setTextColor(0, 0, 0);
}

/**
 * Compute a simple hash of the PDF content for audit purposes
 */
export function computeDocumentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
}
