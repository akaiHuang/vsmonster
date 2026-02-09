/**
 * Core API Routes
 * All REST API endpoints extracted from server.ts for improved maintainability.
 * Routes are registered via `registerApiRoutes()`.
 */

import { Express } from 'express';
import { HolographyServer, ChannelType } from '@vsmonster/holography';
import { TaskManager } from '../task/manager';
import { MCPController } from '../mcp/controller';
import { TunnelService } from '../tunnel/service';
import { getMediaDatabase } from '../db/media-database';
import { loadAISettings, saveAISettings, AVAILABLE_MODELS, TASK_TYPES } from '../services/ai-settings.service';
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

  const projectRoot = process.cwd();
  const personaPaths: Record<string, string> = {
    ufo: path.join(projectRoot, 'UFO/me.md'),
    bluemonster: path.join(projectRoot, 'packages/blue-monster/me.md'),
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

  // ── Preview files from tasks folder ─────────────────────────
  // Serves HTML/CSS/JS files directly from UFO tasks folders
  // URL: /preview/{taskId}/index.html
  // Note: projectRoot is packages/gateway, so we need to go up two levels
  const tasksRoot = path.resolve(projectRoot, '../../UFO/tasks');

  app.get('/preview/:status/:taskId/*', (req, res) => {
    const { status, taskId } = req.params;
    // Get the wildcard part of the URL (everything after /preview/:status/:taskId/)
    const wildcardPath = req.path.replace(`/preview/${status}/${taskId}/`, '') || 'index.html';
    const filePath = wildcardPath || 'index.html';

    // Security: only allow specific statuses
    if (!['pending', 'approved', 'in-progress', 'done'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Security: prevent path traversal
    if (filePath.includes('..') || filePath.includes('~')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const fullPath = path.resolve(tasksRoot, status, taskId, filePath);

    // Ensure the path is within the tasks folder (security check)
    if (!fullPath.startsWith(tasksRoot)) {
      return res.status(400).json({ error: 'Path traversal detected' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found', path: fullPath });
    }

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.sendFile(fullPath);
  });

  // Shorthand: /preview/:taskId searches all status folders
  app.get('/preview/:taskId', (req, res) => {
    const { taskId } = req.params;
    const statuses = ['in-progress', 'done', 'approved', 'pending'];

    for (const status of statuses) {
      const indexPath = path.join(tasksRoot, status, taskId, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.redirect(`/preview/${status}/${taskId}/index.html`);
        return;
      }
    }

    res.status(404).json({ error: 'Task not found', taskId });
  });
}
