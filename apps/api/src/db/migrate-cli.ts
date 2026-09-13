import { loadEnv } from '../config/env.js';
import { openDatabase } from './client.js';
import { migrate } from './migrate.js';

const env = loadEnv();
const db = openDatabase(env.DATABASE_PATH);
const ran = migrate(db);
console.log(ran.length ? `Migrations appliquées : ${ran.join(', ')}` : 'Base à jour.');
db.close();
