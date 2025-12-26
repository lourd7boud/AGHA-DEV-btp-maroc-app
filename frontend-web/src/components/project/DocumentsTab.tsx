/**
 * DocumentsTab Component (V1)
 * Upload and display documents for a project
 * Server-first architecture
 */

import { FC, useState, useRef } from 'react';
import { Paperclip, Upload, Trash2, Download, Loader2, FileText, File, FileSpreadsheet, FileImage } from 'lucide-react';
import { assetService, ProjectAsset } from '../../services/assetService';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface DocumentsTabProps {
  projectId: string;
  documents: ProjectAsset[];
  onRefresh: () => void;
}

// Get icon based on mime type
const getFileIcon = (mimeType: string) => {
  if (mimeType.includes('pdf')) return FileText;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('image')) return FileImage;
  if (mimeType.includes('word') || mimeType.includes('document')) return FileText;
  return File;
};

// Get color based on mime type
const getFileColor = (mimeType: string) => {
  if (mimeType.includes('pdf')) return 'bg-red-100 text-red-600';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'bg-green-100 text-green-600';
  if (mimeType.includes('image')) return 'bg-purple-100 text-purple-600';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'bg-blue-100 text-blue-600';
  return 'bg-gray-100 text-gray-600';
};

const DocumentsTab: FC<DocumentsTabProps> = ({ projectId, documents, onRefresh }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      await assetService.uploadDocument(projectId, file, (progress) => {
        setUploadProgress(progress);
      });
      
      onRefresh();
    } catch (error) {
      console.error('Upload error:', error);
      alert('Erreur lors du téléchargement du document');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (doc: ProjectAsset) => {
    if (!confirm('Supprimer ce document ?')) return;

    setDeleting(doc.id);
    try {
      await assetService.deleteAsset(doc.id);
      onRefresh();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Erreur lors de la suppression');
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = (doc: ProjectAsset) => {
    const url = assetService.getAssetUrl(doc.storagePath);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.originalName || doc.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleView = (doc: ProjectAsset) => {
    const url = assetService.getAssetUrl(doc.storagePath);
    window.open(url, '_blank');
  };

  // Empty state
  if (documents.length === 0 && !isUploading) {
    return (
      <div className="card">
        <div className="text-center py-12">
          <Paperclip className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun document</h3>
          <p className="text-gray-600 mb-6">
            Attachez vos factures, plans, et autres documents importants
          </p>
          <button 
            onClick={handleSelectFile}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Paperclip className="w-4 h-4" />
            Joindre un document
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          Documents ({documents.length})
        </h2>
        <button
          onClick={handleSelectFile}
          disabled={isUploading}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {uploadProgress}%
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Joindre un document
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.png,.jpg,.jpeg"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>

      {/* Upload Progress */}
      {isUploading && (
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <span className="text-blue-700 font-medium">Téléchargement en cours...</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Documents List */}
      <div className="space-y-2">
        {documents.map((doc) => {
          const FileIcon = getFileIcon(doc.mimeType);
          const colorClass = getFileColor(doc.mimeType);
          
          return (
            <div
              key={doc.id}
              className="card hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={`w-12 h-12 ${colorClass} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <FileIcon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 
                      className="font-medium text-gray-900 truncate cursor-pointer hover:text-primary-600"
                      onClick={() => handleView(doc)}
                      title={doc.originalName}
                    >
                      {doc.originalName}
                    </h3>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span>{assetService.formatFileSize(doc.fileSize)}</span>
                      <span>•</span>
                      <span>{format(new Date(doc.createdAt), 'dd/MM/yyyy', { locale: fr })}</span>
                      {doc.createdByName && (
                        <>
                          <span>•</span>
                          <span>{doc.createdByName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <button
                    onClick={() => handleDownload(doc)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Télécharger"
                  >
                    <Download className="w-5 h-5 text-gray-600" />
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={deleting === doc.id}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    title="Supprimer"
                  >
                    {deleting === doc.id ? (
                      <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5 text-red-500" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DocumentsTab;
