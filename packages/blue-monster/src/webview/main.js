// BlueMonster Webview Main Script
// 注意：此檔案中的 __NONCE__ 和 __ASSISTANT_AVATAR_URL__ 將在運行時被替換

(function() {
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
  const historyPanelEl = document.getElementById('historyPanel');
  const historyListEl = document.getElementById('historyList');
  const historySearchEl = document.getElementById('historySearch');
  const closeHistoryEl = document.getElementById('closeHistory');
  const closeHistoryPanelEl = document.getElementById('closeHistoryPanel');
  const addImageEl = document.getElementById('addImage');
  const modelLabelEl = document.getElementById('modelLabel');
  // 自定義選擇器元素
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
  // 多選項面板元素
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

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // DOM helper: 建立元素並設定屬性
  function el(tag, className, textOrProps) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (typeof textOrProps === 'string') element.textContent = textOrProps;
    else if (textOrProps) Object.assign(element, textOrProps);
    return element;
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  function updateEmptyState() {
    if (!emptyStateEl) return;
    emptyStateEl.hidden = hasContent || messagesEl.children.length > 0;
  }

  function markHasContent() {
    hasContent = true;
    updateEmptyState();
  }

  function updateLayoutPadding() {
    if (!inputAreaEl || !messagesEl) return;
    const padding = inputAreaEl.offsetHeight + 12;
    messagesEl.style.paddingBottom = padding + 'px';
  }

  // 自定義選擇器邏輯
  let currentModeValue = 'agent'; // 預設為代理-安全
  let currentModelValue = '';
  const modeLabels = {
    'chat': '計畫',
    'agent': '代理-安全',
    'agent-full': '代理-危險'
  };

  function truncateText(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  }

  function closeAllSelects() {
    document.querySelectorAll('.custom-select-trigger').forEach(t => t.classList.remove('open'));
    document.querySelectorAll('.custom-select-options').forEach(o => o.classList.remove('show'));
  }

  function initCustomSelect(triggerEl, optionsEl, onSelect, maxLen) {
    if (!triggerEl || !optionsEl) return;
    
    triggerEl.addEventListener('click', function(e) {
      e.stopPropagation();
      const isOpen = optionsEl.classList.contains('show');
      closeAllSelects();
      if (!isOpen) {
        triggerEl.classList.add('open');
        optionsEl.classList.add('show');
      }
    });

    optionsEl.addEventListener('click', function(e) {
      const option = e.target.closest('.custom-select-option');
      if (!option) return;
      const value = option.dataset.value;
      optionsEl.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      const fullText = option.textContent.replace('✓', '').trim();
      triggerEl.textContent = maxLen ? truncateText(fullText, maxLen) : fullText;
      closeAllSelects();
      if (onSelect) onSelect(value);
    });
  }

  // 初始化模式選擇器
  initCustomSelect(modeSelectTriggerEl, modeSelectOptionsEl, function(value) {
    currentModeValue = value;
    // 通知後端模式變更（可選）
  });

  // 初始化模型選擇器（限制12字）
  initCustomSelect(modelSelectTriggerEl, modelSelectOptionsEl, function(value) {
    currentModelValue = value;
    vscode.postMessage({ type: 'applyModel', value: value });
  }, 12);

  // 點擊外部關閉選擇器
  document.addEventListener('click', function() {
    closeAllSelects();
  });

  // 設定模式選擇器預設值
  if (modeSelectTriggerEl) {
    modeSelectTriggerEl.textContent = modeLabels[currentModeValue] || '代理-安全';
    const defaultOption = modeSelectOptionsEl?.querySelector('[data-value="agent"]');
    if (defaultOption) {
      modeSelectOptionsEl.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
      defaultOption.classList.add('selected');
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('✓ Copied to clipboard');
    }).catch(() => {
      showToast('Failed to copy');
    });
  }

  function setModelLabel(label) {
    if (!modelLabelEl) return;
    modelLabelEl.textContent = label || 'Model:';
  }

  function setThinkingVisible(visible) {
    if (!thinkingPanelEl) return;
    thinkingPanelEl.hidden = !visible;
    if (!visible && thinkingBodyEl) {
      thinkingBodyEl.textContent = '';
    }
  }

  function resetThinking(text) {
    if (!thinkingBodyEl) return;
    thinkingBodyEl.textContent = text || '';
    if (thinkingLabelEl) {
      thinkingLabelEl.textContent = 'Thinking...';
    }
  }

  function appendThinking(text) {
    if (!thinkingBodyEl) return;
    if (!text) return;
    if (thinkingBodyEl.textContent) {
      thinkingBodyEl.textContent += '\n';
    }
    thinkingBodyEl.textContent += text;
  }

  // 當前確認的危險類別（用於 session 記憶）
  let pendingConfirmCategory = '';

  function showConfirm(payload) {
    if (!confirmPanelEl) return;
    pendingConfirmId = payload.id || '';
    pendingConfirmCategory = payload.category || '';
    
    // 顯示危險類型標題
    const confirmTitleEl = document.getElementById('confirmTitle');
    const confirmDangerTypeEl = document.getElementById('confirmDangerType');
    const confirmTaskNameEl = document.getElementById('confirmTaskName');
    if (confirmTitleEl) {
      confirmTitleEl.textContent = payload.dangerType ? '⚠️ 敏感命令確認' : '⚠️ 執行命令確認';
    }
    if (confirmDangerTypeEl) {
      confirmDangerTypeEl.textContent = payload.dangerType || '';
      confirmDangerTypeEl.style.display = payload.dangerType ? 'inline' : 'none';
    }
    // 設置選項1的任務名稱
    if (confirmTaskNameEl) {
      confirmTaskNameEl.textContent = payload.dangerType || '執行此命令';
    }
    
    if (confirmCommandEl) {
      confirmCommandEl.textContent = payload.command || '';
    }
    if (confirmCwdEl) {
      if (payload.cwd) {
        confirmCwdEl.textContent = '📁 ' + payload.cwd;
        confirmCwdEl.style.display = 'block';
      } else {
        confirmCwdEl.style.display = 'none';
      }
    }
    // 清空輸入框
    if (confirmInputEl) {
      confirmInputEl.value = '';
      confirmInputEl.placeholder = '輸入數字 (1-4) 或直接輸入想法...';
    }
    confirmPanelEl.hidden = false;
    // 滾動到底部並聚焦
    setTimeout(() => {
      confirmPanelEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
      if (confirmInputEl) confirmInputEl.focus();
    }, 100);
  }

  function clearConfirm() {
    pendingConfirmId = '';
    pendingConfirmCategory = '';
    if (confirmPanelEl) {
      confirmPanelEl.hidden = true;
    }
    if (confirmCommandEl) {
      confirmCommandEl.textContent = '';
    }
    if (confirmCwdEl) {
      confirmCwdEl.textContent = '';
    }
    if (confirmInputEl) {
      confirmInputEl.value = '';
    }
  }

  // 多選項面板函數
  function showChoicePanel(payload) {
    if (!choicePanelEl || !choiceOptionsEl) return;
    pendingChoiceId = payload.id || '';
    const options = payload.options || [];
    pendingChoiceCount = options.length;
    
    if (choiceTitleEl) {
      choiceTitleEl.textContent = payload.title || '🤔 請選擇方案';
    }
    if (choiceDescriptionEl) {
      choiceDescriptionEl.textContent = payload.description || '';
      choiceDescriptionEl.hidden = !payload.description;
    }
    
    // 生成選項 HTML
    choiceOptionsEl.innerHTML = options.map(function(opt, idx) {
      const num = idx + 1;
      const recommended = opt.recommended ? ' ⭐ 建議' : '';
      return '<div class="choice-option" data-value="' + num + '" style="padding: 10px 12px; margin: 4px 0; background: #2d2d2d; border-radius: 4px; cursor: pointer;">' +
        '<div style="display: flex; align-items: center;">' +
          '<span style="color: #4fc3f7; margin-right: 8px; font-weight: bold;">' + num + '.</span>' +
          '<span style="font-weight: 500;">' + escapeHtml(opt.label) + recommended + '</span>' +
        '</div>' +
        (opt.description ? '<div style="margin-left: 24px; margin-top: 4px; font-size: 12px; opacity: 0.7;">' + escapeHtml(opt.description) + '</div>' : '') +
      '</div>';
    }).join('') + 
    '<div class="choice-option" data-value="other" style="padding: 10px 12px; margin: 4px 0; background: #2d2d2d; border-radius: 4px; cursor: pointer;">' +
      '<div style="display: flex; align-items: center;">' +
        '<span style="color: #4fc3f7; margin-right: 8px; font-weight: bold;">' + (options.length + 1) + '.</span>' +
        '<span>其他（輸入想法）</span>' +
      '</div>' +
    '</div>';
    
    // 綁定點擊事件
    choiceOptionsEl.querySelectorAll('.choice-option').forEach(function(optEl) {
      optEl.addEventListener('click', function() {
        const value = optEl.dataset.value;
        if (value === 'other') {
          if (choiceInputEl) {
            choiceInputEl.focus();
            choiceInputEl.placeholder = '請輸入您的想法...';
          }
        } else {
          sendChoiceResponse(parseInt(value, 10));
        }
      });
      optEl.addEventListener('mouseenter', function() {
        optEl.style.background = '#3c3c3c';
      });
      optEl.addEventListener('mouseleave', function() {
        optEl.style.background = '#2d2d2d';
      });
    });
    
    if (choiceInputEl) {
      choiceInputEl.value = '';
      choiceInputEl.placeholder = '輸入數字選擇，或直接輸入您的想法...';
    }
    choicePanelEl.hidden = false;
    setTimeout(function() {
      if (choiceInputEl) choiceInputEl.focus();
    }, 100);
  }

  function clearChoicePanel() {
    pendingChoiceId = '';
    pendingChoiceCount = 0;
    if (choicePanelEl) {
      choicePanelEl.hidden = true;
    }
    if (choiceOptionsEl) {
      choiceOptionsEl.innerHTML = '';
    }
    if (choiceInputEl) {
      choiceInputEl.value = '';
    }
  }

  function sendChoiceResponse(selectedIndex, customText) {
    if (!pendingChoiceId) return;
    vscode.postMessage({
      type: 'choiceResponse',
      id: pendingChoiceId,
      selectedIndex: selectedIndex,
      customText: customText || ''
    });
    clearChoicePanel();
  }

  function handleChoiceInput() {
    if (!choiceInputEl) return;
    const value = choiceInputEl.value.trim();
    if (!value) return;
    
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= pendingChoiceCount) {
      sendChoiceResponse(num);
    } else if (num === pendingChoiceCount + 1) {
      // 選擇「其他」
      choiceInputEl.value = '';
      choiceInputEl.placeholder = '請輸入您的想法...';
    } else {
      // 當作自定義回應
      sendChoiceResponse(0, value);
    }
  }

  function showModelPanel(payload) {
    if (!modelSelectOptionsEl || !modelSelectTriggerEl) return;
    pendingModelBackend = payload.backend || '';
    modelSelectOptionsEl.innerHTML = '';

    function createOption(value, label, selected) {
      const option = el('div', 'custom-select-option' + (selected ? ' selected' : ''));
      option.dataset.value = value;
      option.innerHTML = '<span class="check-mark">✓</span>' + escapeHtml(label);
      return option;
    }

    if (pendingModelBackend === 'cli') {
      const label = payload.current || 'CLI model';
      modelSelectTriggerEl.textContent = truncateText(label, 12);
      modelSelectOptionsEl.appendChild(createOption(payload.current || '', label, true));
      currentModelValue = payload.current || '';
      return;
    }

    if (Array.isArray(payload.options) && payload.options.length > 0) {
      payload.options.forEach((opt, index) => {
        const value = opt.id || opt.label || '';
        const label = opt.label || opt.id || '';
        const isSelected = payload.current ? (value === payload.current) : (index === 0);
        modelSelectOptionsEl.appendChild(createOption(value, label, isSelected));
        if (isSelected) {
          modelSelectTriggerEl.textContent = truncateText(label, 12);
          currentModelValue = value;
        }
      });
    } else {
      modelSelectTriggerEl.textContent = 'No models';
      modelSelectOptionsEl.appendChild(createOption('', 'No models', true));
    }
  }

  function clearModelPanel() {
    pendingModelBackend = '';
  }

  function applyModel() {
    if (!currentModelValue) return;
    vscode.postMessage({ type: 'applyModel', value: currentModelValue });
    clearModelPanel();
  }

  function sendConfirmResponse(action, customText) {
    if (!pendingConfirmId) return;
    vscode.postMessage({ 
      type: 'confirmResponse', 
      id: pendingConfirmId, 
      action: action,
      category: pendingConfirmCategory,
      customText: customText || ''
    });
    clearConfirm();
  }

  function handleConfirmInput() {
    if (!confirmInputEl) return;
    const value = confirmInputEl.value.trim();
    if (!value) return;
    
    // 檢查是否是數字選項
    if (value === '1') {
      sendConfirmResponse('run');
    } else if (value === '2') {
      sendConfirmResponse('sessionAllow');
    } else if (value === '3') {
      sendConfirmResponse('cancel');
    } else if (value === '4') {
      // 清空輸入框，等待用戶輸入想法
      confirmInputEl.value = '';
      confirmInputEl.placeholder = '請輸入您的想法...';
    } else {
      // 當作自定義回應
      sendConfirmResponse('custom', value);
    }
  }
  
  // 格式化程式碼區塊 - Copilot 風格
  function formatCodeBlocks(text) {
    const codeBlockRegex = /\`\`\`(\w*)\n([\s\S]*?)\`\`\`/g;
    let result = escapeHtml(text);
    
    // 處理程式碼區塊
    result = result.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
      const codeId = 'code-' + Math.random().toString(36).slice(2, 8);
      const langLabel = lang || 'text';
      const isShell = lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'zsh';
      
      return '<div class="code-block" data-code-id="' + codeId + '">' +
        '<div class="code-block-header">' +
          '<span class="code-block-lang">' + langLabel + '</span>' +
        '</div>' +
        '<pre><code data-code="' + codeId + '">' + code + '</code></pre>' +
      '</div>';
    });
    
    // 處理行內程式碼
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    return result;
  }
  
  // 程式碼操作函數
  window.copyCode = function(codeId) {
    const codeEl = document.querySelector('[data-code="' + codeId + '"]');
    if (codeEl) {
      copyToClipboard(codeEl.textContent);
    }
  };
  
  window.insertCode = function(codeId) {
    const codeEl = document.querySelector('[data-code="' + codeId + '"]');
    if (codeEl) {
      vscode.postMessage({ type: 'insertCode', code: codeEl.textContent });
      showToast('Inserted at cursor');
    }
  };
  
  window.runInTerminal = function(codeId) {
    const codeEl = document.querySelector('[data-code="' + codeId + '"]');
    if (codeEl) {
      vscode.postMessage({ type: 'runInTerminal', command: codeEl.textContent.trim() });
      showToast('Running in terminal');
    }
  };
  
  // 開啟檔案
  window.openFile = function(filePath) {
    vscode.postMessage({ type: 'openFile', path: filePath });
  };
  
  // 儲存原始訊息文字的 Map
  const messageRawTexts = new Map();
  
  // 訊息操作函數
  window.copyMessage = function(msgId) {
    // 優先使用儲存的原始文字
    if (messageRawTexts.has(msgId)) {
      copyToClipboard(messageRawTexts.get(msgId));
      return;
    }
    // Fallback: 從 DOM 取得
    const msgEl = document.querySelector('[data-msg-id="' + msgId + '"]');
    if (msgEl) {
      // 嘗試取得更完整的文字內容
      let text = '';
      // 取得 message-content 中的文字
      const walker = document.createTreeWalker(msgEl, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        text += node.textContent;
      }
      // 處理 code-block 中的程式碼
      msgEl.querySelectorAll('.code-block pre code').forEach(codeEl => {
        text += '\n' + codeEl.textContent + '\n';
      });
      copyToClipboard(text.trim() || msgEl.textContent);
    }
  };

  function appendMessage(message) {
    if (message.role === 'user' && (message.kind === 'image' || message.kind === 'file')) {
      appendUserAttachment(message);
      return;
    }
    const item = el('div', 'message ' + message.role);
    const kind = message.kind || 'text';
    const msgId = 'msg-' + (message.id || Math.random().toString(36).slice(2, 8));
    
    // Header with avatar and role
    const header = el('div', 'message-header');
    const avatar = el('div', 'message-avatar');
    if (message.role === 'assistant') {
      const img = el('img', '', { src: assistantAvatarUrl, alt: 'BlueMonster' });
      avatar.appendChild(img);
    }
    header.appendChild(avatar);
    
    const roleLabel = message.role === 'user' ? 'You' : message.role === 'assistant' ? 'BlueMonster' : 'System';
    header.appendChild(el('span', 'message-role', roleLabel));
    
    // 時間戳
    if (message.ts) {
      header.appendChild(el('span', 'message-time', new Date(message.ts).toLocaleTimeString()));
    }
    
    item.appendChild(header);
    
    if (kind === 'image' && message.dataUrl) {
      const attachment = el('div', 'message-attachment');
      const img = el('img', 'message-image', { src: message.dataUrl, alt: 'Uploaded image' });
      const textWrap = el('div', 'attachment-text');
      textWrap.appendChild(el('div', 'attachment-name', message.name || 'Image'));
      if (message.mimeType) {
        textWrap.appendChild(el('div', 'attachment-meta', message.mimeType));
      }
      attachment.appendChild(img);
      attachment.appendChild(textWrap);
      attachment.title = 'Click to view full size';
      attachment.onclick = () => {
        vscode.postMessage({ type: 'viewImage', dataUrl: message.dataUrl });
      };
      item.appendChild(attachment);
    } else if (kind === 'thought') {
      const details = el('details', 'thought');
      const summary = document.createElement('summary');
      summary.innerHTML = '💭 <strong>Thinking Process</strong>';
      const body = el('div', 'thought-body');
      body.innerHTML = escapeHtml(message.text).replace(/\n/g, '<br>');
      details.appendChild(summary);
      details.appendChild(body);
      item.appendChild(details);
    } else {
      const content = el('div', 'message-content');
      content.setAttribute('data-msg-id', msgId);
      // 儲存原始文字以供複製
      if (message.text) {
        messageRawTexts.set(msgId, message.text);
      }
      // 使用格式化函數處理程式碼區塊
      const formattedText = formatCodeBlocks(message.text || '');
      content.innerHTML = formattedText.replace(/\n/g, '<br>');
      if (message.role === 'assistant' && message.activity) {
        const activityWrap = el('div', 'assistant-activity');

        // 步驟卡片 - 可折疊
        if (Array.isArray(message.activity.steps) && message.activity.steps.length > 0) {
          message.activity.steps.forEach((step) => {
            const card = el('details', 'activity-card');
            const summary = document.createElement('summary');
            summary.innerHTML = '<span class="card-icon done">✓</span><span class="card-title">' + escapeHtml(step) + '</span>';
            card.appendChild(summary);
            activityWrap.appendChild(card);
          });
        }

        // 檔案操作卡片 - 可折疊，顯示行號範圍
        if (Array.isArray(message.activity.files) && message.activity.files.length > 0) {
          message.activity.files.forEach((file) => {
            const card = el('details', 'activity-card');
            const summary = document.createElement('summary');
            
            let actionIcon = '✓';
            let actionLabel = '';
            if (file.action === 'created') {
              actionLabel = '建立';
            } else if (file.action === 'read') {
              actionLabel = '讀取';
            } else {
              actionLabel = '編輯';
            }
            
            let lineInfo = '';
            if (file.lineStart && file.lineEnd) {
              lineInfo = '<span class="line-range">，' + file.lineStart + ' 至 ' + file.lineEnd + ' 行</span>';
            }
            
            let badge = '';
            if (file.action !== 'read' && (file.added > 0 || file.removed > 0)) {
              badge = '<span class="card-badge"><span class="plus">+' + file.added + '</span> <span class="minus">-' + file.removed + '</span></span>';
            }
            
            summary.innerHTML = 
              '<span class="card-icon done">' + actionIcon + '</span>' +
              '<span class="card-title">' + actionLabel + ' <span class="file-link" onclick="event.stopPropagation(); openFile(\'' + escapeHtml(file.name) + '\')">' + escapeHtml(file.name) + '</span>' + lineInfo + '</span>' +
              badge;
            card.appendChild(summary);
            activityWrap.appendChild(card);
          });
        }

        // 命令卡片 - 可折疊
        if (Array.isArray(message.activity.commands) && message.activity.commands.length > 0) {
          message.activity.commands.forEach((cmd) => {
            const card = el('details', 'activity-card');
            const summary = document.createElement('summary');
            summary.innerHTML = '<span class="card-icon done">⚡</span><span class="card-title">執行終端機指令</span>';
            const body = el('div', 'card-body');
            body.innerHTML = '<pre>' + escapeHtml(cmd) + '</pre>';
            card.appendChild(summary);
            card.appendChild(body);
            activityWrap.appendChild(card);
          });
        }

        item.appendChild(activityWrap);
      }
      item.appendChild(content);
    }
    messagesEl.appendChild(item);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    markHasContent();
  }

  function appendUserAttachment(message) {
    if (!messagesEl) return;
    let lastUser = messagesEl.lastElementChild;
    while (lastUser && !(lastUser.classList && lastUser.classList.contains('message') && lastUser.classList.contains('user'))) {
      lastUser = lastUser.previousElementSibling;
    }
    if (!lastUser) {
      const placeholder = el('div', 'message user');
      const content = document.createElement('div');
      content.className = 'message-content';
      content.textContent = '';
      placeholder.appendChild(content);
      messagesEl.appendChild(placeholder);
      lastUser = placeholder;
    }
    let container = lastUser.querySelector('.user-attachments');
    if (!container) {
      container = el('div', 'user-attachments');
      lastUser.appendChild(container);
    }
    const chip = el('div', 'user-attachment-chip');
    const iconSvg = message.kind === 'image'
      ? '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 6.5H3l3.2-3.2 2 2 1.4-1.4L13 12z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M3 2h7l3 3v9H3V2zm7 1v2h2" fill="currentColor"/></svg>';
    chip.innerHTML =
      iconSvg +
      '<span class="user-attachment-name">' + escapeHtml(message.name || 'attachment') + '</span>';
    container.appendChild(chip);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    markHasContent();
  }

  function setHistory(messages) {
    messagesEl.innerHTML = '';
    messages.forEach(appendMessage);
    hasContent = messages.length > 0;
    updateEmptyState();
  }

  function setBusy(busy) {
    isBusy = busy;
    sendEl.disabled = busy;
    sendEl.hidden = busy;
    stopEl.hidden = !busy;
    setThinkingVisible(Boolean(busy));
    if (busy) {
      resetThinking('Thinking...');
    }
  }

  function sendMessage() {
    const value = inputEl.value.trim();
    if (!value && pendingImages.length === 0 && pendingFiles.length === 0) return;
    markHasContent();
    const mode = currentModeValue || 'agent';
    const images = [...pendingImages];
    const files = [...pendingFiles];

    setBusy(true);
    
    inputEl.value = '';
    inputEl.dispatchEvent(new Event('input'));
    inputEl.focus();
    
    // 清除附件預覽
    pendingImages = [];
    pendingFiles = [];
    updateImagePreview();
    
    vscode.postMessage({ 
      type: 'userMessage', 
      text: value,
      mode: mode,
      images: images,
      files: files
    });
  }
  
  function stopGeneration() {
    vscode.postMessage({ type: 'stop' });
    showToast('⏹️ Generation stopped');
  }
  
  // 歷史記錄功能
  function requestHistory() {
    const query = historySearchEl ? historySearchEl.value : '';
    vscode.postMessage({ type: 'getHistory', query });
  }

  // 當前載入的歷史任務標題
  let currentHistoryTitle = '';
  let isViewingHistory = false;

  function toggleHistory() {
    historyPanelEl.hidden = !historyPanelEl.hidden;
    if (!historyPanelEl.hidden) {
      requestHistory();
      // Focus 在 search input 上
      if (historySearchEl) {
        setTimeout(function() {
          historySearchEl.focus();
        }, 50);
      }
    }
  }
  
  function closeHistoryPanel() {
    historyPanelEl.hidden = true;
  }
  
  function showBackButton(title) {
    if (headerBackEl) {
      headerBackEl.hidden = false;
    }
    if (headerTitleTextEl) {
      headerTitleTextEl.textContent = title || 'BlueMonster';
    }
    currentHistoryTitle = title;
    isViewingHistory = true;
  }
  
  function hideBackButton() {
    if (headerBackEl) {
      headerBackEl.hidden = true;
    }
    if (headerTitleTextEl) {
      headerTitleTextEl.textContent = 'BlueMonster';
    }
    currentHistoryTitle = '';
    isViewingHistory = false;
  }
  
  function goBackToHistory() {
    // 開啟新對話
    vscode.postMessage({ type: 'newChat' });
    hideBackButton();
    toggleHistory();
  }
  
  function renderHistory(histories) {
    if (!histories || histories.length === 0) {
      const hasQuery = historySearchEl && historySearchEl.value.trim().length > 0;
      historyListEl.innerHTML = hasQuery
        ? '<div class="history-empty">找不到符合的任務</div>'
        : '<div class="history-empty">尚無任務紀錄</div>';
      return;
    }

    var totalCount = histories.length;
    historyListEl.innerHTML = histories.map(function(h, index) {
      // 任務 ID 顯示，如果沒有則用索引
      var taskId = h.taskId || '#' + String(totalCount - index).padStart(4, '0');
      // 使用 data 屬性存儲 id、title 和 taskId
      return '<div class="history-item" data-id="' + escapeHtml(h.id) + '" data-title="' + escapeHtml(h.title) + '" data-taskid="' + escapeHtml(taskId) + '">' +
        '<img class="history-item-icon" src="' + assistantAvatarUrl + '" alt="" />' +
        '<div class="history-item-content">' +
          '<div class="history-item-header">' +
            '<span class="history-item-taskid">' + escapeHtml(taskId) + '</span>' +
            '<span class="history-item-title">' + escapeHtml(h.title) + '</span>' +
          '</div>' +
          '<div class="history-item-time">' + escapeHtml(h.date || '') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    
    // 使用事件委派處理點擊
    var items = historyListEl.querySelectorAll('.history-item');
    items.forEach(function(item) {
      item.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var title = this.getAttribute('data-title');
        if (id) {
          vscode.postMessage({ type: 'loadHistory', id: id });
          historyPanelEl.hidden = true;
          showBackButton(title || 'Task');
        }
      });
    });
  }
  
  window.loadHistoryItem = function(id, title) {
    vscode.postMessage({ type: 'loadHistory', id: id });
    historyPanelEl.hidden = true;
    showBackButton(title);
  };
  
  window.loadHistory = function(id) {
    vscode.postMessage({ type: 'loadHistory', id: id });
    historyPanelEl.hidden = true;
  };
  
  // 匯出對話
  function exportChat() {
    vscode.postMessage({ type: 'exportChat' });
    showToast('📤 Exporting chat...');
  }

  sendEl.addEventListener('click', sendMessage);
  stopEl.addEventListener('click', stopGeneration);

  inputEl.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  // 統一事件綁定
  const clickHandlers = {
    headerHistory: toggleHistory,
    headerSettings: () => vscode.postMessage({ type: 'openSettings' }),
    headerNewChat: () => { vscode.postMessage({ type: 'newChat' }); hideBackButton(); },
    headerBack: goBackToHistory,
    closeHistory: () => { historyPanelEl.hidden = true; },
    closeHistoryPanel: closeHistoryPanel,
    addImage: () => { if (imageInputEl) { imageInputEl.value = ''; imageInputEl.click(); } }
  };
  Object.entries(clickHandlers).forEach(([id, handler]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  });

  if (historySearchEl) historySearchEl.addEventListener('input', requestHistory);
  if (inputEl) inputEl.addEventListener('input', updateLayoutPadding);
  if (inputAreaEl && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updateLayoutPadding).observe(inputAreaEl);
  }
  window.addEventListener('resize', updateLayoutPadding);
  
  // 圖片上傳處理
  imageInputEl.addEventListener('change', (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    for (const file of files) {
      if (!file.type || !file.type.startsWith('image/')) {
        showToast('Only image files are supported right now');
        continue;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target && typeof ev.target.result === 'string' ? ev.target.result : '';
        if (!dataUrl) {
          showToast('Failed to read image: ' + file.name);
          return;
        }
        pendingImages.push({
          dataUrl,
          mimeType: file.type,
          name: file.name
        });
        updateImagePreview();
      };
      reader.onerror = () => showToast('Failed to read image: ' + file.name);
      reader.readAsDataURL(file);
    }
    
    imageInputEl.value = '';
  });

  // 更新圖片預覽 (附件 Chips)
  function updateImagePreview() {
    if (!attachmentAreaEl) return;
    
    if (pendingImages.length === 0 && pendingFiles.length === 0) {
      attachmentAreaEl.innerHTML = '';
      return;
    }
    
    const imageItems = pendingImages.map((img, idx) => {
      const thumb = img.dataUrl
        ? '<img class="chip-thumb" src="' + img.dataUrl + '" alt="preview" />'
        : '<svg viewBox="0 0 16 16" width="14" height="14" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M13.85 4.5l-3.35-3.35.7-.7.71.71L14.56 3.8l.71.71-.71.71L12.5 7.28l-.7-.71 2.05-2.07zm-7.7 9.92l7.35-7.36-.7-.7-7.36 7.35a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l7.36-7.36-.7-.71-7.36 7.36a3 3 0 0 0 0 4.24 3 3 0 0 0 4.24 0zM13.2 5.9l-7.35 7.36a1 1 0 0 1-1.41 0 1 1 0 0 1 0-1.42l7.35-7.35.7.7z"/></svg>';
      return '<div class="attachment-chip">' +
        '<div class="chip-icon">' + thumb + '</div>' +
        '<span class="chip-name">' + escapeHtml(img.name) + '</span>' +
        '<button class="chip-remove" data-idx="' + idx + '" title="Remove">✕</button>' +
      '</div>';
    });

    const fileItems = pendingFiles.map((file, idx) => {
      return '<div class="attachment-chip">' +
        '<div class="chip-icon"><svg viewBox="0 0 16 16" width="14" height="14" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M4 1h5l3 3v11H4V1zm5 1.5V4h1.5L9 2.5zM5 7h6v1H5V7zm0 2h6v1H5V9z" /></svg></div>' +
        '<span class="chip-name">' + escapeHtml(file.name) + '</span>' +
        '<button class="chip-remove" data-file-idx="' + idx + '" title="Remove">✕</button>' +
      '</div>';
    });

    attachmentAreaEl.innerHTML = imageItems.concat(fileItems).join('');
    
    attachmentAreaEl.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const imgIdx = e.target.dataset.idx;
        const fileIdx = e.target.dataset.fileIdx;
        if (imgIdx !== undefined) {
          pendingImages.splice(parseInt(imgIdx, 10), 1);
        } else if (fileIdx !== undefined) {
          pendingFiles.splice(parseInt(fileIdx, 10), 1);
        }
        updateImagePreview();
      });
    });
  }
  
  // 確認選項點擊事件
  confirmOptionsEl.forEach(option => {
    option.addEventListener('click', () => {
      const value = option.dataset.value;
      if (value === '1') {
        sendConfirmResponse('run');
      } else if (value === '2') {
        sendConfirmResponse('sessionAllow');
      } else if (value === '3') {
        sendConfirmResponse('cancel');
      } else if (value === '4') {
        // 聚焦輸入框讓用戶輸入想法
        if (confirmInputEl) {
          confirmInputEl.focus();
          confirmInputEl.placeholder = '請輸入您的想法...';
        }
      }
    });
    // hover 效果
    option.addEventListener('mouseenter', () => {
      option.style.background = '#3c3c3c';
    });
    option.addEventListener('mouseleave', () => {
      option.style.background = '#2d2d2d';
    });
  });

  // 確認輸入框事件
  if (confirmInputEl) {
    confirmInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmInput();
      }
    });
  }
  if (confirmSubmitEl) {
    confirmSubmitEl.addEventListener('click', () => handleConfirmInput());
  }

  // 多選項面板事件
  if (choiceInputEl) {
    choiceInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleChoiceInput();
      }
    });
  }
  if (choiceSubmitEl) {
    choiceSubmitEl.addEventListener('click', () => handleChoiceInput());
  }

  if (modelApplyEl) {
    modelApplyEl.addEventListener('click', applyModel);
  }
  if (modelCancelEl) {
    modelCancelEl.addEventListener('click', clearModelPanel);
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message) return;
    if (message.type === 'history') {
      setHistory(message.messages || []);
    } else if (message.type === 'append') {
      appendMessage(message.message);
    } else if (message.type === 'busy') {
      setBusy(Boolean(message.value));
    } else if (message.type === 'thinking') {
      if (message.reset) {
        resetThinking(String(message.text || ''));
        setThinkingVisible(true);
      } else if (message.text) {
        appendThinking(String(message.text || ''));
        setThinkingVisible(true);
      }
      if (message.done) {
        setThinkingVisible(false);
      }
    } else if (message.type === 'model') {
      setModelLabel(String(message.label || ''));
    } else if (message.type === 'confirm') {
      showConfirm(message);
    } else if (message.type === 'confirmClear') {
      clearConfirm();
    } else if (message.type === 'choice') {
      showChoicePanel(message);
    } else if (message.type === 'choiceClear') {
      clearChoicePanel();
    } else if (message.type === 'modelOptions') {
      showModelPanel(message);
    } else if (message.type === 'chatHistories') {
      renderHistory(message.histories || []);
    } else if (message.type === 'toast') {
      showToast(message.text);
    } else if (message.type === 'filesSelected') {
      const incoming = message.files || [];
      pendingFiles = pendingFiles.concat(incoming);
      updateImagePreview();
    }
  });

  setBusy(false);
  vscode.postMessage({ type: 'ready' });
  vscode.postMessage({ type: 'requestModelOptions' });
  updateLayoutPadding();
})();
