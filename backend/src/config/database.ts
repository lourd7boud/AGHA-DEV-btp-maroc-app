import nano, { DocumentScope, ServerScope } from 'nano';
import logger from '../utils/logger';

const COUCHDB_URL = process.env.COUCHDB_URL || 'http://admin:password@localhost:5984';
const DB_NAME = process.env.COUCHDB_DB_NAME || 'projet_gestion';

let connection: ServerScope;
let db: DocumentScope<any>;

export const initCouchDB = async (): Promise<void> => {
  try {
    connection = nano(COUCHDB_URL);
    
    // Vérifier si la base existe, sinon la créer
    const dbList = await connection.db.list();
    
    if (!dbList.includes(DB_NAME)) {
      await connection.db.create(DB_NAME);
      logger.info(`✅ Database ${DB_NAME} created`);
    }
    
    db = connection.db.use(DB_NAME);
    
    // Créer les vues et index
    await createViews();
    
    logger.info(`✅ Connected to CouchDB: ${DB_NAME}`);
  } catch (error) {
    logger.error('❌ CouchDB connection error:', error);
    throw error;
  }
};

const createViews = async (): Promise<void> => {
  try {
    // Vue pour les utilisateurs par email
    await db.insert({
      _id: '_design/users',
      views: {
        by_email: {
          map: `function (doc) {
            if (doc.type === 'user' && doc.email) {
              emit(doc.email, doc);
            }
          }`,
        },
      },
    });

    // Vue pour les projets par utilisateur
    await db.insert({
      _id: '_design/projects',
      views: {
        by_user: {
          map: `function (doc) {
            if (doc.type === 'project') {
              emit(doc.userId, doc);
            }
          }`,
        },
        by_status: {
          map: `function (doc) {
            if (doc.type === 'project') {
              emit([doc.userId, doc.status], doc);
            }
          }`,
        },
      },
    });

    // Vue pour les opérations de sync
    await db.insert({
      _id: '_design/sync',
      views: {
        pending: {
          map: `function (doc) {
            if (doc.type === 'sync_operation' && !doc.synced) {
              emit([doc.userId, doc.timestamp], doc);
            }
          }`,
        },
        by_device: {
          map: `function (doc) {
            if (doc.type === 'sync_operation') {
              emit([doc.deviceId, doc.timestamp], doc);
            }
          }`,
        },
      },
    });

    logger.info('✅ CouchDB views created');
  } catch (error: any) {
    if (error.statusCode === 409) {
      logger.info('ℹ️ Views already exist');
    } else {
      logger.error('❌ Error creating views:', error);
    }
  }
};

export const getCouchDB = (): DocumentScope<any> => {
  if (!db) {
    throw new Error('CouchDB not initialized. Call initCouchDB() first.');
  }
  return db;
};

export default {
  init: initCouchDB,
  getDB: getCouchDB,
};
