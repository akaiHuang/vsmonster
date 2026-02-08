/**
 * Send Message Page
 * HTML template for the "/send" diagnostic page that allows
 * sending messages to verified social-channel users.
 */

export function renderSendMessagePage(): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UFO - 發送訊息 (Holography)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      padding: 20px;
      color: #fff;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 30px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
    }
    h1 { text-align: center; margin-bottom: 10px; font-size: 28px; }
    h1 span { font-size: 40px; }
    .subtitle { text-align: center; color: #888; margin-bottom: 30px; font-size: 14px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; font-weight: 500; color: #aaa; }
    select, input, textarea {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(0,0,0,0.3);
      color: #fff;
      font-size: 16px;
    }
    textarea { min-height: 120px; resize: vertical; }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { opacity: 0.9; }
    .result { margin-top: 20px; padding: 15px; border-radius: 8px; display: none; }
    .result.success { background: rgba(0,200,100,0.2); border: 1px solid #00c864; display: block; }
    .result.error { background: rgba(200,50,50,0.2); border: 1px solid #c83232; display: block; }
    .users-list { margin-top: 30px; }
    .users-list h3 { margin-bottom: 15px; font-size: 18px; }
    .user-item {
      padding: 10px 15px;
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .user-info { display: flex; align-items: center; gap: 10px; }
    .channel-badge {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .channel-badge.line { background: #00c300; }
    .channel-badge.telegram { background: #0088cc; }
    .channel-badge.discord { background: #5865f2; }
  </style>
</head>
<body>
  <div class="container">
    <h1><span>🛸</span> UFO</h1>
    <p class="subtitle">Powered by Holography</p>

    <form id="sendForm">
      <div class="form-group">
        <label>頻道</label>
        <select id="channel" required>
          <option value="">選擇頻道...</option>
          <option value="line">LINE</option>
          <option value="telegram">Telegram</option>
          <option value="discord">Discord</option>
        </select>
      </div>

      <div class="form-group">
        <label>用戶 ID</label>
        <input type="text" id="userId" placeholder="輸入用戶 ID 或從下方選擇" required>
      </div>

      <div class="form-group">
        <label>訊息</label>
        <textarea id="message" placeholder="輸入要發送的訊息..." required></textarea>
      </div>

      <button type="submit">發送訊息</button>
    </form>

    <div id="result" class="result"></div>

    <div class="users-list">
      <h3>已驗證用戶</h3>
      <div id="usersList">載入中...</div>
    </div>
  </div>

  <script>
    async function loadUsers() {
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        const list = document.getElementById('usersList');

        if (!data.users || data.users.length === 0) {
          list.innerHTML = '<p style="color:#888">尚無已驗證用戶</p>';
          return;
        }

        list.innerHTML = data.users.map(u => \`
          <div class="user-item" onclick="selectUser('\${u.channel}', '\${u.id}')">
            <div class="user-info">
              <span class="channel-badge \${u.channel}">\${u.channel.toUpperCase()}</span>
              <span>\${u.displayName || u.id}</span>
            </div>
            <span style="color:#888">\${u.id.substring(0,10)}...</span>
          </div>
        \`).join('');
      } catch (e) {
        document.getElementById('usersList').innerHTML = '<p style="color:#f66">載入失敗</p>';
      }
    }

    function selectUser(channel, userId) {
      document.getElementById('channel').value = channel;
      document.getElementById('userId').value = userId;
    }

    document.getElementById('sendForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = document.getElementById('result');

      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: document.getElementById('channel').value,
            userId: document.getElementById('userId').value,
            message: document.getElementById('message').value
          })
        });

        const data = await res.json();
        result.className = 'result ' + (data.success ? 'success' : 'error');
        result.textContent = data.success ? '✅ 訊息已發送' : '❌ ' + (data.error || '發送失敗');
      } catch (e) {
        result.className = 'result error';
        result.textContent = '❌ 網路錯誤';
      }
    });

    loadUsers();
    setInterval(loadUsers, 30000);
  </script>
</body>
</html>`;
}
