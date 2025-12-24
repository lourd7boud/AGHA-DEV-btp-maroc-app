/**
 * Company Service
 * Gère la sauvegarde et la récupération automatique des informations des entreprises
 * Les entreprises sont partagées entre TOUS les utilisateurs
 */

import { db, Company } from '../db/database';
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

/**
 * Rechercher des entreprises par nom (pour l'autocomplétion)
 * Les entreprises sont partagées entre TOUS les utilisateurs
 */
export const searchCompanies = async (
  _userId: string, // Gardé pour compatibilité mais non utilisé
  searchTerm: string
): Promise<Company[]> => {
  if (!searchTerm || searchTerm.length < 2) {
    // Retourner les entreprises les plus utilisées (toutes les entreprises)
    const allCompanies = await db.companies.toArray();
    return allCompanies
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);
  }

  const term = searchTerm.toLowerCase();
  
  // Rechercher par nom dans TOUTES les entreprises
  const companies = await db.companies
    .filter(company => {
      const matchNom = company.nom.toLowerCase().includes(term);
      const matchRc = company.rc ? company.rc.toLowerCase().includes(term) : false;
      const matchCnss = company.cnss ? company.cnss.toLowerCase().includes(term) : false;
      return matchNom || matchRc || matchCnss;
    })
    .toArray();

  // Trier par pertinence (commence par > contient) et par usage
  return companies.sort((a, b) => {
    const aStartsWith = a.nom.toLowerCase().startsWith(term);
    const bStartsWith = b.nom.toLowerCase().startsWith(term);
    
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    
    return b.usageCount - a.usageCount;
  }).slice(0, 10);
};

/**
 * Obtenir toutes les entreprises (partagées entre tous les utilisateurs)
 */
export const getAllCompanies = async (_userId: string): Promise<Company[]> => {
  const allCompanies = await db.companies.toArray();
  return allCompanies.sort((a, b) => b.usageCount - a.usageCount);
};

/**
 * Obtenir une entreprise par son nom exact (recherche globale)
 */
export const getCompanyByName = async (
  _userId: string, // Gardé pour compatibilité mais non utilisé
  nom: string
): Promise<Company | undefined> => {
  const companies = await db.companies
    .filter(c => c.nom.toLowerCase() === nom.toLowerCase())
    .toArray();
  
  return companies[0];
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
