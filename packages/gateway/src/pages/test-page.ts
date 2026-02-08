/**
 * Test / Diagnostics Page
 * HTML template for the "/test" diagnostic page with connection status,
 * task creation, event log, and API quick-reference.
 */

export function renderTestPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VSMONSTER - Channel Test</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;min-height:100vh;padding:20px;color:#e6edf3}
    .grid{max-width:900px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:20px}
    .full{grid-column:1/-1}
    h1{text-align:center;margin-bottom:6px;font-size:24px}
    .subtitle{text-align:center;color:#7d8590;margin-bottom:24px;font-size:13px}
    .card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px}
    .card h2{font-size:16px;margin-bottom:14px;color:#58a6ff}
    label{display:block;margin-bottom:6px;font-weight:500;color:#7d8590;font-size:13px}
    input,textarea,select{width:100%;padding:10px 12px;border:1px solid #30363d;border-radius:6px;background:#0d1117;color:#e6edf3;font-size:14px;margin-bottom:12px}
    textarea{min-height:80px;resize:vertical}
    .btn{width:100%;padding:12px;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;transition:.15s}
    .btn-primary{background:#238636;color:#fff}
    .btn-primary:hover{background:#2ea043}
    .btn-blue{background:#1f6feb;color:#fff}
    .btn-blue:hover{background:#388bfd}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .status-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #21262d}
    .status-row:last-child{border-bottom:none}
    .dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    .dot.green{background:#3fb950}
    .dot.red{background:#f85149}
    .dot.gray{background:#484f58}
    .status-label{flex:1;font-size:14px}
    .status-val{font-size:13px;color:#7d8590;font-family:monospace}
    .log{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:12px;max-height:300px;overflow-y:auto;font-family:'SF Mono',Consolas,monospace;font-size:12px;line-height:1.6}
    .log-entry{padding:2px 0}
    .log-time{color:#484f58;margin-right:8px}
    .log-ok{color:#3fb950}
    .log-err{color:#f85149}
    .log-info{color:#58a6ff}
    .result{margin-top:12px;padding:12px;border-radius:6px;font-size:13px;display:none;word-break:break-all}
    .result.ok{background:rgba(63,185,80,.12);border:1px solid #238636;color:#3fb950;display:block}
    .result.err{background:rgba(248,81,73,.12);border:1px solid #f85149;color:#f85149;display:block}
    .tasks-list{max-height:250px;overflow-y:auto}
    .task-item{padding:8px 10px;background:#0d1117;border:1px solid #21262d;border-radius:6px;margin-bottom:6px;font-size:13px}
    .task-id{color:#58a6ff;font-family:monospace}
    .task-status{display:inline-block;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600;margin-left:6px}
    .task-status.pending{background:#30363d;color:#7d8590}
    .task-status.running{background:#1f6feb33;color:#58a6ff}
    .task-status.completed{background:#23863633;color:#3fb950}
  </style>
</head>
<body>
  <h1>VSMONSTER Channel Test</h1>
  <p class="subtitle">Gateway diagnostics &amp; task testing</p>

  <div class="grid">
    <!-- Left: Status -->
    <div class="card">
      <h2>Connection Status</h2>
      <div id="statusPanel">
        <div class="status-row">
          <div class="dot gray" id="dotWs"></div>
          <span class="status-label">WebSocket Clients</span>
          <span class="status-val" id="wsCount">-</span>
        </div>
        <div class="status-row">
          <div class="dot gray" id="dotLine"></div>
          <span class="status-label">LINE Channel</span>
          <span class="status-val" id="lineSt">-</span>
        </div>
        <div class="status-row">
          <div class="dot gray" id="dotTg"></div>
          <span class="status-label">Telegram Channel</span>
          <span class="status-val" id="tgSt">-</span>
        </div>
        <div class="status-row">
          <div class="dot gray" id="dotDc"></div>
          <span class="status-label">Discord Channel</span>
          <span class="status-val" id="dcSt">-</span>
        </div>
        <div class="status-row">
          <div class="dot gray" id="dotTunnel"></div>
          <span class="status-label">Tunnel</span>
          <span class="status-val" id="tunnelSt">-</span>
        </div>
      </div>
    </div>

    <!-- Right: Create Task -->
    <div class="card">
      <h2>Send Test Task</h2>
      <label>Task Instruction</label>
      <textarea id="taskInst" placeholder="e.g. Create a hello world page"></textarea>
      <label>Priority</label>
      <select id="taskPri">
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
        <option value="low">Low</option>
      </select>
      <button class="btn btn-primary" id="sendTaskBtn">Send Task to Extension</button>
      <div id="taskResult" class="result"></div>
    </div>

    <!-- Bottom left: Recent tasks -->
    <div class="card">
      <h2>Recent Tasks</h2>
      <div id="tasksList" class="tasks-list"><span style="color:#484f58">Loading...</span></div>
    </div>

    <!-- Bottom right: Event log -->
    <div class="card">
      <h2>Event Log</h2>
      <div id="eventLog" class="log"><div class="log-entry"><span class="log-time">--:--:--</span><span class="log-info">Waiting for events...</span></div></div>
    </div>

    <!-- Full width: cURL reference -->
    <div class="card full">
      <h2>API Quick Reference</h2>
      <div style="font-family:'SF Mono',Consolas,monospace;font-size:12px;color:#7d8590;line-height:1.8">
        <div style="margin-bottom:8px"><span style="color:#3fb950">POST</span> /api/tasks <span style="color:#484f58">- Create a task (body: { instruction, priority? })</span></div>
        <div style="margin-bottom:8px"><span style="color:#58a6ff">GET</span>&nbsp; /api/tasks <span style="color:#484f58">- List all tasks</span></div>
        <div style="margin-bottom:8px"><span style="color:#58a6ff">GET</span>&nbsp; /api/ws/status <span style="color:#484f58">- WebSocket client connections</span></div>
        <div style="margin-bottom:8px"><span style="color:#58a6ff">GET</span>&nbsp; /api/channels <span style="color:#484f58">- Enabled channels</span></div>
        <div style="margin-bottom:8px;color:#e6edf3">
          curl -X POST http://localhost:3000/api/tasks \\<br>
          &nbsp;&nbsp;-H "Content-Type: application/json" \\<br>
          &nbsp;&nbsp;-d '{"instruction": "Build a login page"}'
        </div>
      </div>
    </div>
  </div>

  <script>
    const byId = id => document.getElementById(id);
    const now = () => new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});

    function addLog(msg, cls) {
      const log = byId('eventLog');
      const d = document.createElement('div');
      d.className = 'log-entry';
      d.innerHTML = '<span class="log-time">' + now() + '</span><span class="log-' + (cls||'info') + '">' + msg + '</span>';
      log.appendChild(d);
      if (log.children.length > 200) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
    }

    // === Poll status ===
    async function refreshStatus() {
      try {
        const [wsRes, chRes, tnRes] = await Promise.all([
          fetch('/api/ws/status').then(r=>r.json()),
          fetch('/api/channels').then(r=>r.json()),
          fetch('/api/tunnel').then(r=>r.json()),
        ]);
        const cnt = wsRes.clientCount || 0;
        byId('wsCount').textContent = cnt + ' client(s)';
        byId('dotWs').className = 'dot ' + (cnt > 0 ? 'green' : 'red');

        const chs = chRes.channels || [];
        const setC = (dotId, valId, name) => {
          const on = chs.includes(name);
          byId(dotId).className = 'dot ' + (on ? 'green' : 'gray');
          byId(valId).textContent = on ? 'Active' : 'Not configured';
        };
        setC('dotLine','lineSt','line');
        setC('dotTg','tgSt','telegram');
        setC('dotDc','dcSt','discord');

        byId('dotTunnel').className = 'dot ' + (tnRes.active ? 'green' : 'gray');
        byId('tunnelSt').textContent = tnRes.active ? tnRes.url : 'Inactive';
      } catch(e) {
        addLog('Failed to fetch status: ' + e.message, 'err');
      }
    }

    // === Poll tasks ===
    async function refreshTasks() {
      try {
        const tasks = await fetch('/api/tasks').then(r=>r.json());
        const list = byId('tasksList');
        if (!tasks || tasks.length === 0) {
          list.innerHTML = '<span style="color:#484f58">No tasks yet</span>';
          return;
        }
        const recent = tasks.slice(-10).reverse();
        list.innerHTML = recent.map(t =>
          '<div class="task-item">' +
            '<span class="task-id">' + t.id + '</span>' +
            '<span class="task-status ' + t.status + '">' + t.status + '</span>' +
            '<div style="color:#7d8590;margin-top:4px">' + (t.instruction||'').substring(0,60) + '</div>' +
          '</div>'
        ).join('');
      } catch(e) {}
    }

    // === Send task ===
    byId('sendTaskBtn').addEventListener('click', async () => {
      const inst = byId('taskInst').value.trim();
      if (!inst) return;
      const btn = byId('sendTaskBtn');
      const result = byId('taskResult');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      result.className = 'result';
      result.style.display = 'none';
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ instruction: inst, priority: byId('taskPri').value }),
        });
        const data = await res.json();
        if (data.success) {
          result.className = 'result ok';
          result.textContent = 'Task created: ' + data.task.id;
          addLog('Task dispatched: ' + data.task.id + ' -> ' + inst.substring(0,40), 'ok');
          byId('taskInst').value = '';
          refreshTasks();
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch(e) {
        result.className = 'result err';
        result.textContent = 'Error: ' + e.message;
        addLog('Task send failed: ' + e.message, 'err');
      }
      btn.disabled = false;
      btn.textContent = 'Send Task to Extension';
    });

    // === WebSocket live events ===
    function connectEventStream() {
      // Holography WebSocket shares the same port as HTTP (e.g. 3000). The previous
      // "+1 port" logic (3001) caused false disconnects and hid live events.
      const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/vscode?client=test-page';
      addLog('Connecting WS: ' + wsUrl + ' ...', 'info');
      try {
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => addLog('WS connected (live event stream)', 'ok');
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'heartbeat' || msg.type === 'pong') return;
            addLog('[' + (msg.type||'unknown') + '] ' + JSON.stringify(msg).substring(0,120), 'info');
            if (msg.type && msg.type.startsWith('task')) refreshTasks();
          } catch(err) {}
        };
        ws.onclose = () => {
          addLog('WS disconnected, retrying in 5s...', 'err');
          setTimeout(connectEventStream, 5000);
        };
        ws.onerror = () => {};
      } catch(e) {
        addLog('WS connection failed', 'err');
        setTimeout(connectEventStream, 5000);
      }
    }

    // Init
    refreshStatus();
    refreshTasks();
    connectEventStream();
    setInterval(refreshStatus, 5000);
    setInterval(refreshTasks, 10000);
    addLog('Test page loaded', 'ok');
  </script>
</body>
</html>`;
}
