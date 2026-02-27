import { FC, useRef, useState, useEffect, useCallback } from 'react';
import SignaturePad from 'signature_pad';
import {
  User,
  PenTool,
  Stamp,
  Save,
  Trash2,
  Upload,
  Check,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { apiService } from '../services/apiService';
import { useAuthStore } from '../store/authStore';

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  phone: string;
  department: string;
  companyName: string;
  signatureUrl: string | null;
  stampUrl: string | null;
}

const ProfileSignatureTab: FC = () => {
  const { user } = useAuthStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileData>({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    jobTitle: '',
    phone: '',
    department: '',
    companyName: '',
    signatureUrl: null,
    stampUrl: null,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [stampSaving, setStampSaving] = useState(false);
  const [stampPreview, setStampPreview] = useState<string | null>(null);
  const [showSignaturePreview, setShowSignaturePreview] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'info' | 'signature' | 'stamp'>('info');

  // Load profile data
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const response = await apiService.getProfile();
      if (response.success) {
        const d = response.data;
        setProfile({
          firstName: d.firstName || '',
          lastName: d.lastName || '',
          email: d.email || '',
          jobTitle: d.jobTitle || '',
          phone: d.phone || '',
          department: d.department || '',
          companyName: d.companyName || '',
          signatureUrl: d.signatureUrl || null,
          stampUrl: d.stampUrl || null,
        });
        if (d.stampUrl) {
          setStampPreview(apiService.getSignatureImageUrl(d.stampUrl));
        }
      }
    } catch (err: any) {
      setError('Erreur lors du chargement du profil');
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initialize SignaturePad
  const initSignaturePad = useCallback(() => {
    if (canvasRef.current && !signaturePadRef.current) {
      const canvas = canvasRef.current;
      // Set canvas size for retina
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);

      signaturePadRef.current = new SignaturePad(canvas, {
        backgroundColor: 'rgba(255, 255, 255, 0)',
        penColor: '#1a365d',
        minWidth: 0.5,
        maxWidth: 2.5,
      });
    }
  }, []);

  useEffect(() => {
    if (activeSubTab === 'signature') {
      // Small delay to ensure canvas is rendered
      setTimeout(initSignaturePad, 100);
    }
    return () => {
      if (signaturePadRef.current) {
        signaturePadRef.current.off();
        signaturePadRef.current = null;
      }
    };
  }, [activeSubTab, initSignaturePad]);

  // Save profile info
  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      setError(null);
      await apiService.updateProfile({
        firstName: profile.firstName,
        lastName: profile.lastName,
        jobTitle: profile.jobTitle,
        phone: profile.phone,
        department: profile.department,
        companyName: profile.companyName,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError('Erreur lors de la sauvegarde du profil');
    } finally {
      setSaving(false);
    }
  };

  // Save signature from canvas
  const handleSaveSignature = async () => {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      setError('Veuillez dessiner votre signature');
      return;
    }

    try {
      setSignatureSaving(true);
      setError(null);
      const imageData = signaturePadRef.current.toDataURL('image/png');
      const response = await apiService.uploadSignature(imageData);
      if (response.success) {
        setProfile(prev => ({ ...prev, signatureUrl: response.data.signatureUrl }));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err: any) {
      setError('Erreur lors de la sauvegarde de la signature');
    } finally {
      setSignatureSaving(false);
    }
  };

  // Clear signature canvas
  const handleClearCanvas = () => {
    signaturePadRef.current?.clear();
  };

  // Delete saved signature
  const handleDeleteSignature = async () => {
    if (!window.confirm('Supprimer la signature ?')) return;
    try {
      await apiService.deleteSignature();
      setProfile(prev => ({ ...prev, signatureUrl: null }));
      signaturePadRef.current?.clear();
    } catch (err: any) {
      setError('Erreur lors de la suppression');
    }
  };

  // Upload stamp
  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setStampPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    try {
      setStampSaving(true);
      setError(null);
      const response = await apiService.uploadStampFile(file);
      if (response.success) {
        setProfile(prev => ({ ...prev, stampUrl: response.data.stampUrl }));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err: any) {
      setError('Erreur lors de l\'upload du cachet');
      setStampPreview(null);
    } finally {
      setStampSaving(false);
    }
  };

  // Delete stamp
  const handleDeleteStamp = async () => {
    if (!window.confirm('Supprimer le cachet ?')) return;
    try {
      await apiService.deleteStamp();
      setProfile(prev => ({ ...prev, stampUrl: null }));
      setStampPreview(null);
    } catch (err: any) {
      setError('Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <div className="card flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
        <User className="w-6 h-6 text-primary-600" />
        Profil & Signature Électronique
      </h2>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* Success display */}
      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <Check className="w-4 h-4" />
          Enregistré avec succès !
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {[
          { key: 'info', label: 'Informations', icon: User },
          { key: 'signature', label: 'Signature', icon: PenTool },
          { key: 'stamp', label: 'Cachet / Tampon', icon: Stamp },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveSubTab(key as 'info' | 'signature' | 'stamp')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 -mb-px transition-colors ${
              activeSubTab === key
                ? 'border-primary-500 text-primary-700 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Info Sub-Tab */}
      {activeSubTab === 'info' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
              <input
                type="text"
                value={profile.firstName}
                onChange={(e) => setProfile(p => ({ ...p, firstName: e.target.value }))}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <input
                type="text"
                value={profile.lastName}
                onChange={(e) => setProfile(p => ({ ...p, lastName: e.target.value }))}
                className="input w-full"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="input w-full bg-gray-100 cursor-not-allowed"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fonction / Titre</label>
              <input
                type="text"
                value={profile.jobTitle}
                onChange={(e) => setProfile(p => ({ ...p, jobTitle: e.target.value }))}
                placeholder="ex: Ingénieur d'État"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile(p => ({ ...p, phone: e.target.value }))}
                placeholder="+212 6XX XX XX XX"
                className="input w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Société / Organisation</label>
              <input
                type="text"
                value={profile.companyName}
                onChange={(e) => setProfile(p => ({ ...p, companyName: e.target.value }))}
                placeholder="ex: DPA TATA"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Département / Service</label>
              <input
                type="text"
                value={profile.department}
                onChange={(e) => setProfile(p => ({ ...p, department: e.target.value }))}
                placeholder="ex: Service Technique"
                className="input w-full"
              />
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end">
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Enregistrer le profil
            </button>
          </div>
        </div>
      )}

      {/* Signature Sub-Tab */}
      {activeSubTab === 'signature' && (
        <div className="space-y-4">
          {/* Existing signature preview */}
          {profile.signatureUrl && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-800 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Signature enregistrée
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSignaturePreview(!showSignaturePreview)}
                    className="text-sm text-green-700 hover:text-green-900 flex items-center gap-1"
                  >
                    <Eye className="w-4 h-4" />
                    {showSignaturePreview ? 'Masquer' : 'Aperçu'}
                  </button>
                  <button
                    onClick={handleDeleteSignature}
                    className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    Supprimer
                  </button>
                </div>
              </div>
              {showSignaturePreview && (
                <div className="bg-white rounded p-3 border border-green-200">
                  <img
                    src={apiService.getSignatureImageUrl(profile.signatureUrl)}
                    alt="Signature"
                    className="max-h-24 mx-auto"
                  />
                </div>
              )}
            </div>
          )}

          {/* Signature pad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {profile.signatureUrl ? 'Dessiner une nouvelle signature' : 'Dessinez votre signature ci-dessous'}
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden">
              <canvas
                ref={canvasRef}
                className="w-full cursor-crosshair"
                style={{ height: '200px', touchAction: 'none' }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Utilisez la souris ou le doigt pour dessiner votre signature
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleClearCanvas}
              className="btn-secondary flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Effacer
            </button>
            <button
              onClick={handleSaveSignature}
              disabled={signatureSaving}
              className="btn-primary flex items-center gap-2"
            >
              {signatureSaving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Enregistrer la signature
            </button>
          </div>

          {/* Info box */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">💡 Conseils pour votre signature</p>
            <ul className="list-disc ml-4 space-y-0.5 text-blue-700">
              <li>Signez comme vous le feriez sur un document officiel</li>
              <li>Votre signature sera insérée automatiquement dans les PDF exportés</li>
              <li>Elle est stockée de manière sécurisée sur le serveur</li>
              <li>Un QR Code de vérification accompagnera chaque document signé</li>
            </ul>
          </div>
        </div>
      )}

      {/* Stamp Sub-Tab */}
      {activeSubTab === 'stamp' && (
        <div className="space-y-4">
          {/* Existing stamp preview */}
          {stampPreview && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-800 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Cachet enregistré
                </span>
                <button
                  onClick={handleDeleteStamp}
                  className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </button>
              </div>
              <div className="bg-white rounded p-3 border border-green-200">
                <img
                  src={stampPreview}
                  alt="Cachet"
                  className="max-h-32 mx-auto"
                />
              </div>
            </div>
          )}

          {/* Upload stamp */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {stampPreview ? 'Remplacer le cachet' : 'Téléversez votre cachet / tampon'}
            </label>
            <div
              onClick={() => stampInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-all"
            >
              {stampSaving ? (
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-2" />
                  <p className="text-sm text-gray-500">Upload en cours...</p>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600 font-medium">
                    Cliquez pour sélectionner une image
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    PNG, JPG ou WEBP — Max 2 Mo — Fond transparent recommandé
                  </p>
                </>
              )}
            </div>
            <input
              ref={stampInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={handleStampUpload}
              className="hidden"
            />
          </div>

          {/* Info box */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">💡 Conseils pour votre cachet</p>
            <ul className="list-disc ml-4 space-y-0.5 text-blue-700">
              <li>Scannez ou photographiez votre cachet officiel</li>
              <li>Un fond transparent (PNG) donne le meilleur résultat</li>
              <li>Le cachet sera intégré à côté de votre signature dans les PDF</li>
              <li>Assurez-vous que le cachet est lisible et de bonne qualité</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSignatureTab;
