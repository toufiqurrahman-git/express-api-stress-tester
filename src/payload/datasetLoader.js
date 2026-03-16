/**
 * Dataset loader for CSV and JSON files.
 * Supports round-robin and random record access.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parse as csvParse } from 'csv-parse/sync';

export class DatasetLoader {
  constructor(filePath) {
    this.filePath = filePath;
    this.records = [];
  }

  async load() {
    let raw;
    try {
      raw = readFileSync(this.filePath, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read dataset file "${this.filePath}": ${err.message}`);
    }

    const ext = extname(this.filePath).toLowerCase();

    if (ext === '.csv') {
      try {
        this.records = csvParse(raw, { columns: true, skip_empty_lines: true });
      } catch (err) {
        throw new Error(`Failed to parse CSV file "${this.filePath}": ${err.message}`);
      }
    } else if (ext === '.json') {
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          throw new Error('JSON dataset must be an array of objects');
        }
        this.records = parsed;
      } catch (err) {
        throw new Error(`Failed to parse JSON file "${this.filePath}": ${err.message}`);
      }
    } else {
      throw new Error(`Unsupported dataset format "${ext}". Use .csv or .json`);
    }

    return this.records;
  }

  getRecord(index) {
    if (this.records.length === 0) return undefined;
    return this.records[index % this.records.length];
  }

  getRandomRecord() {
    if (this.records.length === 0) return undefined;
    return this.records[Math.floor(Math.random() * this.records.length)];
  }

  get length() {
    return this.records.length;
  }
}
