// Webview HTML 模板 - 只包含結構，不包含 CSS/JS
// CSS 從 webview-css.ts 導入，JS 從 webview-js.ts 導入

export const WEBVIEW_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src __CSP_SOURCE__ data:; style-src __CSP_SOURCE__ 'unsafe-inline'; script-src 'nonce-__NONCE__';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BlueMonster</title>
  <style>__CSS__</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <button id="headerBack" class="icon-btn back-btn" hidden title="返回任務清單">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 19l-7-7 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="header-title" id="headerTitle">
        <span class="header-emoji" id="headerEmoji">👾</span>
        <span id="headerTitleText">BlueMonster</span>
        <span class="header-request-count" id="headerRequestCount" hidden></span>
      </div>
    </div>
    <div class="header-right">
      <div class="toolbar">
        <button id="headerHistory" class="icon-btn" data-tooltip="任務清單" data-tooltip-position="bottom" data-tooltip-align="center" title="任務清單">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 8V12L14.5 14.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5.60423 5.60423L5.0739 5.0739V5.0739L5.60423 5.60423ZM4.33785 6.87061L3.58786 6.87438C3.58992 7.28564 3.92281 7.61853 4.33408 7.6206L4.33785 6.87061ZM6.87963 7.63339C7.29384 7.63547 7.63131 7.30138 7.63339 6.88717C7.63547 6.47296 7.30138 6.13549 6.88717 6.13341L6.87963 7.63339ZM5.07505 4.32129C5.07296 3.90708 4.7355 3.57298 4.32129 3.57506C3.90708 3.57715 3.57298 3.91462 3.57507 4.32882L5.07505 4.32129ZM3.75 12C3.75 11.5858 3.41421 11.25 3 11.25C2.58579 11.25 2.25 11.5858 2.25 12H3.75ZM16.8755 20.4452C17.2341 20.2378 17.3566 19.779 17.1492 19.4204C16.9418 19.0619 16.483 18.9393 16.1245 19.1468L16.8755 20.4452ZM19.1468 16.1245C18.9393 16.483 19.0619 16.9418 19.4204 17.1492C19.779 17.3566 20.2378 17.2341 20.4452 16.8755L19.1468 16.1245ZM5.14033 5.07126C4.84598 5.36269 4.84361 5.83756 5.13505 6.13191C5.42648 6.42626 5.90134 6.42862 6.19569 6.13719L5.14033 5.07126ZM18.8623 5.13786C15.0421 1.31766 8.86882 1.27898 5.0739 5.0739L6.13456 6.13456C9.33366 2.93545 14.5572 2.95404 17.8017 6.19852L18.8623 5.13786ZM5.0739 5.0739L3.80752 6.34028L4.86818 7.40094L6.13456 6.13456L5.0739 5.0739ZM4.33408 7.6206L6.87963 7.63339L6.88717 6.13341L4.34162 6.12062L4.33408 7.6206ZM5.08784 6.86684L5.07505 4.32129L3.57507 4.32882L3.58786 6.87438L5.08784 6.86684ZM12 3.75C16.5563 3.75 20.25 7.44365 20.25 12H21.75C21.75 6.61522 17.3848 2.25 12 2.25V3.75ZM12 20.25C7.44365 20.25 3.75 16.5563 3.75 12H2.25C2.25 17.3848 6.61522 21.75 12 21.75V20.25ZM16.1245 19.1468C14.9118 19.8483 13.5039 20.25 12 20.25V21.75C13.7747 21.75 15.4407 21.2752 16.8755 20.4452L16.1245 19.1468ZM20.25 12C20.25 13.5039 19.8483 14.9118 19.1468 16.1245L20.4452 16.8755C21.2752 15.4407 21.75 13.7747 21.75 12H20.25ZM6.19569 6.13719C7.68707 4.66059 9.73646 3.75 12 3.75V2.25C9.32542 2.25 6.90113 3.32791 5.14033 5.07126L6.19569 6.13719Z" fill="currentColor"/>
          </svg>
        </button>
        <button id="headerSettings" class="icon-btn" data-tooltip="設定" data-tooltip-position="bottom" data-tooltip-align="center" title="設定">
          <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
            <path d="M600.704 64a32 32 0 0 1 30.464 22.208l35.2 109.376c14.784 7.232 28.928 15.36 42.432 24.512l112.384-24.192a32 32 0 0 1 34.432 15.36L944.32 364.8a32 32 0 0 1-4.032 37.504l-77.12 85.12a357.12 357.12 0 0 1 0 49.024l77.12 85.248a32 32 0 0 1 4.032 37.504l-88.704 153.6a32 32 0 0 1-34.432 15.296L708.8 803.904c-13.44 9.088-27.648 17.28-42.368 24.512l-35.264 109.376A32 32 0 0 1 600.704 960H423.296a32 32 0 0 1-30.464-22.208L357.696 828.48a351.616 351.616 0 0 1-42.56-24.64l-112.32 24.256a32 32 0 0 1-34.432-15.36L79.68 659.2a32 32 0 0 1 4.032-37.504l77.12-85.248a357.12 357.12 0 0 1 0-48.896l-77.12-85.248A32 32 0 0 1 79.68 364.8l88.704-153.6a32 32 0 0 1 34.432-15.296l112.32 24.256c13.568-9.152 27.776-17.408 42.56-24.64l35.2-109.312A32 32 0 0 1 423.232 64H600.64zm-23.424 64H446.72l-36.352 113.088-24.512 11.968a294.113 294.113 0 0 0-34.816 20.096l-22.656 15.36-116.224-25.088-65.28 113.152 79.68 88.192-1.92 27.136a293.12 293.12 0 0 0 0 40.192l1.92 27.136-79.808 88.192 65.344 113.152 116.224-25.024 22.656 15.296a294.113 294.113 0 0 0 34.816 20.096l24.512 11.968L446.72 896h130.688l36.48-113.152 24.448-11.904a288.282 288.282 0 0 0 34.752-20.096l22.592-15.296 116.288 25.024 65.28-113.152-79.744-88.192 1.92-27.136a293.12 293.12 0 0 0 0-40.256l-1.92-27.136 79.808-88.128-65.344-113.152-116.288 24.96-22.592-15.232a287.616 287.616 0 0 0-34.752-20.096l-24.448-11.904L577.344 128zM512 320a192 192 0 1 1 0 384 192 192 0 0 1 0-384zm0 64a128 128 0 1 0 0 256 128 128 0 0 0 0-256z" fill="currentColor"/>
          </svg>
        </button>
        <button id="headerNewChat" class="icon-btn" data-tooltip="新聊天" data-tooltip-position="bottom" data-tooltip-align="center" title="新聊天">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.75 9C12.75 8.58579 12.4142 8.25 12 8.25C11.5858 8.25 11.25 8.58579 11.25 9L11.25 11.25H9C8.58579 11.25 8.25 11.5858 8.25 12C8.25 12.4142 8.58579 12.75 9 12.75H11.25V15C11.25 15.4142 11.5858 15.75 12 15.75C12.4142 15.75 12.75 15.4142 12.75 15L12.75 12.75H15C15.4142 12.75 15.75 12.4142 15.75 12C15.75 11.5858 15.4142 11.25 15 11.25H12.75V9Z" fill="currentColor"/>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12.0574 1.25H11.9426C9.63424 1.24999 7.82519 1.24998 6.41371 1.43975C4.96897 1.63399 3.82895 2.03933 2.93414 2.93414C2.03933 3.82895 1.63399 4.96897 1.43975 6.41371C1.24998 7.82519 1.24999 9.63422 1.25 11.9426V12.0574C1.24999 14.3658 1.24998 16.1748 1.43975 17.5863C1.63399 19.031 2.03933 20.1711 2.93414 21.0659C3.82895 21.9607 4.96897 22.366 6.41371 22.5603C7.82519 22.75 9.63423 22.75 11.9426 22.75H12.0574C14.3658 22.75 16.1748 22.75 17.5863 22.5603C19.031 22.366 20.1711 21.9607 21.0659 21.0659C21.9607 20.1711 22.366 19.031 22.5603 17.5863C22.75 16.1748 22.75 14.3658 22.75 12.0574V11.9426C22.75 9.63423 22.75 7.82519 22.5603 6.41371C22.366 4.96897 21.9607 3.82895 21.0659 2.93414C20.1711 2.03933 19.031 1.63399 17.5863 1.43975C16.1748 1.24998 14.3658 1.24999 12.0574 1.25ZM3.9948 3.9948C4.56445 3.42514 5.33517 3.09825 6.61358 2.92637C7.91356 2.75159 9.62177 2.75 12 2.75C14.3782 2.75 16.0864 2.75159 17.3864 2.92637C18.6648 3.09825 19.4355 3.42514 20.0052 3.9948C20.5749 4.56445 20.9018 5.33517 21.0736 6.61358C21.2484 7.91356 21.25 9.62177 21.25 12C21.25 14.3782 21.2484 16.0864 21.0736 17.3864C20.9018 18.6648 20.5749 19.4355 20.0052 20.0052C19.4355 20.5749 18.6648 20.9018 17.3864 21.0736C16.0864 21.2484 14.3782 21.25 12 21.25C9.62177 21.25 7.91356 21.2484 6.61358 21.0736C5.33517 20.9018 4.56445 20.5749 3.9948 20.0052C3.42514 19.4355 3.09825 18.6648 2.92637 17.3864C2.75159 16.0864 2.75 14.3782 2.75 12C2.75 9.62177 2.75159 7.91356 2.92637 6.61358C3.09825 5.33517 3.42514 4.56445 3.9948 3.9948Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
  
  <div class="panel overlay" id="modelPanel" hidden>
    <div class="panel-title">🤖 Select Model</div>
    <div class="panel-meta" id="modelHint"></div>
    <select id="modelSelect" style="width: 100%; margin-bottom: 8px; padding: 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; outline: none;"></select>
    <div id="reasoningSection" style="display: none; margin-bottom: 8px;">
      <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-3);">⚡ Reasoning Effort</label>
      <select id="reasoningSelect" style="width: 100%; padding: 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; outline: none;"></select>
    </div>
    <input id="modelInput" type="text" placeholder="Enter model name" style="width: 100%; margin-bottom: 8px; padding: 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; outline: none;" />
    <div class="panel-actions">
      <button class="btn-primary" id="modelApply">Apply</button>
      <button class="btn-secondary" id="modelCancel">Cancel</button>
    </div>
  </div>

  <div class="panel overlay" id="agentDetailPanel" hidden>
    <div class="panel-title" id="agentDetailTitle">👾 Agent</div>
    <div class="panel-meta" id="agentDetailMeta"></div>
    <div class="agent-detail-body" id="agentDetailBody"></div>
    <div class="panel-actions">
      <button class="btn-secondary" id="agentDetailClose" title="關閉詳細資訊">關閉</button>
      <button class="btn-primary" id="agentDetailSwitch" title="切換到這個任務">切換</button>
    </div>
  </div>
  
  <div class="history-panel" id="historyPanel" hidden>
    <div class="history-panel-header">
      <button id="closeHistoryPanel" class="icon-btn" title="關閉">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 19l-7-7 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <span class="history-panel-title">任務</span>
    </div>
    <div class="history-search">
      <input type="text" id="historySearch" placeholder="搜尋最近的任務" />
    </div>
    <div class="history-header">
      <span>所有任務</span>
    </div>
    <div class="history-list" id="historyList">
      <div class="history-empty">尚無任務紀錄</div>
    </div>
  </div>
  
  <div class="messages-wrap">
    <div class="empty-state" id="emptyState">
      <img src="__AVATAR_URL__" alt="BlueMonster" />
      <div>New chat</div>
    </div>
    <div class="messages" id="messages"></div>
  </div>
  
  <div class="confirm-panel-inline" id="confirmPanel" hidden>
    <div class="confirm-header">
      <span class="confirm-title" id="confirmTitle">⚠️ 敏感命令確認</span>
      <span class="confirm-danger-type" id="confirmDangerType"></span>
    </div>
    <div class="confirm-command" id="confirmCommand"></div>
    <div class="confirm-cwd" id="confirmCwd"></div>
    <div class="confirm-options">
      <div class="confirm-option" data-value="1">
        <span class="option-num">1.</span>
        <span>Yes，開始執行 <span id="confirmTaskName"></span></span>
      </div>
      <div class="confirm-option" data-value="2">
        <span class="option-num">2.</span>
        <span>Yes，在這專案中永遠同意這件事</span>
      </div>
      <div class="confirm-option" data-value="3">
        <span class="option-num">3.</span>
        <span>No，拒絕</span>
      </div>
      <div class="confirm-option" data-value="4">
        <span class="option-num">4.</span>
        <span>其他想法</span>
      </div>
    </div>
    <div class="confirm-input-wrap">
      <input type="text" id="confirmInput" placeholder="輸入數字 (1-4) 或直接輸入想法..." />
      <button class="btn-primary" id="confirmSubmit">送出</button>
    </div>
    <div class="confirm-hint">💡 輸入 1-4 選擇選項，或直接輸入您的想法</div>
  </div>
  
  <div class="confirm-panel-inline" id="choicePanel" hidden>
    <div class="confirm-header">
      <span class="confirm-title" id="choiceTitle">🤔 請選擇方案</span>
    </div>
    <div class="confirm-command" id="choiceDescription" style="border-bottom: none;"></div>
    <div class="confirm-options" id="choiceOptions"></div>
    <div class="confirm-input-wrap">
      <input type="text" id="choiceInput" placeholder="輸入數字選擇，或直接輸入您的想法..." />
      <button class="btn-primary" id="choiceSubmit">送出</button>
    </div>
    <div class="confirm-hint">💡 輸入數字選擇方案，或直接輸入您的想法</div>
  </div>
  
  <div class="activity-panel" id="activityPanel" hidden>
    <div class="activity-header">
      <div class="spinner"></div>
      <span id="activityStatus" class="activity-status">Idle</span>
    </div>
    <div class="activity-body" id="activityBody"></div>
  </div>
  
  <div class="input-area">
    <div class="input-container">
      <div class="attachment-area" id="attachmentArea"></div>
      <div class="input-wrapper">
        <textarea id="input" class="input-textarea" placeholder="Ask BlueMonster or use /, #, @ ..." rows="1"></textarea>
      </div>
      <div class="input-footer-toolbar">
        <div class="toolbar-left">
          <button id="addImage" class="icon-btn" data-tooltip="新增圖像" data-tooltip-align="center" title="新增圖像">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
              <path d="M8 3v10M3 8h10"/>
            </svg>
          </button>
          <div class="custom-select" id="modeSelectCustom">
            <div class="custom-select-trigger" id="modeSelectTrigger">計畫</div>
            <div class="custom-select-options" id="modeSelectOptions">
              <div class="custom-select-option" data-value="chat"><span class="check-mark">✓</span>計畫</div>
              <div class="custom-select-option selected" data-value="agent"><span class="check-mark">✓</span>代理-安全</div>
              <div class="custom-select-option" data-value="agent-full"><span class="check-mark">✓</span>代理-危險</div>
            </div>
          </div>
          <div class="custom-select" id="modelSelectCustom">
            <div class="custom-select-trigger" id="modelSelectTrigger">載入中...</div>
            <div class="custom-select-options" id="modelSelectOptions"></div>
          </div>
        </div>
        <div class="toolbar-right">
          <button class="stop-icon-btn" id="stop" hidden title="Stop generating">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h8v8H4z" fill="currentColor"/></svg>
          </button>
          <button class="send-icon-btn" id="send" title="Send (Enter)">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 13.5v-10l-4 4L3.8 6.8 8 2.6l4.2 4.2-.7.7-4-4v10h1z" fill="currentColor"/></svg>
          </button>
        </div>
      </div>
    </div>
    <input type="file" id="imageInput" accept="image/*" multiple hidden />
  </div>

  <script nonce="__NONCE__">__JS__</script>
</body>
</html>`;
