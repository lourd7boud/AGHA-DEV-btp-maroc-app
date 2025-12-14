import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Lock, Unlock, Trash2, ArrowLeft } from 'lucide-react';
import { db, User, AuditLog } from '../db/database';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';

export default function UsersManagementPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser?.role !== 'super_admin') {
      navigate('/');
      return;
    }
    loadUsers();
  }, [currentUser, navigate]);

  const loadUsers = async () => {
    try {
      const allUsers = await db.users.toArray();
      setUsers(allUsers.filter(u => !u.email.includes('deleted')));
      setLoading(false);
    } catch (error) {
      console.error('Error loading users:', error);
      setLoading(false);
    }
  };

  const logAction = async (action: string, entityId: string, details: any) => {
    const log: AuditLog = {
      id: `audit:${uuidv4()}`,
      userId: currentUser!.id,
      userEmail: currentUser!.email,
      action,
      entityType: 'user',
      entityId,
      details,
      timestamp: new Date().toISOString(),
    };
    await db.auditLogs.add(log);
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await db.users.update(user.id, { isActive: !user.isActive });
      await logAction(
        user.isActive ? 'disable_user' : 'enable_user',
        user.id,
        { email: user.email, previousStatus: user.isActive }
      );
      loadUsers();
    } catch (error) {
      console.error('Error toggling user status:', error);
      alert('Erreur lors de la modification du statut');
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${user.firstName} ${user.lastName}?`)) {
      return;
    }

    try {
      await db.users.delete(user.id);
      await logAction('delete_user', user.id, { 
        email: user.email, 
        name: `${user.firstName} ${user.lastName}` 
      });
      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-100 text-primary-600 rounded-lg">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    Gestion des Utilisateurs
                  </h1>
                  <p className="text-sm text-gray-500">{users.length} utilisateurs</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nouvel Utilisateur
            </button>
          </div>
        </div>
      </div>

      {/* Users List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Utilisateur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rôle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Période d'essai
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => {
                const trialExpired = user.trialEndDate && new Date(user.trialEndDate) < new Date();
                const trialDaysLeft = user.trialEndDate
                  ? Math.ceil((new Date(user.trialEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                  : null;

                return (
                  <tr key={user.id} className={trialExpired ? 'bg-red-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.role === 'super_admin' 
                          ? 'bg-purple-100 text-purple-800'
                          : user.role === 'admin'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.isActive ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.trialEndDate ? (
                        <div className={trialExpired ? 'text-red-600 font-medium' : ''}>
                          {trialExpired ? (
                            'Expiré'
                          ) : (
                            <span>{trialDaysLeft} jours restants</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {user.role !== 'super_admin' && (
                          <>
                            <button
                              onClick={() => handleToggleStatus(user)}
                              className={`p-2 rounded-lg transition-colors ${
                                user.isActive
                                  ? 'hover:bg-red-50 text-red-600'
                                  : 'hover:bg-green-50 text-green-600'
                              }`}
                              title={user.isActive ? 'Désactiver' : 'Activer'}
                            >
                              {user.isActive ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user)}
                              className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadUsers();
          }}
          currentUser={currentUser!}
        />
      )}
    </div>
  );
}

interface CreateUserModalProps {
  onClose: () => void;
  onCreated: () => void;
  currentUser: User;
}

function CreateUserModal({ onClose, onCreated, currentUser }: CreateUserModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'user' as 'user' | 'admin',
    trialDays: 30,
    hasTrial: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const trialEndDate = formData.hasTrial
        ? new Date(Date.now() + formData.trialDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      const newUser: User = {
        id: `user:${uuidv4()}`,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        isActive: true,
        trialEndDate,
        createdBy: currentUser.id,
        createdAt: new Date().toISOString(),
      };

      await db.users.add(newUser);

      // Log action
      const log: AuditLog = {
        id: `audit:${uuidv4()}`,
        userId: currentUser.id,
        userEmail: currentUser.email,
        action: 'create_user',
        entityType: 'user',
        entityId: newUser.id,
        details: {
          email: newUser.email,
          role: newUser.role,
          hasTrial: formData.hasTrial,
          trialDays: formData.trialDays,
        },
        timestamp: new Date().toISOString(),
      };
      await db.auditLogs.add(log);

      alert(`Utilisateur créé avec succès!\nEmail: ${formData.email}\nMot de passe: ${formData.password}\n\nVeuillez communiquer ces informations à l'utilisateur.`);
      onCreated();
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Erreur lors de la création de l\'utilisateur');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Nouvel Utilisateur</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prénom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="input w-full"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="input w-full"
              placeholder="utilisateur@agriculture.gov.ma"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="input w-full"
              placeholder="Générer un mot de passe fort"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rôle <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as 'user' | 'admin' })}
              className="input w-full"
            >
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>

          <div className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg">
            <input
              type="checkbox"
              checked={formData.hasTrial}
              onChange={(e) => setFormData({ ...formData, hasTrial: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label className="text-sm font-medium text-gray-700 flex-1">
              Période d'essai
            </label>
            {formData.hasTrial && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={formData.trialDays}
                  onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 30 })}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                  min="1"
                />
                <span className="text-sm text-gray-600">jours</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button type="submit" className="flex-1 btn btn-primary">
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
