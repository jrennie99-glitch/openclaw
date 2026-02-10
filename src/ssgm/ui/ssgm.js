/**
 * SSGM Mission Control UI
 * 
 * Real-time dashboard for agent observability
 */

class SSGMController {
  constructor() {
    this.eventSource = null;
    this.currentRunId = null;
    this.reconnectInterval = 5000;
    this.events = [];
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.connectEventStream();
    this.loadRuns();
  }

  setupEventListeners() {
    // Run selector
    document.getElementById('run-selector').addEventListener('change', (e) => {
      this.selectRun(e.target.value);
    });

    // Safe mode toggle
    document.getElementById('safe-mode-toggle').addEventListener('click', () => {
      this.toggleSafeMode();
    });

    // Kill switch
    document.getElementById('kill-switch').addEventListener('click', () => {
      this.triggerKillSwitch();
    });

    // Chat
    document.getElementById('send-btn').addEventListener('click', () => {
      this.sendMessage();
    });

    document.getElementById('message-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });

    // Approval modal
    document.getElementById('approve-btn').addEventListener('click', () => {
      this.handleApproval(true);
    });

    document.getElementById('deny-btn').addEventListener('click', () => {
      this.handleApproval(false);
    });
  }

  connectEventStream() {
    const url = new URL('/ssgm/stream', window.location.origin);
    if (this.currentRunId) {
      url.searchParams.set('runId', this.currentRunId);
    }

    this.eventSource = new EventSource(url.toString());

    this.eventSource.onopen = () => {
      this.updateConnectionStatus(true);
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleEvent(data);
      } catch (err) {
        console.error('Failed to parse event:', err);
      }
    };

    this.eventSource.onerror = () => {
      this.updateConnectionStatus(false);
      this.eventSource.close();
      setTimeout(() => this.connectEventStream(), this.reconnectInterval);
    };
  }

  updateConnectionStatus(connected) {
    const status = document.getElementById('connection-status');
    status.textContent = connected ? 'Connected' : 'Disconnected';
    status.className = `status ${connected ? 'connected' : 'disconnected'}`;
  }

  async loadRuns() {
    try {
      const response = await fetch('/api/ssgm/runs');
      const data = await response.json();
      
      const selector = document.getElementById('run-selector');
      selector.innerHTML = '<option value="">Select Run...</option>';
      
      data.runs?.forEach(run => {
        const option = document.createElement('option');
        option.value = run.id;
        option.textContent = `${run.id.slice(0, 8)} - ${run.status} (${new Date(run.startedAt).toLocaleString()})`;
        selector.appendChild(option);
      });
    } catch (err) {
      console.error('Failed to load runs:', err);
    }
  }

  selectRun(runId) {
    this.currentRunId = runId;
    this.events = [];
    this.clearTimeline();
    
    if (runId) {
      this.loadRunEvents(runId);
      this.loadTaskGraph(runId);
      this.loadWorkspace(runId);
    }

    // Reconnect with run filter
    if (this.eventSource) {
      this.eventSource.close();
    }
    this.connectEventStream();
  }

  async loadRunEvents(runId) {
    try {
      const response = await fetch(`/api/ssgm/runs/${runId}/events`);
      const data = await response.json();
      
      data.events?.forEach(event => {
        this.addTimelineEvent(event);
      });
    } catch (err) {
      console.error('Failed to load events:', err);
    }
  }

  async loadTaskGraph(runId) {
    try {
      const response = await fetch(`/api/ssgm/runs/${runId}/graph`);
      const data = await response.json();
      
      this.renderTaskGraph(data.graph);
    } catch (err) {
      console.error('Failed to load graph:', err);
    }
  }

  async loadWorkspace(runId) {
    try {
      const response = await fetch(`/api/ssgm/runs/${runId}/workspace`);
      const data = await response.json();
      
      this.renderWorkspace(data.snapshot);
    } catch (err) {
      console.error('Failed to load workspace:', err);
    }
  }

  handleEvent(event) {
    this.events.push(event);

    switch (event.type) {
      case 'run.start':
        this.loadRuns();
        break;
      case 'message.send':
      case 'message.receive':
        this.addChatMessage(event);
        break;
      case 'approval.request':
        this.showApprovalModal(event);
        break;
      case 'file.write':
        this.highlightFileChange(event);
        break;
      default:
        this.addTimelineEvent(event);
    }
  }

  addChatMessage(event) {
    const container = document.getElementById('chat-messages');
    const message = document.createElement('div');
    message.className = `message ${event.payload.role || 'assistant'}`;
    message.textContent = event.payload.content || '';
    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
  }

