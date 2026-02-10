/**
 * Core API Routes
 * All REST API endpoints extracted from server.ts for improved maintainability.
 * Routes are registered via `registerApiRoutes()`.
 */

import { Express } from 'express';
import { HolographyServer, ChannelType } from '@vsmonster/holography';
import { TaskManager, isValidTaskId } from '../task/manager';
import { MCPController } from '../mcp/controller';
import { TunnelService } from '../tunnel/service';
import { getMediaDatabase } from '../db/media-database';
import { loadAISettings, saveAISettings, AVAILABLE_MODELS, TASK_TYPES } from '../services/ai-settings.service';
import { verifyTaskPreviewToken } from '../services/share-token.service';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface ApiRouteDependencies {
  holography: HolographyServer;
  taskManager: TaskManager;
  mcpController: MCPController;
  tunnelService: TunnelService;
}

/**
 * Register all REST API endpoints on the given Express app.
 */
export function registerApiRoutes(app: Express, deps: ApiRouteDependencies): void {
  const { holography, taskManager, mcpController, tunnelService } = deps;

  // ── Health check ────────────────────────────────────────────

  app.get('/health', (_req, res) => {
    const wst = holography.getWebSocketTransport();
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      connections: wst.getClientCount(),
    });
  });

  // ── Task CRUD ───────────────────────────────────────────────

  app.get('/api/tasks', (_req, res) => {
    res.json(taskManager.getAllTasks());
  });

  app.get('/api/tasks/:id', (req, res) => {
    const task = taskManager.getTask(req.params.id);
    if (task) {
      res.json(task);
    } else {
      res.status(404).json({ error: 'Task not found' });
    }
  });

  app.get('/api/tasks/:id/detail', (req, res) => {
    const task = taskManager.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const mediaDb = getMediaDatabase();
    const mediaRecords = (task.delivery?.mediaIds || [])
      .map(id => mediaDb.findOne(id))
      .filter(Boolean);

    res.json({ task, media: mediaRecords });
  });

  app.post('/api/tasks/:id/deliver', (req, res) => {
    const task = taskManager.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { mediaIds, summary } = req.body;
    taskManager.setTaskDelivery(req.params.id, {
      mediaIds,
      summary,
      deliveredAt: new Date(),
    });

    res.json({ success: true, task: taskManager.getTask(req.params.id) });
  });

  app.post('/api/tasks/:id/review', async (req, res) => {
    const task = taskManager.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { approved, comment } = req.body;
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved (boolean) is required' });
    }

    taskManager.reviewTask(req.params.id, approved, comment);

    const statusLabel = approved ? '✅ 已核准' : '↩️ 需要修改';
    let notifyText = `${statusLabel}\n任務: ${task.instruction.slice(0, 50)}`;
    if (comment) notifyText += `\n備註: ${comment}`;

    try {
      await holography.sendMessage(
        task.channel as ChannelType,
        task.userId,
        { text: notifyText }
      );
    } catch (err) {
      logger.warn(`Failed to notify user for task review: ${err}`);
    }

    holography.broadcastRawToExtensions({
      type: 'task_reviewed',
      taskId: req.params.id,
      approved,
      comment,
    });

    res.json({ success: true, task: taskManager.getTask(req.params.id) });
  });

  app.post('/api/tasks', (req, res) => {
    const { instruction, channel, userId, priority } = req.body;
    if (!instruction) {
      return res.status(400).json({ error: 'instruction is required' });
    }

    const task = taskManager.createTask({
      channel: channel || 'api-test',
      userId: userId || 'test-user',
      instruction,
      priority: priority || 'normal',
    });

    holography.broadcastRawToExtensions({
      type: 'new_task',
      task,
      instruction,
      media: [],
    });

    res.json({ success: true, task });
  });

  // ── MCP ─────────────────────────────────────────────────────

  app.get('/api/mcp/servers', (_req, res) => {
    res.json(mcpController.listServers());
  });

  app.post('/api/mcp/:server/invoke', async (req, res) => {
    try {
      const result = await mcpController.invoke(
        req.params.server,
        req.body.action,
        req.body.params
      );
      res.json(result);
    } catch (error) {
      logger.error('MCP invoke error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // ── Tunnel ──────────────────────────────────────────────────

  app.get('/api/tunnel', (_req, res) => {
    res.json(tunnelService.getStatus());
  });

  // ── AI Settings ─────────────────────────────────────────────

  app.get('/api/ai-settings', (_req, res) => {
    res.json(loadAISettings());
  });

  app.put('/api/ai-settings', (req, res) => {
    try {
      const current = loadAISettings();
      const updated = {
        blueMonster: { ...current.blueMonster, ...req.body.blueMonster },
        ufo: { ...current.ufo, ...req.body.ufo },
      };
      saveAISettings(updated);
      res.json({ success: true, settings: updated });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/ai-settings/models', (_req, res) => {
    res.json({ models: AVAILABLE_MODELS, taskTypes: TASK_TYPES });
  });

  // ── Persona (me.md) ────────────────────────────────────────

  // Resolve paths relative to the gateway package root so this works regardless of process.cwd().
  // src/routes -> packages/gateway; dist/routes -> packages/gateway
  const gatewayRoot = path.resolve(__dirname, '../..');
  const repoRoot = path.resolve(gatewayRoot, '../..');
  const personaPaths: Record<string, string> = {
    ufo: path.join(repoRoot, 'UFO/me.md'),
    bluemonster: path.join(repoRoot, 'packages/blue-monster/me.md'),
  };

  app.get('/api/persona/:agent', (req, res) => {
    const agentPath = personaPaths[req.params.agent];
    if (!agentPath) {
      return res.status(404).json({ error: 'Unknown agent' });
    }
    try {
      const content = fs.existsSync(agentPath) ? fs.readFileSync(agentPath, 'utf8') : '';
      res.json({ content, path: agentPath });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.put('/api/persona/:agent', (req, res) => {
    const agentPath = personaPaths[req.params.agent];
    if (!agentPath) {
      return res.status(404).json({ error: 'Unknown agent' });
    }
    try {
      const content = req.body.content ?? '';
      fs.writeFileSync(agentPath, content, 'utf8');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ── Users / Channels ───────────────────────────────────────

  app.delete('/api/users/:channel/:userId', (req, res) => {
    const { channel, userId } = req.params;
    try {
      const cm = holography.getChannelManager();
      const ch = cm.getChannel(channel as ChannelType);
      if (ch) {
        ch.removeFromWhitelist(userId);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: `Channel ${channel} not found` });
      }
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/channels', (_req, res) => {
    res.json({ channels: holography.getChannelManager().getEnabledChannels() });
  });

  // ── WebSocket status ────────────────────────────────────────

  app.get('/api/ws/status', (_req, res) => {
    const wst = holography.getWebSocketTransport();
    res.json({
      clientCount: wst.getClientCount(),
      clients: wst.getClients(),
      hasActiveConnections: wst.hasActiveConnections(),
    });
  });

  // ── Secure task preview (/share) ────────────────────────────
  // Serves HTML/CSS/JS assets from UFO tasks folders, protected by a signed token.
  //
  // URL: /share/{taskId}/{token}/index.html
  const tasksRoot = path.join(repoRoot, 'UFO', 'tasks');
  const allowedStatuses = ['pending', 'approved', 'in-progress', 'done'] as const;
  const allowedExts = new Set([
    '.html', '.htm',
    '.css',
    '.js', '.mjs',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
    '.woff', '.woff2', '.ttf', '.otf',
    '.txt',
    '.map',
  ]);
  const blockedBasenames = new Set([
    'readme.md',
    'agents.md',
    'handoff.json',
    'gateway-task.json',
    '.env',
    '.env.local',
  ]);

  const contentTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
  };

  function findTaskStatus(taskId: string): string | null {
    for (const status of allowedStatuses) {
      const dir = path.join(tasksRoot, status, taskId);
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        return status;
      }
    }
    return null;
  }

  function isSafeRelativePath(rel: string): boolean {
    if (!rel) return false;
    if (rel.includes('..') || rel.includes('~') || rel.includes('\\') || rel.includes('\0')) return false;
    const parts = rel.split('/').filter(Boolean);
    if (parts.some(p => p.startsWith('.'))) return false;
    return true;
  }

  app.get('/share/:taskId/:token', (req, res) => {
    const { taskId, token } = req.params;
    if (!isValidTaskId(taskId)) {
      return res.status(400).json({ error: 'Invalid taskId' });
    }
    if (!verifyTaskPreviewToken(taskId, token)) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    res.redirect(`/share/${encodeURIComponent(taskId)}/${encodeURIComponent(token)}/index.html`);
  });

  app.get('/share/:taskId/:token/*', (req, res) => {
    const { taskId, token } = req.params;
    if (!isValidTaskId(taskId)) {
      return res.status(400).json({ error: 'Invalid taskId' });
    }
    if (!verifyTaskPreviewToken(taskId, token)) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    const prefix = `/share/${taskId}/${token}/`;
    let relPath = req.path.startsWith(prefix) ? req.path.slice(prefix.length) : '';
    if (!relPath) relPath = 'index.html';

    if (!isSafeRelativePath(relPath)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const baseName = path.basename(relPath).toLowerCase();
    if (blockedBasenames.has(baseName)) {
      return res.status(403).json({ error: 'Blocked file' });
    }

    const ext = path.extname(relPath).toLowerCase();
    if (ext && !allowedExts.has(ext)) {
      return res.status(403).json({ error: 'File type not allowed' });
    }

    const status = findTaskStatus(taskId);
    if (!status) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const rootDir = path.resolve(tasksRoot, status, taskId);
    const fullPath = path.resolve(rootDir, relPath);
    if (!fullPath.startsWith(rootDir)) {
      return res.status(400).json({ error: 'Path traversal detected' });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(fullPath);
  });
}
