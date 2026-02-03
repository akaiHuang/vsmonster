/**
 * MongoDB 適配器
 * 為多媒體資料庫提供持久化儲存
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

// 使用簡單的 JSON 檔案作為 NoSQL 替代方案
// 實際應用可替換為真正的 MongoDB

import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.MEDIA_DB_PATH || path.join(process.cwd(), '.media-db.json');

class MediaDatabase {
  private db: Map<string, MongoMediaRecord> = new Map();
  private dbPath: string;

  constructor(dbPath: string = DB_PATH) {
    this.dbPath = dbPath;
    this.load();
  }

  /**
   * 從檔案載入資料庫
   */
  private load(): void {
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
        console.log(`✅ 從 ${this.dbPath} 載入 ${parsed.length} 筆記錄`);
      }
    } catch (error) {
      console.warn(`⚠️  無法載入資料庫: ${error}`);
    }
  }

  /**
   * 保存資料庫到檔案
   */
  save(): void {
    try {
      const data = Array.from(this.db.values());
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`❌ 無法保存資料庫: ${error}`);
    }
  }

  /**
   * 新增記錄
   */
  insert(id: string, record: MongoMediaRecord): void {
    this.db.set(id, record);
    this.save();
  }

  /**
   * 查詢單筆記錄
   */
  findOne(id: string): MongoMediaRecord | undefined {
    return this.db.get(id);
  }

  /**
   * 查詢多筆記錄
   */
  find(filter: Partial<MongoMediaRecord> = {}): MongoMediaRecord[] {
    return Array.from(this.db.values()).filter(record => {
      for (const [key, value] of Object.entries(filter)) {
        if ((record as any)[key] !== value) return false;
      }
      return true;
    });
  }

  /**
   * 列表查詢（分頁）
   */
  findPaginated(skip: number = 0, limit: number = 20): MongoMediaRecord[] {
    const sorted = Array.from(this.db.values()).sort(
      (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()
    );
    return sorted.slice(skip, skip + limit);
  }

  /**
   * 刪除記錄
   */
  deleteOne(id: string): boolean {
    const result = this.db.delete(id);
    if (result) {
      this.save();
    }
    return result;
  }

  /**
   * 刪除多筆記錄
   */
  deleteMany(filter: Partial<MongoMediaRecord>): number {
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
   * 更新記錄
   */
  updateOne(id: string, update: Partial<MongoMediaRecord>): boolean {
    const record = this.db.get(id);
    if (!record) return false;
    
    const updated = { ...record, ...update, _id: id };
    this.db.set(id, updated);
    this.save();
    return true;
  }

  /**
   * 統計
   */
  count(filter?: Partial<MongoMediaRecord>): number {
    if (!filter) return this.db.size;
    return this.find(filter).length;
  }

  /**
   * 獲取所有記錄
   */
  getAll(): MongoMediaRecord[] {
    return Array.from(this.db.values());
  }

  /**
   * 清空資料庫
   */
  clear(): void {
    this.db.clear();
    this.save();
  }

  /**
   * 狀態檢查
   */
  status() {
    return {
      path: this.dbPath,
      exists: fs.existsSync(this.dbPath),
      size: this.db.size,
      totalSize: Array.from(this.db.values()).reduce((sum, r) => sum + r.fileSize, 0),
    };
  }
}

// 單例實例
let instance: MediaDatabase | null = null;

export function getMediaDatabase(): MediaDatabase {
  if (!instance) {
    instance = new MediaDatabase();
  }
  return instance;
}

export { MediaDatabase, MongoMediaRecord };
