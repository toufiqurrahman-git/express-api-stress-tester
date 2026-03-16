/**
 * Tests for the DatasetLoader (CSV/JSON loading with round-robin/random access).
 */
import { DatasetLoader } from '../src/payload/datasetLoader.js';
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tempDir;
let jsonPath;
let csvPath;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dataset-test-'));

  // Create JSON fixture
  jsonPath = join(tempDir, 'users.json');
  writeFileSync(
    jsonPath,
    JSON.stringify([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
    ]),
  );

  // Create CSV fixture
  csvPath = join(tempDir, 'items.csv');
  writeFileSync(csvPath, 'sku,price\nAAA,10\nBBB,20\nCCC,30\n');
});

afterAll(() => {
  try { unlinkSync(jsonPath); } catch { /* ignore */ }
  try { unlinkSync(csvPath); } catch { /* ignore */ }
  try { rmdirSync(tempDir); } catch { /* ignore */ }
});

describe('DatasetLoader', () => {
  test('loads JSON files correctly', async () => {
    const loader = new DatasetLoader(jsonPath);
    const records = await loader.load();
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({ id: 1, name: 'Alice' });
  });

  test('loads CSV files correctly', async () => {
    const loader = new DatasetLoader(csvPath);
    const records = await loader.load();
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({ sku: 'AAA', price: '10' });
    expect(records[2]).toEqual({ sku: 'CCC', price: '30' });
  });

  test('getRecord() with round-robin wrapping', async () => {
    const loader = new DatasetLoader(jsonPath);
    await loader.load();

    expect(loader.getRecord(0).name).toBe('Alice');
    expect(loader.getRecord(1).name).toBe('Bob');
    expect(loader.getRecord(2).name).toBe('Charlie');
    // wraps around
    expect(loader.getRecord(3).name).toBe('Alice');
    expect(loader.getRecord(5).name).toBe('Charlie');
  });

  test('getRandomRecord() returns a valid record', async () => {
    const loader = new DatasetLoader(jsonPath);
    await loader.load();

    for (let i = 0; i < 20; i++) {
      const record = loader.getRandomRecord();
      expect(record).toBeDefined();
      expect(record).toHaveProperty('id');
      expect(record).toHaveProperty('name');
    }
  });

  test('length property returns correct count', async () => {
    const loader = new DatasetLoader(jsonPath);
    expect(loader.length).toBe(0); // before loading
    await loader.load();
    expect(loader.length).toBe(3);
  });

  test('throws for invalid file path', async () => {
    const loader = new DatasetLoader('/nonexistent/path/data.json');
    await expect(loader.load()).rejects.toThrow('Failed to read dataset file');
  });

  test('throws for unsupported file extension', async () => {
    const xmlPath = join(tempDir, 'data.xml');
    writeFileSync(xmlPath, '<data/>');
    const loader = new DatasetLoader(xmlPath);
    await expect(loader.load()).rejects.toThrow('Unsupported dataset format');
    try { unlinkSync(xmlPath); } catch { /* ignore */ }
  });

  test('getRecord() returns undefined for empty dataset', () => {
    const loader = new DatasetLoader('/tmp/empty.json');
    expect(loader.getRecord(0)).toBeUndefined();
  });

  test('getRandomRecord() returns undefined for empty dataset', () => {
    const loader = new DatasetLoader('/tmp/empty.json');
    expect(loader.getRandomRecord()).toBeUndefined();
  });

  test('throws for invalid JSON (non-array)', async () => {
    const badPath = join(tempDir, 'bad.json');
    writeFileSync(badPath, '{"not": "array"}');
    const loader = new DatasetLoader(badPath);
    await expect(loader.load()).rejects.toThrow('JSON dataset must be an array');
    try { unlinkSync(badPath); } catch { /* ignore */ }
  });
});
