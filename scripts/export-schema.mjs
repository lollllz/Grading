import { writeFileSync } from 'node:fs';
import { schema } from '../server/schema.mjs';
writeFileSync(new URL('../database/postgres.sql', import.meta.url), `-- PostgreSQL 16+ / Neon. Objects live in the isolated gradebook schema.\nBEGIN;\n${schema}\nCOMMIT;\n`);
console.log('PostgreSQL schema exported.');
