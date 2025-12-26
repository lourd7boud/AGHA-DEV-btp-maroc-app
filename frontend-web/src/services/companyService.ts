/**
 * Company Service
 * Gère la sauvegarde et la récupération automatique des informations des entreprises
 * Les entreprises sont partagées entre TOUS les utilisateurs
 * 
 * EN MODE WEB: Utilise l'API pour récupérer les entreprises depuis les projets du serveur
 * EN MODE OFFLINE: Utilise IndexedDB (fallback)
 */

import { db, Company } from '../db/database';
import { apiService } from './apiService';
import { v4 as uuidv4 } from 'uuid';

export interface CompanyData {
  nom: string;
  rc?: string;
  cb?: string;
  cnss?: string;
  patente?: string;
  adresse?: string;
  telephone?: string;
  email?: string;
}

// Cache pour les entreprises du serveur
let serverCompaniesCache: Company[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 secondes

/**
 * Récupérer les entreprises depuis le serveur
 */
const fetchServerCompanies = async (): Promise<Company[]> => {
  const now = Date.now();
  
  // Utiliser le cache si valide
  if (serverCompaniesCache.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
    return serverCompaniesCache;
  }
  
  try {
    const companies = await apiService.getCompanies();
    serverCompaniesCache = companies.map((c, index) => ({
      id: `server-company-${index}`,
      userId: 'server',
      nom: c.nom,
      rc: c.rc || '',
      cnss: c.cnss || '',
      usageCount: 1,
      lastUsed: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    lastFetchTime = now;
    console.log(`✅ ${serverCompaniesCache.length} entreprises récupérées du serveur`);
    return serverCompaniesCache;
  } catch (error) {
    console.warn('⚠️ Impossible de récupérer les entreprises du serveur, fallback IndexedDB');
    return [];
  }
};

/**
 * Rechercher des entreprises par nom (pour l'autocomplétion)
 * Les entreprises sont partagées entre TOUS les utilisateurs
 * Mode Web: Récupère depuis l'API (projets du serveur)
 */
export const searchCompanies = async (
  _userId: string, // Gardé pour compatibilité mais non utilisé
  searchTerm: string
): Promise<Company[]> => {
  // D'abord, essayer de récupérer depuis le serveur
  const serverCompanies = await fetchServerCompanies();
  
  // Aussi récupérer les entreprises locales (IndexedDB)
  let localCompanies: Company[] = [];
  try {
    localCompanies = await db.companies.toArray();
  } catch (e) {
    // IndexedDB non disponible
  }
  
  // Fusionner les deux sources (serveur prioritaire)
  const allCompaniesMap = new Map<string, Company>();
  
  // D'abord les entreprises du serveur
  for (const c of serverCompanies) {
    allCompaniesMap.set(c.nom.toLowerCase(), c);
  }
  
  // Ensuite les entreprises locales (ne remplace pas les existantes)
  for (const c of localCompanies) {
    const key = c.nom.toLowerCase();
    if (!allCompaniesMap.has(key)) {
      allCompaniesMap.set(key, c);
    }
  }
  
  const allCompanies = Array.from(allCompaniesMap.values());
  
  if (!searchTerm || searchTerm.length < 2) {
    // Retourner les entreprises les plus utilisées
    return allCompanies
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 10);
  }

  const term = searchTerm.toLowerCase();
  
  // Filtrer par nom, RC ou CNSS
  const filtered = allCompanies.filter(company => {
    const matchNom = company.nom.toLowerCase().includes(term);
    const matchRc = company.rc ? company.rc.toLowerCase().includes(term) : false;
    const matchCnss = company.cnss ? company.cnss.toLowerCase().includes(term) : false;
    return matchNom || matchRc || matchCnss;
  });

  // Trier par pertinence (commence par > contient) et par usage
  return filtered.sort((a, b) => {
    const aStartsWith = a.nom.toLowerCase().startsWith(term);
    const bStartsWith = b.nom.toLowerCase().startsWith(term);
    
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    
    return (b.usageCount || 0) - (a.usageCount || 0);
  }).slice(0, 10);
};

/**
 * Obtenir toutes les entreprises (partagées entre tous les utilisateurs)
 * Mode Web: Récupère depuis l'API
 */
export const getAllCompanies = async (_userId: string): Promise<Company[]> => {
  // D'abord, essayer de récupérer depuis le serveur
  const serverCompanies = await fetchServerCompanies();
  
  // Aussi récupérer les entreprises locales (IndexedDB)
  let localCompanies: Company[] = [];
  try {
    localCompanies = await db.companies.toArray();
  } catch (e) {
    // IndexedDB non disponible
  }
  
  // Fusionner (serveur prioritaire)
  const allCompaniesMap = new Map<string, Company>();
  for (const c of serverCompanies) {
    allCompaniesMap.set(c.nom.toLowerCase(), c);
  }
  for (const c of localCompanies) {
    const key = c.nom.toLowerCase();
    if (!allCompaniesMap.has(key)) {
      allCompaniesMap.set(key, c);
    }
  }
  
  return Array.from(allCompaniesMap.values()).sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
};

/**
 * Obtenir une entreprise par son nom exact (recherche globale)
 * Mode Web: Cherche d'abord dans le serveur, puis localement
 */
export const getCompanyByName = async (
  _userId: string, // Gardé pour compatibilité mais non utilisé
  nom: string
): Promise<Company | undefined> => {
  const searchTerm = nom.toLowerCase();
  
  // Chercher dans le cache serveur
  const serverCompanies = await fetchServerCompanies();
  const serverMatch = serverCompanies.find(c => c.nom.toLowerCase() === searchTerm);
  if (serverMatch) return serverMatch;
  
  // Fallback: chercher dans IndexedDB
  try {
    const companies = await db.companies
      .filter(c => c.nom.toLowerCase() === searchTerm)
      .toArray();
    return companies[0];
  } catch (e) {
    return undefined;
  }
};

/**
 * Sauvegarder ou mettre à jour une entreprise
 * Si l'entreprise existe (même nom), on met à jour ses informations
 * Sinon, on crée une nouvelle entrée
 * Les entreprises sont partagées entre TOUS les utilisateurs
 */
export const saveCompany = async (
  userId: string,
  data: CompanyData
): Promise<Company> => {
  const now = new Date().toISOString();
  
  // Chercher si l'entreprise existe déjà (recherche globale, pas par userId)
  const existing = await getCompanyByName('', data.nom);
  
  if (existing) {
    // Mettre à jour l'entreprise existante
    const updated: Partial<Company> = {
      ...data,
      usageCount: existing.usageCount + 1,
      lastUsed: now,
      updatedAt: now,
    };
    
    await db.companies.update(existing.id, updated);
    
    // Enregistrer opération de sync pour UPDATE
    await db.syncOperations.add({
      id: `sync:${uuidv4()}`,
      userId,
      deviceId: localStorage.getItem('deviceId') || 'device-001',
      type: 'UPDATE',
      entity: 'company',
      entityId: existing.id,
      data: { ...existing, ...updated },
      timestamp: Date.now(),
      synced: false,
    });
    
    return { ...existing, ...updated } as Company;
  } else {
    // Créer une nouvelle entreprise
    const newCompany: Company = {
      id: `company:${uuidv4()}`,
      userId,
      nom: data.nom,
      rc: data.rc,
      cb: data.cb,
      cnss: data.cnss,
      patente: data.patente,
      adresse: data.adresse,
      telephone: data.telephone,
      email: data.email,
      usageCount: 1,
      lastUsed: now,
      createdAt: now,
      updatedAt: now,
    };
    
    await db.companies.add(newCompany);
    
    // Enregistrer opération de sync pour CREATE
    await db.syncOperations.add({
      id: `sync:${uuidv4()}`,
      userId,
      deviceId: localStorage.getItem('deviceId') || 'device-001',
      type: 'CREATE',
      entity: 'company',
      entityId: newCompany.id,
      data: newCompany,
      timestamp: Date.now(),
      synced: false,
    });
    
    console.log('✅ Nouvelle entreprise créée et prête pour sync:', newCompany.nom);
    
    return newCompany;
  }
};

/**
 * Supprimer une entreprise
 */
export const deleteCompany = async (companyId: string): Promise<void> => {
  await db.companies.delete(companyId);
};

/**
 * Migration: Extraire les entreprises des projets existants et les ajouter au catalogue
 * Cette fonction parcourt tous les projets et crée des entrées dans la table companies
 * pour les entreprises qui n'existent pas encore
 */
export const migrateCompaniesFromProjects = async (): Promise<number> => {
  const migrationKey = 'companies_migration_v2'; // Version 2 pour forcer la re-migration
  
  // Vérifier le nombre d'entreprises existantes
  const existingCompaniesCount = await db.companies.count();
  
  // Si la migration a été faite ET qu'il y a des entreprises, ne pas refaire
  if (localStorage.getItem(migrationKey) && existingCompaniesCount > 0) {
    console.log(`✅ Migration des entreprises déjà effectuée (${existingCompaniesCount} entreprises)`);
    return 0;
  }
  
  console.log('🔄 Début de la migration des entreprises depuis les projets...');
  
  try {
    const projects = await db.projects.toArray();
    let migratedCount = 0;
    const now = new Date().toISOString();
    
    for (const project of projects) {
      if (!project.societe || project.societe.trim() === '') continue;
      
      // Vérifier si l'entreprise existe déjà
      const existingCompanies = await db.companies
        .filter(c => c.nom.toLowerCase() === project.societe!.toLowerCase())
        .toArray();
      
      if (existingCompanies.length === 0) {
        // Créer l'entreprise
        const newCompany: Company = {
          id: `company:${uuidv4()}`,
          userId: project.userId || 'system',
          nom: project.societe,
          rc: project.rc,
          cb: project.cb,
          cnss: project.cnss,
          patente: project.patente,
          usageCount: 1,
          lastUsed: now,
          createdAt: now,
          updatedAt: now,
        };
        
        await db.companies.add(newCompany);
        migratedCount++;
        console.log(`✅ Entreprise migrée: ${newCompany.nom}`);
      } else {
        // Mettre à jour le compteur d'utilisation
        const existing = existingCompanies[0];
        await db.companies.update(existing.id, {
          usageCount: existing.usageCount + 1,
          lastUsed: now,
          // Mettre à jour les infos si elles sont manquantes
          rc: existing.rc || project.rc,
          cb: existing.cb || project.cb,
          cnss: existing.cnss || project.cnss,
          patente: existing.patente || project.patente,
        });
      }
    }
    
    // Marquer la migration comme effectuée
    localStorage.setItem(migrationKey, new Date().toISOString());
    
    // Log des statistiques finales
    const totalCompanies = await db.companies.count();
    console.log(`✅ Migration terminée: ${migratedCount} entreprises ajoutées (total: ${totalCompanies})`);
    return migratedCount;
  } catch (error) {
    console.error('❌ Erreur lors de la migration des entreprises:', error);
    return 0;
  }
};

/**
 * Extraire les données d'entreprise depuis les données d'un projet
 */
export const extractCompanyFromProject = (projectData: {
  societe?: string;
  rc?: string;
  cb?: string;
  cnss?: string;
  patente?: string;
}): CompanyData | null => {
  if (!projectData.societe) return null;
  
  return {
    nom: projectData.societe,
    rc: projectData.rc,
    cb: projectData.cb,
    cnss: projectData.cnss,
    patente: projectData.patente,
  };
};

/**
 * Hook personnalisé pour la gestion des entreprises dans un formulaire
 */
export const useCompanyAutocomplete = () => {
  // Cette fonction sera utilisée dans les composants React
  // pour implémenter l'autocomplétion
};
