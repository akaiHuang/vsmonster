/**
 * Media Database
 * JSON file persistence for media records (NoSQL-style).
 *
 * Performance notes:
 * - Disk writes are debounced (500 ms) so rapid inserts (e.g. batch media
 *   ingest) don't each trigger a synchronous writeFileSync.
 * - Data is loaded lazily on first access rather than eagerly in the
 *   constructor, shaving startup time when the database is not needed
 *   immediately.
 * - flush() forces an immediate write -- call during graceful shutdown.
 */

interface MongoMediaRecord {
  _id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  source: 'line' | 'telegram' | 'discord';
  uploadedAt: Date;
  filePath: string;
  publicUrl: string;
  thumbnailUrl?: string;
  mediaType: 'image' | 'video' | 'file';
}

import fs from 'fs';
import path from 'path';
import { debounce } from '../utils/debounce';

const DB_PATH = process.env.MEDIA_DB_PATH || path.join(process.cwd(), '.media-db.json');

class MediaDatabase {
  private db: Map<string, MongoMediaRecord> = new Map();
  private dbPath: string;
  private loaded = false;

  constructor(dbPath: string = DB_PATH) {
    this.dbPath = dbPath;
    // NOTE: load is deferred to first access (ensureLoaded).
  }

  /** Ensure data has been loaded from disk (lazy init). */
  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.loadFromDisk();
  }

  /**
   * Load records from JSON file on disk.
   */
  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = fs.readFileSync(this.dbPath, 'utf-8');
        const parsed = JSON.parse(data) as MongoMediaRecord[];
        parsed.forEach(record => {
          this.db.set(record._id, {
            ...record,
            uploadedAt: new Date(record.uploadedAt),
          });
        });
        console.log(`\u2705 \u5f9e ${this.dbPath} \u8f09\u5165 ${parsed.length} \u7b46\u8a18\u9304`);
      }
    } catch (error) {
      console.warn(`\u26a0\ufe0f  \u7121\u6cd5\u8f09\u5165\u8cc7\u6599\u5eab: ${error}`);
    }
  }

  /**
   * Debounced disk write (500 ms trailing edge).
   */
  private debouncedSave = debounce(() => {
    this.saveImmediate();
  }, 500);

  /** Write the database to disk immediately. */
  private saveImmediate(): void {
    try {
      const data = Array.from(this.db.values());
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`\u274c \u7121\u6cd5\u4fdd\u5b58\u8cc7\u6599\u5eab: ${error}`);
    }
  }

  /**
   * Schedule a debounced save.
   */
  save(): void {
    this.debouncedSave();
  }

  /** Force an immediate write -- call during graceful shutdown. */
  flush(): void {
    this.debouncedSave.flush();
  }

  /**
   * Insert a record.
   */
  insert(id: string, record: MongoMediaRecord): void {
    this.ensureLoaded();
    this.db.set(id, record);
    this.save();
  }

  /**
   * Find a single record by ID.
   */
  findOne(id: string): MongoMediaRecord | undefined {
    this.ensureLoaded();
    return this.db.get(id);
  }

  /**
   * Find records matching a partial filter.
   */
  find(filter: Partial<MongoMediaRecord> = {}): MongoMediaRecord[] {
    this.ensureLoaded();
    return Array.from(this.db.values()).filter(record => {
      for (const [key, value] of Object.entries(filter)) {
        if ((record as any)[key] !== value) return false;
      }
      return true;
    });
  }

  /**
   * Paginated query (sorted by uploadedAt descending).
   */
  findPaginated(skip: number = 0, limit: number = 20): MongoMediaRecord[] {
    this.ensureLoaded();
    const sorted = Array.from(this.db.values()).sort(
      (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()
    );
    return sorted.slice(skip, skip + limit);
  }

  /**
   * Delete a single record.
   */
  deleteOne(id: string): boolean {
    this.ensureLoaded();
    const result = this.db.delete(id);
    if (result) {
      this.save();
    }
    return result;
  }

  /**
   * Delete multiple records matching a filter.
   */
  deleteMany(filter: Partial<MongoMediaRecord>): number {
    this.ensureLoaded();
    const before = this.db.size;
    const toDelete = this.find(filter);
    toDelete.forEach(record => this.db.delete(record._id));
    const deleted = before - this.db.size;
    if (deleted > 0) {
      this.save();
    }
    return deleted;
  }

  /**
   * Update a record by ID.
   */
  updateOne(id: string, update: Partial<MongoMediaRecord>): boolean {
    this.ensureLoaded();
    const record = this.db.get(id);
    if (!record) return false;

    const updated = { ...record, ...update, _id: id };
    this.db.set(id, updated);
    this.save();
    return true;
  }

  /**
   * Count records, optionally filtered.
   */
  count(filter?: Partial<MongoMediaRecord>): number {
    this.ensureLoaded();
    if (!filter) return this.db.size;
    return this.find(filter).length;
  }

  /**
   * Get all records.
   */
  getAll(): MongoMediaRecord[] {
    this.ensureLoaded();
    return Array.from(this.db.values());
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.ensureLoaded();
    this.db.clear();
    this.save();
  }

  /**
   * Database status for diagnostics.
   */
  status() {
    this.ensureLoaded();
    return {
      path: this.dbPath,
      exists: fs.existsSync(this.dbPath),
      size: this.db.size,
      totalSize: Array.from(this.db.values()).reduce((sum, r) => sum + r.fileSize, 0),
    };
  }
}

// Singleton
let instance: MediaDatabase | null = null;

export function getMediaDatabase(): MediaDatabase {
  if (!instance) {
    instance = new MediaDatabase();
  }
  return instance;
}

export { MediaDatabase, MongoMediaRecord };
