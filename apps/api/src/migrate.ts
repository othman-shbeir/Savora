import { createDb } from '@savora/db';
import { loadEnv } from './env';

// Applies pending migrations, then exits. (The API also migrates on start-up.)
const { migrate, close } = createDb(loadEnv().DATABASE_URL);
await migrate();
await close();
console.log('Migrations applied.');