  addTimelineEvent(event) {
    const container = document.getElementById('timeline-container');
    const eventEl = document.createElement('div');
    eventEl.className = `event event-status-${event.payload.status || 'pending'}`;
    
    const timestamp = new Date(event.timestamp).toLocaleTimeString();
    eventEl.innerHTML = `
      <span class="event-timestamp">${timestamp}</span>
      <span class="event-type">${event.type}</span>
      <span class="event-details">${event.payload.name || event.payload.tool || ''}</span>
    `;
    
    container.appendChild(eventEl);
    container.scrollTop = container.scrollHeight;
  }

  clearTimeline() {
    document.getElementById('timeline-container').innerHTML = '';
  }

  renderTaskGraph(graph) {
    const svg = document.getElementById('task-graph');
    svg.innerHTML = '';

    if (!graph?.nodes?.length) return;

    // Simple force-directed layout simulation
    const width = svg.clientWidth || 400;
    const height = svg.clientHeight || 300;
    const nodeRadius = 20;

    // Create node elements
    graph.nodes.forEach((node, i) => {
      const x = (i % 4) * (width / 4) + width / 8;
      const y = Math.floor(i / 4) * 60 + 40;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', nodeRadius);
      circle.setAttribute('fill', this.getNodeColor(node.status));
      circle.setAttribute('stroke', '#00d4ff');
      circle.setAttribute('stroke-width', '2');
      
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', y + 5);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#fff');
      text.setAttribute('font-size', '10');
      text.textContent = node.label.slice(0, 10);
      
      svg.appendChild(circle);
      svg.appendChild(text);
    });

    // Create edges
    graph.edges?.forEach(edge => {
      // Simple edge rendering
    });
  }

  getNodeColor(status) {
    const colors = {
      pending: '#2a2a3a',
      running: '#ffcc00',
      completed: '#00ff88',
      failed: '#ff3366',
      cancelled: '#9966ff'
    };
    return colors[status] || colors.pending;
  }

  renderWorkspace(snapshot) {
    const container = document.getElementById('workspace-files');
    container.innerHTML = '';

    snapshot?.files?.forEach(file => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = `
        <span>${file.path}</span>
        <span>${this.formatBytes(file.sizeBytes)}</span>
      `;
      item.addEventListener('click', () => this.showFileDiff(file));
      container.appendChild(item);
    });
  }

  highlightFileChange(event) {
    const files = document.querySelectorAll('.file-item');
    files.forEach(file => {
      if (file.textContent.includes(event.payload.path)) {
        file.classList.add('modified');
      }
    });
  }

  showFileDiff(file) {
    const viewer = document.getElementById('diff-viewer');
    const content = document.getElementById('diff-content');
    
    content.textContent = file.content || 'No diff available';
    viewer.classList.remove('hidden');
  }

  showApprovalModal(event) {
    const modal = document.getElementById('approval-modal');
    const message = document.getElementById('approval-message');
    const details = document.getElementById('approval-details');

    message.textContent = `Approval required for: ${event.payload.action}`;
    details.textContent = JSON.stringify(event.payload, null, 2);
    
    modal.classList.remove('hidden');
    modal.dataset.approvalId = event.id;
  }

  async handleApproval(approved) {
    const modal = document.getElementById('approval-modal');
    const approvalId = modal.dataset.approvalId;

    try {
      await fetch(`/api/ssgm/approvals/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved })
      });
    } catch (err) {
      console.error('Failed to submit approval:', err);
    }

    modal.classList.add('hidden');
  }

  async toggleSafeMode() {
    try {
      const response = await fetch('/api/ssgm/safety/safe-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true })
      });
      
      const data = await response.json();
      this.updateSafeModeIndicator(data.enabled);
    } catch (err) {
      console.error('Failed to toggle safe mode:', err);
    }
  }

  updateSafeModeIndicator(enabled) {
    const indicator = document.getElementById('safe-mode-indicator');
    indicator.textContent = `Safe Mode: ${enabled ? 'ON' : 'OFF'}`;
    indicator.className = `status ${enabled ? 'safe-on' : 'safe-off'}`;
  }

  async triggerKillSwitch() {
    if (!confirm('⚠️ EMERGENCY: This will immediately stop all agent activity. Continue?')) {
      return;
    }

    try {
      await fetch('/api/ssgm/safety/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activated: true })
      });
      
      const indicator = document.getElementById('kill-switch-indicator');
      indicator.textContent = 'Kill Switch: ACTIVATED';
      indicator.className = 'status kill-on';
    } catch (err) {
      console.error('Failed to trigger kill switch:', err);
    }
  }

  sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    
    if (!content) return;

    // Add to UI immediately
    this.addChatMessage({
      type: 'message.send',
      payload: { role: 'user', content },
      timestamp: new Date().toISOString()
    });

    input.value = '';

    // TODO: Send to backend
    // fetch('/api/ssgm/chat', { method: 'POST', body: JSON.stringify({ message: content }) });
  }

  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

// Initialize controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.ssgm = new SSGMController();
});
