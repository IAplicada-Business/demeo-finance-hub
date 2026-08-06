import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

export type ImportFixtureMeta = {
  file: string;
  periodIso: string | null;
  bank: string;
};

export const IMPORT_FIXTURES = {
  inter: {
    file: 'inter-sample-2024-02.png',
    periodIso: '2024-02',
    bank: 'Inter',
  },
  citi: {
    file: 'citi-sample-2010-04.jpg',
    periodIso: '2010-04',
    bank: 'Citi',
  },
  itau: {
    file: 'itau-sample.pdf',
    periodIso: null,
    bank: 'Itaú',
  },
} satisfies Record<string, ImportFixtureMeta>;

export function fixtureExists(name: string): boolean {
  return fs.existsSync(path.join(FIXTURES_DIR, name));
}

export function fixturePath(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

/** Extrato P0 preferido — Inter/Citi evitam duplicata do itau-sample.pdf. */
export function primaryImportFixture(): {
  path: string;
  periodIso?: string;
  label: string;
} | null {
  for (const meta of [IMPORT_FIXTURES.inter, IMPORT_FIXTURES.citi, IMPORT_FIXTURES.itau]) {
    if (fixtureExists(meta.file)) {
      return {
        path: fixturePath(meta.file),
        periodIso: meta.periodIso ?? undefined,
        label: meta.file,
      };
    }
  }
  return null;
}

/** Dois extratos distintos para teste de upload múltiplo. */
export function multiImportFixtures(): Array<{ path: string; periodIso?: string; label: string }> {
  const picked: Array<{ path: string; periodIso?: string; label: string }> = [];
  for (const meta of [IMPORT_FIXTURES.inter, IMPORT_FIXTURES.citi, IMPORT_FIXTURES.itau]) {
    if (!fixtureExists(meta.file)) continue;
    picked.push({
      path: fixturePath(meta.file),
      periodIso: meta.periodIso ?? undefined,
      label: meta.file,
    });
  }
  return picked;
}
