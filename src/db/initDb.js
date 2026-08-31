// Standalone DB initialiser: `npm run init-db`
import { initDb } from '../config/db.js';

initDb()
  .then(() => {
    console.log('✅ Database and tables are ready.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Database init failed:', err.message);
    process.exit(1);
  });
