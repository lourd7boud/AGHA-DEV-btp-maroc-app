/**
 * Company Service
 * Gère la sauvegarde et la récupération automatique des informations des entreprises
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
 */
export const searchCompanies = async (
  userId: string,
  searchTerm: string
): Promise<Company[]> => {
  if (!searchTerm || searchTerm.length < 2) {
    // Retourner les entreprises les plus utilisées
    return await db.companies
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('usageCount')
      .then(companies => companies.slice(0, 10));
  }

  const term = searchTerm.toLowerCase();
  
  // Rechercher par nom
  const companies = await db.companies
    .where('userId')
    .equals(userId)
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
 * Obtenir toutes les entreprises de l'utilisateur
 */
export const getAllCompanies = async (userId: string): Promise<Company[]> => {
  return await db.companies
    .where('userId')
    .equals(userId)
    .reverse()
    .sortBy('usageCount');
};

/**
 * Obtenir une entreprise par son nom exact
 */
export const getCompanyByName = async (
  userId: string,
  nom: string
): Promise<Company | undefined> => {
  const companies = await db.companies
    .where('userId')
    .equals(userId)
    .filter(c => c.nom.toLowerCase() === nom.toLowerCase())
    .toArray();
  
  return companies[0];
};

/**
 * Sauvegarder ou mettre à jour une entreprise
 * Si l'entreprise existe (même nom), on met à jour ses informations
 * Sinon, on crée une nouvelle entrée
 */
export const saveCompany = async (
  userId: string,
  data: CompanyData
): Promise<Company> => {
  const now = new Date().toISOString();
  
  // Chercher si l'entreprise existe déjà
  const existing = await getCompanyByName(userId, data.nom);
  
  if (existing) {
    // Mettre à jour l'entreprise existante
    const updated: Partial<Company> = {
      ...data,
      usageCount: existing.usageCount + 1,
      lastUsed: now,
      updatedAt: now,
    };
    
    await db.companies.update(existing.id, updated);
    
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
