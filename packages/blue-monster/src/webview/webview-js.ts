// Webview JavaScript - 自動生成，請勿手動編輯此檔案
// 原始檔案：src/webview/main.js
// 使用 __ASSISTANT_AVATAR_URL__ 作為佔位符，在運行時替換

export const WEBVIEW_JS = `(function() {
  const vscode = acquireVsCodeApi();
  const assistantAvatarUrl = '__ASSISTANT_AVATAR_URL__';
  const messagesEl = document.getElementById('messages');
  const emptyStateEl = document.getElementById('emptyState');
  const messagesWrapEl = document.querySelector('.messages-wrap');
  const inputAreaEl = document.querySelector('.input-area');
  const inputEl = document.getElementById('input');
  const sendEl = document.getElementById('send');
  const stopEl = document.getElementById('stop');
  const headerHistoryEl = document.getElementById('headerHistory');
  const headerSettingsEl = document.getElementById('headerSettings');
  const headerNewChatEl = document.getElementById('headerNewChat');
  const headerBackEl = document.getElementById('headerBack');
  const headerTitleTextEl = document.getElementById('headerTitleText');
  const headerEmojiEl = document.getElementById('headerEmoji');
  const historyPanelEl = document.getElementById('historyPanel');
  const historyListEl = document.getElementById('historyList');
  const historySearchEl = document.getElementById('historySearch');
  const closeHistoryEl = document.getElementById('closeHistory');
  const closeHistoryPanelEl = document.getElementById('closeHistoryPanel');
  const addImageEl = document.getElementById('addImage');
  const modelLabelEl = document.getElementById('modelLabel');
  const modeSelectTriggerEl = document.getElementById('modeSelectTrigger');
  const modeSelectOptionsEl = document.getElementById('modeSelectOptions');
  const modelSelectTriggerEl = document.getElementById('modelSelectTrigger');
  const modelSelectOptionsEl = document.getElementById('modelSelectOptions');
  const imageInputEl = document.getElementById('imageInput');
  const attachmentAreaEl = document.getElementById('attachmentArea');
  const thinkingPanelEl = document.getElementById('thinkingPanel');
  const thinkingBodyEl = document.getElementById('thinkingBody');
  const thinkingLabelEl = document.getElementById('thinkingLabel');
  const confirmPanelEl = document.getElementById('confirmPanel');
  const confirmCommandEl = document.getElementById('confirmCommand');
  const confirmCwdEl = document.getElementById('confirmCwd');
  const confirmInputEl = document.getElementById('confirmInput');
  const confirmSubmitEl = document.getElementById('confirmSubmit');
  const confirmOptionsEl = document.querySelectorAll('.confirm-option');
  const choicePanelEl = document.getElementById('choicePanel');
  const choiceTitleEl = document.getElementById('choiceTitle');
  const choiceDescriptionEl = document.getElementById('choiceDescription');
  const choiceOptionsEl = document.getElementById('choiceOptions');
  const choiceInputEl = document.getElementById('choiceInput');
  const choiceSubmitEl = document.getElementById('choiceSubmit');
  const modelPanelEl = document.getElementById('modelPanel');
  const modelSelectEl = document.getElementById('modelSelect');
  const modelInputEl = document.getElementById('modelInput');
  const modelApplyEl = document.getElementById('modelApply');
  const modelCancelEl = document.getElementById('modelCancel');
  const modelHintEl = document.getElementById('modelHint');

  let pendingConfirmId = '';
  let pendingModelBackend = '';
  let pendingChoiceId = '';
  let pendingChoiceCount = 0;
  let pendingImages = [];
  let pendingFiles = [];
  let isBusy = false;
  let hasContent = false;
  let pendingConfirmCategory = '';
  let currentHistoryTitle = '';
  let isViewingHistory = false;
  let currentModeValue = 'agent';
  let currentModelValue = '';
  const modeLabels = { 'chat': '計畫', 'agent': '代理-安全', 'agent-full': '代理-危險' };
  const messageRawTexts = new Map();

  function escapeHtml(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function el(tag, cls, props) { const e = document.createElement(tag); if (cls) e.className = cls; if (typeof props === 'string') e.textContent = props; else if (props) Object.assign(e, props); return e; }
  function showToast(msg) { const t = el('div', 'toast', msg); document.body.appendChild(t); setTimeout(() => t.remove(), 2000); }
  function updateEmptyState() { if (emptyStateEl) emptyStateEl.hidden = hasContent || messagesEl.children.length > 0; }
  function markHasContent() { hasContent = true; updateEmptyState(); }
  function updateLayoutPadding() { if (inputAreaEl && messagesEl) messagesEl.style.paddingBottom = (inputAreaEl.offsetHeight + 12) + 'px'; }
  function truncateText(t, m) { return !t ? '' : t.length > m ? t.slice(0, m) + '...' : t; }
  function closeAllSelects() { document.querySelectorAll('.custom-select-trigger').forEach(t => t.classList.remove('open')); document.querySelectorAll('.custom-select-options').forEach(o => o.classList.remove('show')); }
  function copyToClipboard(t) { navigator.clipboard.writeText(t).then(() => showToast('✓ Copied')).catch(() => showToast('Failed')); }
  function setModelLabel(l) { if (modelLabelEl) modelLabelEl.textContent = l || 'Model:'; }
  function setThinkingVisible(v) { if (!thinkingPanelEl) return; thinkingPanelEl.hidden = !v; if (!v && thinkingBodyEl) thinkingBodyEl.textContent = ''; }
  function resetThinking(t) { if (thinkingBodyEl) thinkingBodyEl.textContent = t || ''; if (thinkingLabelEl) thinkingLabelEl.textContent = 'Thinking...'; }
  function appendThinking(t) { if (!thinkingBodyEl || !t) return; if (thinkingBodyEl.textContent) thinkingBodyEl.textContent += '\\n'; thinkingBodyEl.textContent += t; }

  function initCustomSelect(triggerEl, optionsEl, onSelect, maxLen) {
    if (!triggerEl || !optionsEl) return;
    triggerEl.addEventListener('click', function(e) { e.stopPropagation(); const isOpen = optionsEl.classList.contains('show'); closeAllSelects(); if (!isOpen) { triggerEl.classList.add('open'); optionsEl.classList.add('show'); } });
    optionsEl.addEventListener('click', function(e) { const opt = e.target.closest('.custom-select-option'); if (!opt) return; const val = opt.dataset.value; optionsEl.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected')); opt.classList.add('selected'); const txt = opt.textContent.replace('✓', '').trim(); triggerEl.textContent = maxLen ? truncateText(txt, maxLen) : txt; closeAllSelects(); if (onSelect) onSelect(val); });
  }
  initCustomSelect(modeSelectTriggerEl, modeSelectOptionsEl, v => { currentModeValue = v; });
  initCustomSelect(modelSelectTriggerEl, modelSelectOptionsEl, v => { currentModelValue = v; vscode.postMessage({ type: 'applyModel', value: v }); }, 12);
  document.addEventListener('click', closeAllSelects);
  if (modeSelectTriggerEl) { modeSelectTriggerEl.textContent = modeLabels[currentModeValue] || '代理-安全'; const def = modeSelectOptionsEl?.querySelector('[data-value="agent"]'); if (def) { modeSelectOptionsEl.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected')); def.classList.add('selected'); } }

  function showConfirm(p) { if (!confirmPanelEl) return; pendingConfirmId = p.id || ''; pendingConfirmCategory = p.category || ''; const ct = document.getElementById('confirmTitle'), cdt = document.getElementById('confirmDangerType'), ctn = document.getElementById('confirmTaskName'); if (ct) ct.textContent = p.dangerType ? '⚠️ 敏感命令確認' : '⚠️ 執行命令確認'; if (cdt) { cdt.textContent = p.dangerType || ''; cdt.style.display = p.dangerType ? 'inline' : 'none'; } if (ctn) { const taskDesc = p.command ? p.command.replace(/^VS Code 指令: /, '') : '執行此操作'; ctn.textContent = taskDesc; } if (confirmCommandEl) confirmCommandEl.textContent = p.command || ''; if (confirmCwdEl) { if (p.cwd) { confirmCwdEl.textContent = '📁 ' + p.cwd; confirmCwdEl.style.display = 'block'; } else confirmCwdEl.style.display = 'none'; } if (confirmInputEl) { confirmInputEl.value = ''; confirmInputEl.placeholder = '輸入數字 (1-4) 或直接輸入想法...'; } if (messagesEl) messagesEl.appendChild(confirmPanelEl); confirmPanelEl.hidden = false; setTimeout(() => { confirmPanelEl.scrollIntoView({ behavior: 'smooth', block: 'end' }); if (confirmInputEl) confirmInputEl.focus(); }, 100); }
  function clearConfirm() { pendingConfirmId = ''; pendingConfirmCategory = ''; if (confirmPanelEl) confirmPanelEl.hidden = true; if (confirmCommandEl) confirmCommandEl.textContent = ''; if (confirmCwdEl) confirmCwdEl.textContent = ''; if (confirmInputEl) confirmInputEl.value = ''; }
  function sendConfirmResponse(a, t) { if (!pendingConfirmId) return; vscode.postMessage({ type: 'confirmResponse', id: pendingConfirmId, action: a, category: pendingConfirmCategory, customText: t || '' }); clearConfirm(); }
  function handleConfirmInput() { if (!confirmInputEl) return; const v = confirmInputEl.value.trim(); if (!v) return; if (v === '1') sendConfirmResponse('run'); else if (v === '2') sendConfirmResponse('sessionAllow'); else if (v === '3') sendConfirmResponse('cancel'); else if (v === '4') { confirmInputEl.value = ''; confirmInputEl.placeholder = '請輸入您的想法...'; } else sendConfirmResponse('custom', v); }

  function showChoicePanel(p) { if (!choicePanelEl || !choiceOptionsEl) return; pendingChoiceId = p.id || ''; const opts = p.options || []; pendingChoiceCount = opts.length; if (choiceTitleEl) choiceTitleEl.textContent = p.title || '🤔 請選擇方案'; if (choiceDescriptionEl) { choiceDescriptionEl.textContent = p.description || ''; choiceDescriptionEl.hidden = !p.description; } choiceOptionsEl.innerHTML = opts.map((o, i) => '<div class="choice-option" data-value="' + (i+1) + '" style="padding:10px 12px;margin:4px 0;background:#2d2d2d;border-radius:4px;cursor:pointer;"><div style="display:flex;align-items:center;"><span style="color:#4fc3f7;margin-right:8px;font-weight:bold;">' + (i+1) + '.</span><span style="font-weight:500;">' + escapeHtml(o.label) + (o.recommended ? ' ⭐ 建議' : '') + '</span></div>' + (o.description ? '<div style="margin-left:24px;margin-top:4px;font-size:12px;opacity:0.7;">' + escapeHtml(o.description) + '</div>' : '') + '</div>').join('') + '<div class="choice-option" data-value="other" style="padding:10px 12px;margin:4px 0;background:#2d2d2d;border-radius:4px;cursor:pointer;"><div style="display:flex;align-items:center;"><span style="color:#4fc3f7;margin-right:8px;font-weight:bold;">' + (opts.length+1) + '.</span><span>其他（輸入想法）</span></div></div>'; choiceOptionsEl.querySelectorAll('.choice-option').forEach(el => { el.addEventListener('click', () => { const v = el.dataset.value; if (v === 'other') { if (choiceInputEl) { choiceInputEl.focus(); choiceInputEl.placeholder = '請輸入您的想法...'; } } else sendChoiceResponse(parseInt(v, 10)); }); el.addEventListener('mouseenter', () => { el.style.background = '#3c3c3c'; }); el.addEventListener('mouseleave', () => { el.style.background = '#2d2d2d'; }); }); if (choiceInputEl) { choiceInputEl.value = ''; choiceInputEl.placeholder = '輸入數字選擇，或直接輸入您的想法...'; } if (messagesEl) messagesEl.appendChild(choicePanelEl); choicePanelEl.hidden = false; setTimeout(() => { if (choiceInputEl) choiceInputEl.focus(); }, 100); }
  function clearChoicePanel() { pendingChoiceId = ''; pendingChoiceCount = 0; if (choicePanelEl) choicePanelEl.hidden = true; if (choiceOptionsEl) choiceOptionsEl.innerHTML = ''; if (choiceInputEl) choiceInputEl.value = ''; }
  function sendChoiceResponse(i, t) { if (!pendingChoiceId) return; vscode.postMessage({ type: 'choiceResponse', id: pendingChoiceId, selectedIndex: i, customText: t || '' }); clearChoicePanel(); }
  function handleChoiceInput() { if (!choiceInputEl) return; const v = choiceInputEl.value.trim(); if (!v) return; const n = parseInt(v, 10); if (!isNaN(n) && n >= 1 && n <= pendingChoiceCount) sendChoiceResponse(n); else if (n === pendingChoiceCount + 1) { choiceInputEl.value = ''; choiceInputEl.placeholder = '請輸入您的想法...'; } else sendChoiceResponse(0, v); }

  function showModelPanel(p) { if (!modelSelectOptionsEl || !modelSelectTriggerEl) return; pendingModelBackend = p.backend || ''; modelSelectOptionsEl.innerHTML = ''; function createOpt(v, l, s, m, isNewGroup) { const wrapper = document.createDocumentFragment(); if (isNewGroup && modelSelectOptionsEl.children.length > 0) { const divider = el('div', 'custom-select-divider'); wrapper.appendChild(divider); } const o = el('div', 'custom-select-option' + (s ? ' selected' : '')); o.dataset.value = v; o.innerHTML = '<span class="check-mark">✓</span>' + escapeHtml(l) + (m ? '<span class="multiplier-badge' + (m === '0x' ? ' free' : '') + '">' + escapeHtml(m) + '</span>' : ''); wrapper.appendChild(o); return wrapper; } if (pendingModelBackend === 'cli') { const l = p.current || 'CLI model'; modelSelectTriggerEl.textContent = truncateText(l, 12); modelSelectOptionsEl.appendChild(createOpt(p.current || '', l, true, '', false)); currentModelValue = p.current || ''; return; } if (Array.isArray(p.options) && p.options.length > 0) { p.options.forEach((o, i) => { const v = o.id || o.label || '', l = o.label || o.id || '', m = o.multiplier || '', isNewGroup = o.isNewGroup || false, sel = p.current ? (v === p.current) : (i === 0); modelSelectOptionsEl.appendChild(createOpt(v, l, sel, m, isNewGroup)); if (sel) { modelSelectTriggerEl.textContent = truncateText(l, 12); currentModelValue = v; } }); } else { modelSelectTriggerEl.textContent = 'No models'; modelSelectOptionsEl.appendChild(createOpt('', 'No models', true, '', false)); } }
  function clearModelPanel() { pendingModelBackend = ''; }
  function applyModel() { if (!currentModelValue) return; vscode.postMessage({ type: 'applyModel', value: currentModelValue }); clearModelPanel(); }
  function updateModeSelector(mode) { if (!modeSelectTriggerEl || !modeSelectOptionsEl) return; currentModeValue = mode; modeSelectTriggerEl.textContent = modeLabels[mode] || mode; modeSelectOptionsEl.querySelectorAll('.custom-select-option').forEach(o => { o.classList.toggle('selected', o.dataset.value === mode); }); }

  function formatCodeBlocks(t) { let r = escapeHtml(t); r = r.replace(/\\\`\\\`\\\`(\\w*)\\n([\\s\\S]*?)\\\`\\\`\\\`/g, (m, lang, code) => { const id = 'code-' + Math.random().toString(36).slice(2, 8); return '<div class="code-block" data-code-id="' + id + '"><div class="code-block-header"><span class="code-block-lang">' + (lang || 'text') + '</span></div><pre><code data-code="' + id + '">' + code + '</code></pre></div>'; }); r = r.replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>'); return r; }
  window.copyCode = id => { const c = document.querySelector('[data-code="' + id + '"]'); if (c) copyToClipboard(c.textContent); };
  window.insertCode = id => { const c = document.querySelector('[data-code="' + id + '"]'); if (c) { vscode.postMessage({ type: 'insertCode', code: c.textContent }); showToast('Inserted'); } };
  window.runInTerminal = id => { const c = document.querySelector('[data-code="' + id + '"]'); if (c) { vscode.postMessage({ type: 'runInTerminal', command: c.textContent.trim() }); showToast('Running'); } };
  window.openFile = p => { vscode.postMessage({ type: 'openFile', path: p }); };
  window.copyMessage = id => { if (messageRawTexts.has(id)) { copyToClipboard(messageRawTexts.get(id)); return; } const m = document.querySelector('[data-msg-id="' + id + '"]'); if (m) { let t = ''; const w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT, null, false); let n; while (n = w.nextNode()) t += n.textContent; m.querySelectorAll('.code-block pre code').forEach(c => { t += '\\n' + c.textContent + '\\n'; }); copyToClipboard(t.trim() || m.textContent); } };

  function appendMessage(m) { if (m.role === 'user' && (m.kind === 'image' || m.kind === 'file')) { appendUserAttachment(m); return; } const item = el('div', 'message ' + m.role); const kind = m.kind || 'text'; const msgId = 'msg-' + (m.id || Math.random().toString(36).slice(2, 8)); const hdr = el('div', 'message-header'); const av = el('div', 'message-avatar'); if (m.role === 'assistant') { const img = el('img', '', { src: assistantAvatarUrl, alt: 'BlueMonster' }); av.appendChild(img); } hdr.appendChild(av); hdr.appendChild(el('span', 'message-role', m.role === 'user' ? 'You' : m.role === 'assistant' ? 'BlueMonster' : 'System')); if (m.ts) hdr.appendChild(el('span', 'message-time', new Date(m.ts).toLocaleTimeString())); item.appendChild(hdr);
    if (kind === 'image' && m.dataUrl) { const att = el('div', 'message-attachment'); const img = el('img', 'message-image', { src: m.dataUrl, alt: 'Image' }); const tw = el('div', 'attachment-text'); tw.appendChild(el('div', 'attachment-name', m.name || 'Image')); if (m.mimeType) tw.appendChild(el('div', 'attachment-meta', m.mimeType)); att.appendChild(img); att.appendChild(tw); att.title = 'Click to view'; att.onclick = () => { vscode.postMessage({ type: 'viewImage', dataUrl: m.dataUrl }); }; item.appendChild(att); }
    else if (kind === 'thought') { const d = el('details', 'thought'); const s = document.createElement('summary'); s.innerHTML = '💭 <strong>Thinking Process</strong>'; const b = el('div', 'thought-body'); b.innerHTML = escapeHtml(m.text).replace(/\\n/g, '<br>'); d.appendChild(s); d.appendChild(b); item.appendChild(d); }
    else { const c = el('div', 'message-content'); c.setAttribute('data-msg-id', msgId); if (m.text) messageRawTexts.set(msgId, m.text); c.innerHTML = formatCodeBlocks(m.text || '').replace(/\\n/g, '<br>');
      if (m.role === 'assistant' && m.activity) { const aw = el('div', 'assistant-activity'); if (Array.isArray(m.activity.steps) && m.activity.steps.length > 0) m.activity.steps.forEach(st => { const cd = el('details', 'activity-card'); const sm = document.createElement('summary'); sm.innerHTML = '<span class="card-icon done">✓</span><span class="card-title">' + escapeHtml(st) + '</span>'; cd.appendChild(sm); aw.appendChild(cd); }); if (Array.isArray(m.activity.files) && m.activity.files.length > 0) m.activity.files.forEach(f => { const cd = el('details', 'activity-card'); const sm = document.createElement('summary'); let al = f.action === 'created' ? '建立' : f.action === 'read' ? '讀取' : '編輯'; let li = (f.lineStart && f.lineEnd) ? '<span class="line-range">，' + f.lineStart + ' 至 ' + f.lineEnd + ' 行</span>' : ''; let bd = (f.action !== 'read' && (f.added > 0 || f.removed > 0)) ? '<span class="card-badge"><span class="plus">+' + f.added + '</span> <span class="minus">-' + f.removed + '</span></span>' : ''; sm.innerHTML = '<span class="card-icon done">✓</span><span class="card-title">' + al + ' <span class="file-link" onclick="event.stopPropagation(); openFile(\\'' + escapeHtml(f.name) + '\\')">' + escapeHtml(f.name) + '</span>' + li + '</span>' + bd; cd.appendChild(sm); aw.appendChild(cd); }); if (Array.isArray(m.activity.commands) && m.activity.commands.length > 0) m.activity.commands.forEach(cmd => { const cd = el('details', 'activity-card'); const sm = document.createElement('summary'); sm.innerHTML = '<span class="card-icon done">⚡</span><span class="card-title">執行終端機指令</span>'; const bd = el('div', 'card-body'); bd.innerHTML = '<pre>' + escapeHtml(cmd) + '</pre>'; cd.appendChild(sm); cd.appendChild(bd); aw.appendChild(cd); }); item.appendChild(aw); }
      item.appendChild(c); }
    messagesEl.appendChild(item); messagesEl.scrollTop = messagesEl.scrollHeight; markHasContent(); }

  function appendUserAttachment(m) { if (!messagesEl) return; let lu = messagesEl.lastElementChild; while (lu && !(lu.classList && lu.classList.contains('message') && lu.classList.contains('user'))) lu = lu.previousElementSibling; if (!lu) { const p = el('div', 'message user'); const c = document.createElement('div'); c.className = 'message-content'; c.textContent = ''; p.appendChild(c); messagesEl.appendChild(p); lu = p; } let ct = lu.querySelector('.user-attachments'); if (!ct) { ct = el('div', 'user-attachments'); lu.appendChild(ct); } const ch = el('div', 'user-attachment-chip'); const svg = m.kind === 'image' ? '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 6.5H3l3.2-3.2 2 2 1.4-1.4L13 12z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M3 2h7l3 3v9H3V2zm7 1v2h2" fill="currentColor"/></svg>'; ch.innerHTML = svg + '<span class="user-attachment-name">' + escapeHtml(m.name || 'attachment') + '</span>'; ct.appendChild(ch); messagesEl.scrollTop = messagesEl.scrollHeight; markHasContent(); }
  function setHistory(ms) { messagesEl.innerHTML = ''; ms.forEach(appendMessage); hasContent = ms.length > 0; updateEmptyState(); }
  function setBusy(b) { isBusy = b; sendEl.disabled = b; sendEl.hidden = b; stopEl.hidden = !b; setThinkingVisible(Boolean(b)); if (b) resetThinking('Thinking...'); }
  function sendMessage() { const v = inputEl.value.trim(); if (!v && pendingImages.length === 0 && pendingFiles.length === 0) return; markHasContent(); const mode = currentModeValue || 'agent'; const imgs = [...pendingImages]; const fls = [...pendingFiles]; setBusy(true); inputEl.value = ''; inputEl.dispatchEvent(new Event('input')); inputEl.focus(); pendingImages = []; pendingFiles = []; updateImagePreview(); vscode.postMessage({ type: 'userMessage', text: v, mode: mode, images: imgs, files: fls }); }
  function stopGeneration() { vscode.postMessage({ type: 'stop' }); showToast('⏹️ Stopped'); }
  function requestHistory() { vscode.postMessage({ type: 'getHistory', query: historySearchEl ? historySearchEl.value : '' }); }
  function toggleHistory() { historyPanelEl.hidden = !historyPanelEl.hidden; if (!historyPanelEl.hidden) { requestHistory(); if (historySearchEl) setTimeout(() => historySearchEl.focus(), 50); } }
  function closeHistoryPanel() { historyPanelEl.hidden = true; }
  function showBackButton(t) { if (headerBackEl) headerBackEl.hidden = false; if (headerTitleTextEl) headerTitleTextEl.textContent = t || 'BlueMonster'; currentHistoryTitle = t; isViewingHistory = true; }
  function hideBackButton() { if (headerBackEl) headerBackEl.hidden = true; if (headerTitleTextEl) headerTitleTextEl.textContent = currentAgentName; if (headerEmojiEl) headerEmojiEl.textContent = currentAgentEmoji; currentHistoryTitle = ''; isViewingHistory = false; }
  function goBackToHistory() { vscode.postMessage({ type: 'newChat' }); hideBackButton(); toggleHistory(); }
  function renderHistory(hs) { if (!hs || hs.length === 0) { historyListEl.innerHTML = (historySearchEl && historySearchEl.value.trim().length > 0) ? '<div class="history-empty">找不到符合的任務</div>' : '<div class="history-empty">尚無任務紀錄</div>'; return; } const tc = hs.length; historyListEl.innerHTML = hs.map((h, i) => { const tid = h.taskId || '#' + String(tc - i).padStart(4, '0'); const emoji = h.agentEmoji || '👾'; const name = h.agentName || 'BlueMonster'; const isActive = h.isActive || false; const isBusy = h.isBusy || false; const isWaiting = h.isWaiting || false; let statusBadge = ''; if (isBusy) { statusBadge = '<span class="history-item-status busy">🔄 執行中</span>'; } else if (isWaiting) { statusBadge = '<span class="history-item-status waiting">⏳ 等待中</span>'; } else if (isActive) { statusBadge = '<span class="history-item-status active">● 活動中</span>'; } else { statusBadge = '<span class="history-item-status archived">📁 歷史</span>'; } const itemClass = 'history-item' + (isActive ? ' active' : '') + (isBusy ? ' busy' : '') + (isWaiting ? ' waiting' : ''); return '<div class="' + itemClass + '" data-id="' + escapeHtml(h.id) + '" data-title="' + escapeHtml(h.title) + '" data-taskid="' + escapeHtml(tid) + '" data-agent="' + escapeHtml(name) + '"><div class="history-item-avatar">' + emoji + '</div><div class="history-item-content"><div class="history-item-header"><span class="history-item-taskid">' + escapeHtml(tid) + '</span><span class="history-item-agent">' + escapeHtml(name) + '</span>' + statusBadge + '</div><div class="history-item-title">' + escapeHtml(h.title) + '</div><div class="history-item-time">' + escapeHtml(h.date || '') + '</div></div></div>'; }).join(''); historyListEl.querySelectorAll('.history-item').forEach(it => { it.addEventListener('click', function() { const id = this.getAttribute('data-id'); const tt = this.getAttribute('data-title'); const agent = this.getAttribute('data-agent'); if (id) { vscode.postMessage({ type: 'loadHistory', id: id }); historyPanelEl.hidden = true; showBackButton(agent || tt || 'Task'); } }); }); }
  window.loadHistoryItem = (id, t) => { vscode.postMessage({ type: 'loadHistory', id: id }); historyPanelEl.hidden = true; showBackButton(t); };
  window.loadHistory = id => { vscode.postMessage({ type: 'loadHistory', id: id }); historyPanelEl.hidden = true; };

  sendEl.addEventListener('click', sendMessage);
  stopEl.addEventListener('click', stopGeneration);
  inputEl.addEventListener('keydown', e => { if (e.isComposing) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  const clickHandlers = { headerHistory: toggleHistory, headerSettings: () => vscode.postMessage({ type: 'openSettings' }), headerNewChat: () => { vscode.postMessage({ type: 'newChat' }); hideBackButton(); }, headerBack: goBackToHistory, closeHistory: () => { historyPanelEl.hidden = true; }, closeHistoryPanel: closeHistoryPanel, addImage: () => { if (imageInputEl) { imageInputEl.value = ''; imageInputEl.click(); } } };
  Object.entries(clickHandlers).forEach(([id, h]) => { const e = document.getElementById(id); if (e) e.addEventListener('click', h); });
  if (historySearchEl) historySearchEl.addEventListener('input', requestHistory);
  if (inputEl) inputEl.addEventListener('input', updateLayoutPadding);
  if (inputAreaEl && typeof ResizeObserver !== 'undefined') new ResizeObserver(updateLayoutPadding).observe(inputAreaEl);
  window.addEventListener('resize', updateLayoutPadding);
  imageInputEl.addEventListener('change', e => { const fs = e.target.files; if (!fs || fs.length === 0) return; for (const f of fs) { if (!f.type || !f.type.startsWith('image/')) { showToast('Only images supported'); continue; } const r = new FileReader(); r.onload = ev => { const d = ev.target && typeof ev.target.result === 'string' ? ev.target.result : ''; if (!d) { showToast('Failed: ' + f.name); return; } pendingImages.push({ dataUrl: d, mimeType: f.type, name: f.name }); updateImagePreview(); }; r.onerror = () => showToast('Failed: ' + f.name); r.readAsDataURL(f); } imageInputEl.value = ''; });
  function updateImagePreview() { if (!attachmentAreaEl) return; if (pendingImages.length === 0 && pendingFiles.length === 0) { attachmentAreaEl.innerHTML = ''; return; } const imgs = pendingImages.map((img, i) => { const th = img.dataUrl ? '<img class="chip-thumb" src="' + img.dataUrl + '" alt="preview" />' : '<svg viewBox="0 0 16 16" width="14" height="14" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M13.85 4.5l-3.35-3.35.7-.7.71.71L14.56 3.8l.71.71-.71.71L12.5 7.28l-.7-.71 2.05-2.07zm-7.7 9.92l7.35-7.36-.7-.7-7.36 7.35a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l7.36-7.36-.7-.71-7.36 7.36a3 3 0 0 0 0 4.24 3 3 0 0 0 4.24 0zM13.2 5.9l-7.35 7.36a1 1 0 0 1-1.41 0 1 1 0 0 1 0-1.42l7.35-7.35.7.7z"/></svg>'; return '<div class="attachment-chip"><div class="chip-icon">' + th + '</div><span class="chip-name">' + escapeHtml(img.name) + '</span><button class="chip-remove" data-idx="' + i + '" title="Remove">✕</button></div>'; }); const fls = pendingFiles.map((f, i) => '<div class="attachment-chip"><div class="chip-icon"><svg viewBox="0 0 16 16" width="14" height="14" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M4 1h5l3 3v11H4V1zm5 1.5V4h1.5L9 2.5zM5 7h6v1H5V7zm0 2h6v1H5V9z" /></svg></div><span class="chip-name">' + escapeHtml(f.name) + '</span><button class="chip-remove" data-file-idx="' + i + '" title="Remove">✕</button></div>'); attachmentAreaEl.innerHTML = imgs.concat(fls).join(''); attachmentAreaEl.querySelectorAll('.chip-remove').forEach(b => { b.addEventListener('click', e => { const ii = e.target.dataset.idx, fi = e.target.dataset.fileIdx; if (ii !== undefined) pendingImages.splice(parseInt(ii, 10), 1); else if (fi !== undefined) pendingFiles.splice(parseInt(fi, 10), 1); updateImagePreview(); }); }); }
  confirmOptionsEl.forEach(opt => { opt.addEventListener('click', () => { const v = opt.dataset.value; if (v === '1') sendConfirmResponse('run'); else if (v === '2') sendConfirmResponse('sessionAllow'); else if (v === '3') sendConfirmResponse('cancel'); else if (v === '4') { if (confirmInputEl) { confirmInputEl.focus(); confirmInputEl.placeholder = '請輸入您的想法...'; } } }); opt.addEventListener('mouseenter', () => { opt.style.background = '#3c3c3c'; }); opt.addEventListener('mouseleave', () => { opt.style.background = '#2d2d2d'; }); });
  if (confirmInputEl) confirmInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); handleConfirmInput(); } });
  if (confirmSubmitEl) confirmSubmitEl.addEventListener('click', () => handleConfirmInput());
  if (choiceInputEl) choiceInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); handleChoiceInput(); } });
  let currentAgentName = 'BlueMonster';
  let currentAgentEmoji = '👾';
  let currentRequestCount = 0;
  const headerRequestCountEl = document.getElementById('headerRequestCount');
  function updateAgentDisplay(name, emoji, requestCount) { currentAgentName = name || 'BlueMonster'; currentAgentEmoji = emoji || '👾'; currentRequestCount = requestCount || 0; if (!isViewingHistory) { if (headerTitleTextEl) headerTitleTextEl.textContent = currentAgentName; if (headerEmojiEl) headerEmojiEl.textContent = currentAgentEmoji; } if (headerRequestCountEl) { const displayCount = currentRequestCount === 0 ? '' : (Number.isInteger(currentRequestCount) ? currentRequestCount.toString() : currentRequestCount.toFixed(2)); headerRequestCountEl.textContent = displayCount ? displayCount + ' req' : ''; headerRequestCountEl.hidden = currentRequestCount === 0; } }

  if (choiceSubmitEl) choiceSubmitEl.addEventListener('click', () => handleChoiceInput());
  if (modelApplyEl) modelApplyEl.addEventListener('click', applyModel);
  if (modelCancelEl) modelCancelEl.addEventListener('click', clearModelPanel);

  window.addEventListener('message', e => { const m = e.data; if (!m) return; if (m.type === 'history') setHistory(m.messages || []); else if (m.type === 'append') appendMessage(m.message); else if (m.type === 'busy') setBusy(Boolean(m.value)); else if (m.type === 'thinking') { if (m.reset) { resetThinking(String(m.text || '')); setThinkingVisible(true); } else if (m.text) { appendThinking(String(m.text || '')); setThinkingVisible(true); } if (m.done) setThinkingVisible(false); } else if (m.type === 'model') setModelLabel(String(m.label || '')); else if (m.type === 'modeUpdate') updateModeSelector(String(m.mode || 'agent')); else if (m.type === 'confirm') showConfirm(m); else if (m.type === 'confirmClear') clearConfirm(); else if (m.type === 'choice') showChoicePanel(m); else if (m.type === 'choiceClear') clearChoicePanel(); else if (m.type === 'modelOptions') showModelPanel(m); else if (m.type === 'chatHistories') renderHistory(m.histories || []); else if (m.type === 'toast') showToast(m.text); else if (m.type === 'agentInfo') updateAgentDisplay(m.name, m.emoji, m.requestCount); else if (m.type === 'filesSelected') { pendingFiles = pendingFiles.concat(m.files || []); updateImagePreview(); } });

  setBusy(false);
  vscode.postMessage({ type: 'ready' });
  vscode.postMessage({ type: 'requestModelOptions' });
  updateLayoutPadding();
})();`;
