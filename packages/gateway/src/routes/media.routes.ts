import { Router, Request, Response } from 'express';
import { Router as ExpressRouter } from 'express';
import {
  uploadMedia,
  getMedia,
  getMediaFile,
  listMedia,
  deleteMedia,
  getMediaStats,
  MediaRecord,
} from '../services/media.service';

const router: ExpressRouter = Router();

/**
 * 上傳媒體
 * POST /api/media/upload
 * Body: { buffer, originalFilename, mimeType, source }
 */
router.post('/upload', async (req: Request, res: Response) => {
  try {
    const { buffer, originalFilename, mimeType, source } = req.body;

    if (!buffer || !originalFilename || !mimeType) {
      return res.status(400).json({ error: '缺少必要參數' });
    }

    if (!['line', 'telegram', 'discord'].includes(source)) {
      return res.status(400).json({ error: '無效的 source' });
    }

    // 轉換 Buffer（如果是 base64）
    const fileBuffer = typeof buffer === 'string' 
      ? Buffer.from(buffer, 'base64') 
      : buffer;

    const record = await uploadMedia(fileBuffer, originalFilename, mimeType, source);

    res.json({
      success: true,
      media: record,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '上傳失敗',
    });
  }
});

/**
 * 查看媒體（預覽或下載）
 * GET /api/media/:mediaId/view
 */
router.get('/:mediaId/view', (req: Request, res: Response) => {
  try {
    const { mediaId } = req.params;
    const record = getMedia(mediaId);

    if (!record) {
      return res.status(404).json({ error: '媒體不存在' });
    }

    const fileBuffer = getMediaFile(mediaId);
    if (!fileBuffer) {
      return res.status(404).json({ error: '檔案不存在' });
    }

    // 設定響應頭
    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${record.originalFilename}"`
    );

    res.send(fileBuffer);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '取得失敗',
    });
  }
});

/**
 * 下載媒體
 * GET /api/media/:mediaId/download
 */
router.get('/:mediaId/download', (req: Request, res: Response) => {
  try {
    const { mediaId } = req.params;
    const record = getMedia(mediaId);

    if (!record) {
      return res.status(404).json({ error: '媒體不存在' });
    }

    const fileBuffer = getMediaFile(mediaId);
    if (!fileBuffer) {
      return res.status(404).json({ error: '檔案不存在' });
    }

    // 設定響應頭（強制下載）
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${record.originalFilename}"`
    );

    res.send(fileBuffer);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '下載失敗',
    });
  }
});

/**
 * 取得影片縮圖
 * GET /api/media/:mediaId/thumbnail
 */
router.get('/:mediaId/thumbnail', (req: Request, res: Response) => {
  try {
    const { mediaId } = req.params;
    const record = getMedia(mediaId);

    if (!record || !record.thumbnailUrl) {
      // 回傳預設圖片或 404
      return res.status(404).json({ error: '縮圖不存在' });
    }

    // 從磁碟讀取縮圖
    const fileBuffer = getMediaFile(mediaId);
    if (!fileBuffer) {
      return res.status(404).json({ error: '縮圖檔案不存在' });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.send(fileBuffer);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '取得縮圖失敗',
    });
  }
});

/**
 * 取得媒體資訊
 * GET /api/media/:mediaId/info
 */
router.get('/:mediaId/info', (req: Request, res: Response) => {
  try {
    const { mediaId } = req.params;
    const record = getMedia(mediaId);

    if (!record) {
      return res.status(404).json({ error: '媒體不存在' });
    }

    // 移除機密資訊，只返回公開資訊
    const { filePath, ...safeRecord } = record;
    res.json(safeRecord);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '取得資訊失敗',
    });
  }
});

/**
 * 列出媒體（分頁）
 * GET /api/media?skip=0&limit=20
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const skip = parseInt(req.query.skip as string) || 0;
    const limit = parseInt(req.query.limit as string) || 20;

    const records = listMedia(skip, limit);

    res.json({
      skip,
      limit,
      total: records.length,
      media: records.map(({ filePath, ...r }) => r), // 移除路徑
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '列表查詢失敗',
    });
  }
});

/**
 * 取得統計資訊
 * GET /api/media/stats
 */
router.get('/stats/overview', (req: Request, res: Response) => {
  try {
    const stats = getMediaStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '統計失敗',
    });
  }
});

/**
 * 刪除媒體（管理員）
 * DELETE /api/media/:mediaId
 */
router.delete('/:mediaId', (req: Request, res: Response) => {
  try {
    const { mediaId } = req.params;
    const success = deleteMedia(mediaId);

    if (!success) {
      return res.status(404).json({ error: '媒體不存在' });
    }

    res.json({ success: true, message: '已刪除' });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '刪除失敗',
    });
  }
});

export default router;
