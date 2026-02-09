// UFO Dashboard webview script (external file to satisfy CSP)
(function () {
  const vscode = acquireVsCodeApi();
  const configEl = document.getElementById('ufo-config');
  const GATEWAY_URL = configEl ? configEl.dataset.gatewayUrl : '';
  const byId = (id) => document.getElementById(id);
  const setText = (id, v) => { const el = byId(id); if (el) el.textContent = v; };

  // === Tab switching ===
  let activeTab = 'overview';
  let settingsLoaded = false;

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tab-content').forEach(tc =>
        tc.classList.toggle('active', tc.id === 'tab-' + activeTab)
      );
      if (activeTab === 'settings' && !settingsLoaded) {
        settingsLoaded = true;
        loadSettings();
      }
      if (activeTab === 'console') {
        const log = byId('consoleLog');
        if (log) log.scrollTop = log.scrollHeight;
      }
    });
  });

  // === Quick action buttons ===
  document.querySelectorAll('[data-command]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.command;
      if (!cmd) return;
      if (cmd === 'ufo.createTaskSpec') {
        openTaskInterviewModal();
        vscode.postMessage({ type: 'task_interview_start' });
        return;
      }
      vscode.postMessage({ type: 'command', command: cmd });
    });
  });

  // === Task interview modal ===
  const taskModalEl = byId('taskInterviewModal');
  const taskModalBackdropEl = byId('taskModalBackdrop');
  const taskModalCloseEl = byId('taskModalClose');
  const taskModalMessagesEl = byId('taskModalMessages');
  const taskModalInputEl = byId('taskModalInput');
  const taskModalSendMsgBtnEl = byId('taskModalSendMsgBtn');
  const taskModalCreateBtnEl = byId('taskModalCreateBtn');
  const taskModalWorkingEl = byId('taskModalWorking');
  const taskModalSendBtnEl = byId('taskModalSendBtn');
  const step1El = byId('step1');
  const step2El = byId('step2');
  const step3El = byId('step3');

  let createdTask = null;
  let runCompleted = false;

  function openTaskInterviewModal() {
    if (!taskModalEl) return;
    // Prevent any stale UI (e.g. Working...) from a previous session flashing on open.
    resetTaskInterviewModal();
    taskModalEl.hidden = false;
    if (taskModalInputEl) setTimeout(() => taskModalInputEl.focus(), 50);
  }
  function closeTaskInterviewModal() {
    if (!taskModalEl) return;
    taskModalEl.hidden = true;
  }
  function resetTaskInterviewModal() {
    createdTask = null;
    runCompleted = false;
    if (taskModalMessagesEl) taskModalMessagesEl.innerHTML = '';
    if (taskModalCreateBtnEl) taskModalCreateBtnEl.disabled = true;
    if (taskModalWorkingEl) taskModalWorkingEl.hidden = true;
    if (taskModalInputEl) { taskModalInputEl.value = ''; taskModalInputEl.disabled = false; }
    if (taskModalSendMsgBtnEl) taskModalSendMsgBtnEl.disabled = false;
    if (taskModalSendBtnEl) { taskModalSendBtnEl.hidden = true; taskModalSendBtnEl.disabled = true; taskModalSendBtnEl.textContent = '發送 👾'; }
    if (step1El) step1El.classList.remove('done');
    if (step2El) step2El.classList.remove('done');
    if (step3El) step3El.classList.remove('done');
  }
  function appendTaskMsg(role, text) {
    if (!taskModalMessagesEl) return;
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg ' + (role === 'user' ? 'user' : 'assistant');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = String(text || '');
    wrap.appendChild(bubble);
    taskModalMessagesEl.appendChild(wrap);
    taskModalMessagesEl.scrollTop = taskModalMessagesEl.scrollHeight;
  }
  function sendTaskInterviewUserText() {
    if (!taskModalInputEl) return;
    const text = (taskModalInputEl.value || '').trim();
    if (!text) return;
    taskModalInputEl.value = '';
    try { taskModalInputEl.focus(); } catch {}
    vscode.postMessage({ type: 'task_interview_user', text });
  }

  if (taskModalBackdropEl) taskModalBackdropEl.addEventListener('click', closeTaskInterviewModal);
  if (taskModalCloseEl) taskModalCloseEl.addEventListener('click', closeTaskInterviewModal);
  if (taskModalSendMsgBtnEl) taskModalSendMsgBtnEl.addEventListener('click', sendTaskInterviewUserText);
  if (taskModalInputEl) taskModalInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendTaskInterviewUserText();
    }
  });
  if (taskModalCreateBtnEl) taskModalCreateBtnEl.addEventListener('click', () => {
    vscode.postMessage({ type: 'task_interview_create' });
  });
  if (taskModalSendBtnEl) taskModalSendBtnEl.addEventListener('click', () => {
    if (!createdTask) return;
    vscode.postMessage({ type: 'task_send_to_bm', taskId: createdTask.taskId, taskDir: createdTask.taskDir, title: createdTask.title });
  });
  // Note: sending to BlueMonster is now done from the Tasks tab per task card.

  // === Console log ===
  const MAX_LOG_ENTRIES = 500;
  function appendLog(tag, message, tagClass, ts) {
    const log = byId('consoleLog');
    if (!log) return;
    const empty = byId('consoleEmpty');
    if (empty) empty.remove();
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const now = typeof ts === 'number' && isFinite(ts) ? new Date(ts) : new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.innerHTML = '<span class="log-time">' + time + '</span>' +
      '<span class="log-tag ' + (tagClass || 'info') + '">[' + tag + ']</span>' +
      '<span class="log-msg">' + escapeHtml(message) + '</span>';
    log.appendChild(entry);
    while (log.children.length > MAX_LOG_ENTRIES) {
      log.removeChild(log.firstChild);
    }
    log.scrollTop = log.scrollHeight;
  }
  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
  const clearBtn = byId('consoleClearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const log = byId('consoleLog');
      if (log) log.innerHTML = '<div class="console-empty" id="consoleEmpty">Waiting for UFO activity...</div>';
      // Also clear persisted history in the extension host.
      vscode.postMessage({ type: 'console_clear' });
    });
  }

  // === State updates from extension host ===
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg && msg.type === 'log') {
      appendLog(msg.tag || 'info', msg.message || '', msg.tagClass || 'info', msg.ts);
      return;
    }
    if (msg && msg.type === 'log_history') {
      const items = Array.isArray(msg.entries) ? msg.entries : [];
      items.forEach(e => appendLog(e.tag || 'info', e.message || '', e.tagClass || 'info', e.ts));
      return;
    }
    if (msg && msg.type === 'task_interview_reset') {
      resetTaskInterviewModal();
      return;
    }
    if (msg && msg.type === 'task_interview_message') {
      appendTaskMsg(msg.role || 'assistant', msg.content || '');
      // Extra safety: always clear the input after a user send (some IME flows can keep text).
      if ((msg.role || '') === 'user' && taskModalInputEl) {
        taskModalInputEl.value = '';
      }
      return;
    }
    if (msg && msg.type === 'task_interview_state') {
      const canCreate = Boolean(msg.canCreate);
      createdTask = msg.createdTask || null;
      if (taskModalCreateBtnEl) taskModalCreateBtnEl.disabled = !canCreate;
      if (step1El) step1El.classList.toggle('done', canCreate);
      if (step2El) step2El.classList.toggle('done', Boolean(createdTask));
      if (step3El) step3El.classList.toggle('done', Boolean(runCompleted));

      if (taskModalSendBtnEl) {
        // After task is created, primary action becomes "Send 👾".
        const canSend = Boolean(createdTask) && !runCompleted;
        taskModalSendBtnEl.hidden = !createdTask;
        taskModalSendBtnEl.disabled = !canSend;
      }
      if (taskModalCreateBtnEl) {
        // Hide create button once created.
        taskModalCreateBtnEl.hidden = Boolean(createdTask);
      }
      return;
    }
    if (msg && msg.type === 'task_interview_busy') {
      const busy = Boolean(msg.busy);
      if (taskModalCreateBtnEl) {
        taskModalCreateBtnEl.disabled = busy || taskModalCreateBtnEl.disabled;
        taskModalCreateBtnEl.textContent = busy ? '建立中...' : '建立任務';
      }
      if (taskModalWorkingEl) taskModalWorkingEl.hidden = !busy;
      if (taskModalInputEl) taskModalInputEl.disabled = busy;
      if (taskModalSendMsgBtnEl) taskModalSendMsgBtnEl.disabled = busy;
      return;
    }
    if (msg && msg.type === 'task_run_busy') {
      const busy = Boolean(msg.busy);
      if (taskModalSendBtnEl) {
        taskModalSendBtnEl.disabled = busy || !createdTask;
        taskModalSendBtnEl.textContent = busy ? '發送中...' : '發送 👾';
      }
      return;
    }
    if (msg && msg.type === 'task_interview_run_done') {
      const ok = Boolean(msg.ok);
      runCompleted = ok;
      if (step3El) step3El.classList.toggle('done', ok);
      if (taskModalSendBtnEl) {
        taskModalSendBtnEl.disabled = true;
        taskModalSendBtnEl.textContent = ok ? '已發送 ✓' : '發送 👾';
      }
      return;
    }
    if (!msg || msg.type !== 'state') return;
    const s = msg.state;

    setText('statPending', String(s.tasks.pending));
    setText('statRunning', String(s.tasks.inProgress));
    setText('statDone', String(s.tasks.done));
    setText('statTotal', String(s.tasks.total));
    setText('gatewayUrlText', s.gatewayUrl);
    setText('publicUrlText', s.publicUrl || '\u2014');

    const gBadge = byId('gatewayBadge');
    if (gBadge) {
      gBadge.textContent = s.connectionState === 'connected' ? 'OK' : s.connectionState === 'reconnecting' ? 'WAIT' : 'DOWN';
      gBadge.className = 'badge ' + (s.connectionState === 'connected' ? 'badge-green' : 'badge-red');
    }
    const pBadge = byId('publicUrlBadge');
    if (pBadge) {
      pBadge.textContent = s.publicUrl ? 'SET' : 'NONE';
      pBadge.className = 'badge ' + (s.publicUrl ? 'badge-green' : 'badge-gray');
    }

    setText('countPending', String(s.tasks.pending));
    setText('countApproved', String(s.tasks.approved));
    setText('countProgress', String(s.tasks.inProgress));
    setText('countDone', String(s.tasks.done));
    setText('countTotal', String(s.tasks.total));
    setText('tasksRoot', s.tasksRoot);
    renderTaskSections(Array.isArray(s.taskItems) ? s.taskItems : []);
    setText('bmCount', String((s.blueMonsterTasks && s.blueMonsterTasks.count) || 0));
    const recent = (s.blueMonsterTasks && Array.isArray(s.blueMonsterTasks.recent)) ? s.blueMonsterTasks.recent : [];
    const recentText = recent.length > 0
      ? recent.map(r => `- ${String(r.taskId)}${r.updatedAt ? ` (${timeAgo(r.updatedAt)})` : ''}`).join('\n')
      : 'No BlueMonster tasks found.';
    setText('bmRecent', recentText);

    const setBadge = (id, ok) => {
      const el = byId(id);
      if (!el) return;
      el.textContent = ok ? 'READY' : 'NONE';
      el.className = 'badge ' + (ok ? 'badge-green' : 'badge-gray');
    };
    setBadge('channelLine', s.channels.line);
    setBadge('channelTelegram', s.channels.telegram);
    setBadge('channelDiscord', s.channels.discord);
    const syncBadge = byId('envSyncBadge');
    if (syncBadge) {
      syncBadge.textContent = s.envAutoSync ? 'ON' : 'OFF';
      syncBadge.className = 'badge ' + (s.envAutoSync ? 'badge-green' : 'badge-gray');
    }
    setText('modelSummary', s.models.chat);

    const pill = byId('gatewayStatus');
    if (pill) {
      pill.textContent = s.connectionState === 'connected' ? 'Online' : s.connectionState === 'reconnecting' ? 'Syncing...' : 'Offline';
      pill.className = 'status-pill ' + s.connectionState;
    }

    setText('lastUpdated', s.lastUpdated);
  });

  // === Tasks tab: sections + cards ===
  const taskSectionsEl = byId('taskSections');
  const statusOrder = [
    { id: 'pending', label: 'Pending', light: 'pending' },
    { id: 'approved', label: 'Approved', light: 'approved' },
    { id: 'in-progress', label: 'Running', light: 'running' },
    { id: 'done', label: 'Done', light: 'done' },
  ];

  function timeAgo(ts) {
    const n = Number(ts);
    if (!isFinite(n) || n <= 0) return '';
    const diff = Date.now() - n;
    if (diff < 15 * 1000) return 'just now';
    if (diff < 60 * 1000) return Math.floor(diff / 1000) + 's ago';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / (60 * 1000)) + 'm ago';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / (60 * 60 * 1000)) + 'h ago';
    return Math.floor(diff / (24 * 60 * 60 * 1000)) + 'd ago';
  }

  function fmtTime(ts) {
    const n = Number(ts);
    if (!isFinite(n) || n <= 0) return '';
    try {
      return new Date(n).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function renderTaskSections(items) {
    if (!taskSectionsEl) return;
    const byStatus = new Map();
    statusOrder.forEach(s => byStatus.set(s.id, []));
    items.forEach(it => {
      const st = (it && it.status) || '';
      if (!byStatus.has(st)) return;
      byStatus.get(st).push(it);
    });
    statusOrder.forEach(s => {
      const arr = byStatus.get(s.id);
      arr.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    });

    // Preserve open/close state by reading existing dataset.
    const openState = {};
    taskSectionsEl.querySelectorAll('.task-section').forEach(el => {
      const sid = el.getAttribute('data-status');
      if (sid) openState[sid] = el.getAttribute('data-open') === 'true';
    });

    taskSectionsEl.innerHTML = '';

    statusOrder.forEach(s => {
      const section = document.createElement('div');
      section.className = 'task-section';
      section.setAttribute('data-status', s.id);
      const hasAny = (byStatus.get(s.id) || []).length > 0;
      section.setAttribute('data-open', String(Boolean(openState[s.id] ?? (s.id === 'pending' && hasAny))));

      const header = document.createElement('div');
      header.className = 'task-section-header';
      header.innerHTML =
        '<div class="task-section-title">' +
          '<span class="status-dot" style="background:' +
            (s.id === 'pending' ? 'var(--gray)' : s.id === 'approved' ? 'var(--monster)' : s.id === 'in-progress' ? 'var(--cyan)' : 'var(--green)') +
          '"></span>' +
          '<span>' + s.label + '</span>' +
        '</div>' +
        '<div style="display:flex; gap:10px; align-items:center">' +
          '<span class="count-badge">' + String((byStatus.get(s.id) || []).length) + '</span>' +
          '<span class="chev" aria-hidden="true"></span>' +
        '</div>';
      header.addEventListener('click', () => {
        const open = section.getAttribute('data-open') === 'true';
        section.setAttribute('data-open', String(!open));
      });

      const cards = document.createElement('div');
      cards.className = 'task-cards';

      const arr = byStatus.get(s.id) || [];
      if (arr.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'No tasks';
        cards.appendChild(empty);
      } else {
        arr.forEach(it => cards.appendChild(renderTaskCard(it, s)));
      }

      section.appendChild(header);
      section.appendChild(cards);
      taskSectionsEl.appendChild(section);
    });
  }

  function renderTaskCard(it, statusInfo) {
    const taskId = String((it && it.taskId) || '');
    const title = String((it && it.title) || taskId);
    const taskDir = String((it && it.taskDir) || '');
    const agentName = String((it && it.agentName) || '');
    const agentEmoji = String((it && it.agentEmoji) || '');
    const createdAt = Number((it && it.createdAt) || 0);
    const updatedAt = Number((it && it.updatedAt) || 0);

    const card = document.createElement('div');
    card.className = 'task-card';
    card.setAttribute('data-open', 'false');
    card.addEventListener('click', () => {
      const open = card.getAttribute('data-open') === 'true';
      card.setAttribute('data-open', String(!open));
    });

    const light = document.createElement('div');
    light.className = 'task-status-light ' + (statusInfo.light || 'pending');
    card.appendChild(light);

    const t = document.createElement('div');
    t.className = 'task-card-title';
    t.textContent = title;
    card.appendChild(t);

    const sub = document.createElement('div');
    sub.className = 'task-card-sub';
    const timePart = (createdAt ? ('建立 ' + fmtTime(createdAt)) : '') + (updatedAt ? ('  |  更新 ' + timeAgo(updatedAt)) : '');
    const agentPart = (statusInfo.id === 'in-progress' || statusInfo.id === 'done') && agentName
      ? (`  |  ${agentEmoji || '👾'}${agentName}`)
      : '';
    sub.textContent = timePart + agentPart;
    if ((statusInfo.id === 'in-progress' || statusInfo.id === 'done') && agentName) {
      sub.style.cursor = 'pointer';
      sub.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        vscode.postMessage({ type: 'task_open_bm', taskId, taskDir, title });
      });
    }
    card.appendChild(sub);

    const meta = document.createElement('div');
    meta.className = 'task-card-meta';
    meta.textContent = taskId + (taskDir ? (' • ' + taskDir) : '');
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'task-card-actions';

    const openFolder = document.createElement('button');
    openFolder.className = 'btn';
    openFolder.textContent = 'Folder';
    openFolder.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      vscode.postMessage({ type: 'task_open_folder', taskDir });
    });
    actions.appendChild(openFolder);

    const openBm = document.createElement('button');
    openBm.className = 'btn';
    openBm.textContent = 'BlueMonster';
    openBm.disabled = !taskDir;
    openBm.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      vscode.postMessage({ type: 'task_open_bm', taskId, taskDir, title });
    });
    actions.appendChild(openBm);

    const splitBtn = document.createElement('button');
    splitBtn.className = 'btn';
    splitBtn.textContent = 'Split';
    splitBtn.disabled = !taskDir || statusInfo.id === 'in-progress' || statusInfo.id === 'done';
    splitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      vscode.postMessage({ type: 'task_split_multi_agent', taskId, taskDir, title });
    });
    actions.appendChild(splitBtn);

    const sendBm = document.createElement('button');
    sendBm.className = 'btn primary';
    sendBm.textContent = 'Send';
    sendBm.disabled = !taskDir || statusInfo.id === 'done' || statusInfo.id === 'in-progress';
    sendBm.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      vscode.postMessage({ type: 'task_send_to_bm', taskId, taskDir, title });
    });
    actions.appendChild(sendBm);

    card.appendChild(actions);
    return card;
  }

  // === Settings tab — Gateway API ===
  let aiSettings = null;
  let availableModels = [];
  let taskTypes = [];
  let saving = false;
  let saveStatus = 'idle';

  let bmPersona = '';
  let ufoPersona = '';

  async function loadSettings() {
    const container = byId('settingsContent');
    container.innerHTML = '<div class="loading">Loading settings...</div>';
    try {
      const [sRes, mRes, bmPRes, ufoPRes] = await Promise.all([
        fetch(GATEWAY_URL + '/api/ai-settings'),
        fetch(GATEWAY_URL + '/api/ai-settings/models'),
        fetch(GATEWAY_URL + '/api/persona/bluemonster').catch(() => null),
        fetch(GATEWAY_URL + '/api/persona/ufo').catch(() => null),
      ]);
      if (!sRes.ok || !mRes.ok) throw new Error('API error');
      aiSettings = await sRes.json();
      const mData = await mRes.json();
      availableModels = mData.models || [];
      taskTypes = mData.taskTypes || [];
      if (bmPRes && bmPRes.ok) {
        const d = await bmPRes.json();
        bmPersona = d.content || '';
      }
      if (ufoPRes && ufoPRes.ok) {
        const d = await ufoPRes.json();
        ufoPersona = d.content || '';
      }
      renderSettings();
    } catch (e) {
      container.innerHTML = '<div class="error-msg">Cannot connect to Gateway.<br>Make sure Gateway is running.</div>';
    }
  }

  function modelOptions(currentValue) {
    const grouped = {};
    availableModels.forEach(m => {
      (grouped[m.provider] = grouped[m.provider] || []).push(m);
    });
    let html = '';
    for (const [provider, models] of Object.entries(grouped)) {
      const opts = models.map(m =>
        '<option value="' + m.id + '"' + (m.id === currentValue ? ' selected' : '') + '>' +
          m.label + (m.multiplier ? ' (' + m.multiplier + ')' : '') +
        '</option>'
      ).join('');
      html += '<optgroup label="' + provider + '">' + opts + '</optgroup>';
    }
    return html;
  }

  function renderSettings() {
    if (!aiSettings) return;
    const bm = aiSettings.blueMonster;
    const ufo = aiSettings.ufo;
    const container = byId('settingsContent');

    const agentModes = [
      { id: 'chat', label: 'Chat' },
      { id: 'agent', label: 'Agent' },
      { id: 'agent-full', label: 'Agent Full' }
    ];
    const agentModeOpts = agentModes.map(m =>
      '<option value="' + m.id + '"' + (m.id === bm.agentMode ? ' selected' : '') + '>' + m.label + '</option>'
    ).join('');

    const efforts = [
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'extra-high', label: 'Extra High' }
    ];
    const effortOpts = efforts.map(e =>
      '<option value="' + e.id + '"' + (e.id === bm.reasoningEffort ? ' selected' : '') + '>' + e.label + '</option>'
    ).join('');

    let taskModelRows = '';
    taskTypes.forEach(tt => {
      taskModelRows +=
        '<div class="task-model-row">' +
          '<div class="task-model-info">' +
            '<div class="task-model-name">' + tt.label + '</div>' +
            '<div class="task-model-desc">' + tt.desc + '</div>' +
          '</div>' +
          '<select class="select" id="set-tm-' + tt.id + '">' + modelOptions(bm.taskModels[tt.id] || bm.defaultModel) + '</select>' +
        '</div>';
    });

    container.innerHTML =
      '<div class="sub-tab-bar">' +
        '<button class="sub-tab active" data-sub="bm">\uD83E\uDD16 BlueMonster</button>' +
        '<button class="sub-tab" data-sub="ufo">\uD83D\uDC7E UFO</button>' +
      '</div>' +

      '<div class="sub-panel active" id="sub-bm">' +
        '<div class="card">' +
          '<div class="card-header">Agent Configuration</div>' +
          '<div class="field">' +
            '<label class="field-label">Agent Mode</label>' +
            '<div class="field-desc">Controls how BlueMonster processes tasks</div>' +
            '<select class="select" id="set-agentMode">' + agentModeOpts + '</select>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">Default Model</label>' +
            '<div class="field-desc">Fallback model for all task types</div>' +
            '<select class="select" id="set-defaultModel">' + modelOptions(bm.defaultModel) + '</select>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">Reasoning Effort</label>' +
            '<div class="field-desc">Thinking depth for complex tasks</div>' +
            '<select class="select" id="set-reasoningEffort">' + effortOpts + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header">Task-Specific Models</div>' +
          taskModelRows +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header">Persona (me.md)</div>' +
          '<div class="field-desc" style="margin-bottom: 8px">Defines BlueMonster\'s personality and behavior style</div>' +
          '<textarea class="textarea" id="set-bmPersona" placeholder="# BlueMonster persona..." style="min-height: 120px">' +
            (bmPersona || '') +
          '</textarea>' +
        '</div>' +
      '</div>' +

      '<div class="sub-panel" id="sub-ufo">' +
        '<div class="card">' +
          '<div class="card-header">Model Configuration</div>' +
          '<div class="field">' +
            '<label class="field-label">Chat Model</label>' +
            '<div class="field-desc">General conversation and quick responses</div>' +
            '<select class="select" id="set-chatModel">' + modelOptions(ufo.chatModel) + '</select>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">Spec Model</label>' +
            '<div class="field-desc">Task analysis and spec generation</div>' +
            '<select class="select" id="set-specModel">' + modelOptions(ufo.specModel) + '</select>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">Opus Model</label>' +
            '<div class="field-desc">Deep refinement and complex reasoning</div>' +
            '<select class="select" id="set-opusModel">' + modelOptions(ufo.opusModel) + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header">Persona (me.md)</div>' +
          '<div class="field-desc" style="margin-bottom: 8px">Defines UFO\'s personality, tone, and response style</div>' +
          '<textarea class="textarea" id="set-ufoPersona" placeholder="# UFO persona..." style="min-height: 120px">' +
            (ufoPersona || '') +
          '</textarea>' +
        '</div>' +
      '</div>' +

      '<button class="btn-primary" id="saveBtn">Save Changes</button>' +
      '<span class="save-status" id="saveStatus"></span>';

    container.querySelectorAll('.sub-tab').forEach(st => {
      st.addEventListener('click', () => {
        container.querySelectorAll('.sub-tab').forEach(t => t.classList.toggle('active', t === st));
        container.querySelectorAll('.sub-panel').forEach(p =>
          p.classList.toggle('active', p.id === 'sub-' + st.dataset.sub)
        );
      });
    });

    byId('saveBtn').addEventListener('click', saveSettings);
  }

  async function saveSettings() {
    if (saving) return;
    saving = true;
    const btn = byId('saveBtn');
    const statusEl = byId('saveStatus');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    statusEl.textContent = '';
    statusEl.className = 'save-status';

    const tmUpdates = {};
    taskTypes.forEach(tt => {
      const el = byId('set-tm-' + tt.id);
      if (el) tmUpdates[tt.id] = el.value;
    });
    const bmUpdates = {
      agentMode: byId('set-agentMode').value,
      defaultModel: byId('set-defaultModel').value,
      reasoningEffort: byId('set-reasoningEffort').value,
      taskModels: tmUpdates,
    };

    const ufoUpdates = {
      chatModel: byId('set-chatModel').value,
      specModel: byId('set-specModel').value,
      opusModel: byId('set-opusModel').value,
    };

    const bmPersonaVal = byId('set-bmPersona').value;
    const ufoPersonaVal = byId('set-ufoPersona').value;

    try {
      const results = await Promise.all([
        fetch(GATEWAY_URL + '/api/ai-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blueMonster: bmUpdates, ufo: ufoUpdates }),
        }),
        fetch(GATEWAY_URL + '/api/persona/bluemonster', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: bmPersonaVal }),
        }),
        fetch(GATEWAY_URL + '/api/persona/ufo', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: ufoPersonaVal }),
        }),
      ]);
      const data = await results[0].json();
      if (data.success) {
        aiSettings = data.settings;
        bmPersona = bmPersonaVal;
        ufoPersona = ufoPersonaVal;
        statusEl.textContent = 'Saved';
        statusEl.className = 'save-status saved';
        vscode.postMessage({ type: 'settings_synced', ufoSettings: ufoUpdates });
        setTimeout(() => { statusEl.textContent = ''; }, 2000);
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      statusEl.textContent = 'Error';
      statusEl.className = 'save-status error';
    }
    saving = false;
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
})();
