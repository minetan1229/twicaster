import { CapturedStream, Message, MessageType, DownloadProgress, RecordingState, CurrentTimeInfo, DownloadHistoryItem } from '../shared/types';
import { parseTimeInput, formatTime, validateTimeRange } from '../shared/time';

let currentStream: CapturedStream | null = null;
let streams: CapturedStream[] = [];
let history: DownloadHistoryItem[] = [];
let activeTab: 'streams' | 'history' = 'streams';
let confirmCallback: (() => void) | null = null;

const elements = {
  tabs: document.querySelectorAll('.tab') as NodeListOf<HTMLButtonElement>,
  tabPanels: document.querySelectorAll('.tab-panel') as NodeListOf<HTMLDivElement>,
  streamLists: {
    streams: document.getElementById('streams')!,
    history: document.getElementById('history-streams')!,
  },
  emptyStates: {
    streams: document.getElementById('empty-state')!,
    history: document.getElementById('history-empty')!,
  },
  streamDetail: document.getElementById('stream-detail')!,
  backBtn: document.getElementById('back-btn') as HTMLButtonElement,
  clearAllBtn: document.getElementById('clear-all-btn') as HTMLButtonElement,
  streamTitle: document.getElementById('stream-title')!,
  streamUrl: document.getElementById('stream-url')!,
  streamLiveInfo: document.getElementById('stream-live-info')!,
  qualitySelect: document.getElementById('quality-select') as HTMLSelectElement,
  startSeconds: document.getElementById('start-seconds') as HTMLInputElement,
  startHhmmss: document.getElementById('start-hhmmss') as HTMLInputElement,
  endSeconds: document.getElementById('end-seconds') as HTMLInputElement,
  endHhmmss: document.getElementById('end-hhmmss') as HTMLInputElement,
  startPresets: document.getElementById('start-presets')!,
  endPresets: document.getElementById('end-presets')!,
  durationDisplay: document.getElementById('duration-display')!,
  outputFilename: document.getElementById('output-filename') as HTMLInputElement,
  downloadBtn: document.getElementById('download-btn') as HTMLButtonElement,
  downloadAllBtn: document.getElementById('download-all-btn') as HTMLButtonElement,
  progressContainer: document.getElementById('progress-container')!,
  progressFill: document.getElementById('progress-fill')!,
  progressMessage: document.getElementById('progress-message')!,
  progressDetail: document.getElementById('progress-detail')!,
  errorMessage: document.getElementById('error-message')!,
  aboutBtn: document.getElementById('about-btn') as HTMLButtonElement,
  aboutModal: document.getElementById('about-modal')!,
  confirmModal: document.getElementById('confirm-modal')!,
  confirmMessage: document.getElementById('confirm-message')!,
  confirmOk: document.getElementById('confirm-ok') as HTMLButtonElement,
  confirmCancel: document.getElementById('confirm-cancel') as HTMLButtonElement,
  modalCloseButtons: document.querySelectorAll('.modal-close') as NodeListOf<HTMLButtonElement>,
  modalBackdrops: document.querySelectorAll('.modal-backdrop') as NodeListOf<HTMLDivElement>,
  version: document.getElementById('version')!,
  modalVersion: document.getElementById('modal-version')!,
  storageInfo: document.getElementById('storage-info')!,
};

function showTab(tab: 'streams' | 'history'): void {
  activeTab = tab;
  currentStream = null;
  
  elements.tabs.forEach(t => {
    const isActive = t.dataset.tab === tab;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  
  showStreamList();
}

function showStreamList(): void {
  elements.streamDetail.classList.add('hidden');
  
  elements.tabPanels.forEach(p => {
    const isActive = p.dataset.tab === activeTab;
    p.classList.toggle('active', isActive);
    p.classList.toggle('hidden', !isActive);
  });
  
  const emptyState = elements.emptyStates[activeTab];
  const streamList = elements.streamLists[activeTab];
  
  renderStreamList();
  
  const hasItems = activeTab === 'streams' ? streams.length > 0 : history.length > 0;
  if (!hasItems) {
    emptyState.classList.remove('hidden');
    streamList.classList.add('hidden');
  } else {
    emptyState.classList.add('hidden');
    streamList.classList.remove('hidden');
  }
}

function showStreamDetail(stream: CapturedStream): void {
  currentStream = stream;
  elements.tabPanels.forEach(p => p.classList.add('hidden'));
  elements.streamDetail.classList.remove('hidden');
  
  elements.streamTitle.textContent = stream.tabTitle;
  elements.streamUrl.textContent = stream.masterUrl;
  
  const duration = stream.duration || 0;
  const endTime = duration > 0 ? duration : 0;
  
  elements.startSeconds.value = '0';
  elements.startHhmmss.value = '00:00:00';
  elements.endSeconds.value = endTime.toString();
  elements.endHhmmss.value = formatTime(endTime);
  updateDurationDisplay();
  
  const baseName = stream.videoId || `twicast_${Date.now()}`;
  elements.outputFilename.value = `${baseName}.mp4`;
  
  elements.qualitySelect.innerHTML = '<option value="auto">Auto (最高画質)</option>';
  if (stream.variants) {
    for (const variant of stream.variants) {
      if (variant.height) {
        const option = document.createElement('option');
        option.value = `${variant.height}p`;
        option.textContent = `${variant.height}p (${Math.round(variant.bandwidth / 1000)} kbps)`;
        elements.qualitySelect.appendChild(option);
      }
    }
  }
  
  renderPresets(stream);
  
  if (stream.type === 'live' && stream.liveInfo) {
    elements.streamLiveInfo.classList.remove('hidden');
    const info = stream.liveInfo;
    let liveInfoText = '🔴 LIVE';
    if (info.programDateTime) {
      liveInfoText += ` | 開始: ${info.programDateTime.toLocaleString('ja-JP')}`;
    }
    if (info.canSkipUntil !== undefined) {
      const skipDate = new Date(info.canSkipUntil * 1000);
      liveInfoText += ` | 遡及限界: ${skipDate.toLocaleTimeString('ja-JP')}`;
    }
    elements.streamLiveInfo.textContent = liveInfoText;
  } else {
    elements.streamLiveInfo.classList.add('hidden');
  }
  
  elements.downloadBtn.disabled = false;
  elements.downloadAllBtn.disabled = false;
  resetProgress();
}

function renderPresets(stream: CapturedStream): void {
  const duration = stream.duration || 0;
  const isLive = stream.type === 'live';
  const serverTime = stream.liveInfo?.serverTime ? stream.liveInfo.serverTime * 1000 : Date.now();
  const now = Math.min(serverTime, Date.now());
  const programStart = stream.liveInfo?.programDateTime?.getTime() || now - duration * 1000;
  const currentEndTime = isLive ? Math.floor((now - programStart) / 1000) : duration;

  interface PresetConfig {
    label: string;
    value?: number;
    delta?: number;
    action?: string;
  }

  const startPresets: PresetConfig[] = [
    { label: '00:00:00', value: 0 },
    { label: '現在', value: currentEndTime, action: 'getCurrentTime' },
    { label: '-5分', delta: -300 },
    { label: '-30分', delta: -1800 },
    { label: '-1時間', delta: -3600 },
  ];
  
  if (isLive) {
    startPresets.push({ label: '配信開始', value: 0 });
    if (stream.liveInfo?.canSkipUntil) {
      startPresets.push({ label: '遡及限界', value: Math.floor((stream.liveInfo.canSkipUntil * 1000 - programStart) / 1000) });
    }
  } else {
    startPresets.push({ label: '最大(全長)', value: duration });
  }
  
  const endPresets: PresetConfig[] = [
    { label: '全長', value: duration },
    { label: '現在', value: currentEndTime, action: 'getCurrentTime' },
    { label: '+5分', delta: 300 },
    { label: '+30分', delta: 1800 },
    { label: '+1時間', delta: 3600 },
  ];
  
  if (!isLive) {
    endPresets.push({ label: '最大(全長)', value: duration });
  }
  
  elements.startPresets.innerHTML = startPresets.map(p => 
    `<button type="button" class="btn btn-preset" ${p.value !== undefined ? `data-value="${p.value}"` : ''} ${p.delta !== undefined ? `data-delta="${p.delta}"` : ''} ${p.action ? `data-action="${p.action}"` : ''}>${p.label}</button>`
  ).join('');
  
  elements.endPresets.innerHTML = endPresets.map(p => 
    `<button type="button" class="btn btn-preset" ${p.value !== undefined ? `data-value="${p.value}"` : ''} ${p.delta !== undefined ? `data-delta="${p.delta}"` : ''} ${p.action ? `data-action="${p.action}"` : ''}>${p.label}</button>`
  ).join('');
  
  elements.startPresets.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', async () => {
      const btnEl = btn as HTMLElement;
      const action = btnEl.dataset.action;
      if (action === 'getCurrentTime' && currentStream) {
        chrome.runtime.sendMessage(
          { type: MessageType.GET_CURRENT_TIME, payload: { streamId: currentStream!.id } },
          (response: Message | undefined) => {
            const value = (response && response.type === MessageType.CURRENT_TIME_RESPONSE && response.payload)
              ? (response.payload as CurrentTimeInfo).currentTime
              : parseFloat(btnEl.dataset.value || '0');
            elements.startSeconds.value = value.toString();
            elements.startHhmmss.value = formatTime(value);
            updateDurationDisplay();
          }
        );
        return;
      }

      if (btnEl.dataset.delta !== undefined) {
        const delta = parseFloat(btnEl.dataset.delta);
        let current: number;
        try {
          current = parseTimeInput(elements.startSeconds.value || elements.startHhmmss.value);
        } catch {
          current = 0;
        }
        const maxVal = duration || Infinity;
        const nextVal = Math.max(0, Math.min(maxVal, current + delta));
        elements.startSeconds.value = nextVal.toString();
        elements.startHhmmss.value = formatTime(nextVal);
        updateDurationDisplay();
        return;
      }

      const value = parseFloat(btnEl.dataset.value || '0');
      elements.startSeconds.value = value.toString();
      elements.startHhmmss.value = formatTime(value);
      updateDurationDisplay();
    });
  });
  
  elements.endPresets.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', async () => {
      const btnEl = btn as HTMLElement;
      const action = btnEl.dataset.action;
      if (action === 'getCurrentTime' && currentStream) {
        chrome.runtime.sendMessage(
          { type: MessageType.GET_CURRENT_TIME, payload: { streamId: currentStream!.id } },
          (response: Message | undefined) => {
            const value = (response && response.type === MessageType.CURRENT_TIME_RESPONSE && response.payload)
              ? (response.payload as CurrentTimeInfo).currentTime
              : parseFloat(btnEl.dataset.value || duration.toString());
            elements.endSeconds.value = value.toString();
            elements.endHhmmss.value = formatTime(value);
            updateDurationDisplay();
          }
        );
        return;
      }

      if (btnEl.dataset.delta !== undefined) {
        const delta = parseFloat(btnEl.dataset.delta);
        let current: number;
        try {
          current = parseTimeInput(elements.endSeconds.value || elements.endHhmmss.value);
        } catch {
          current = 0;
        }
        const maxVal = duration || Infinity;
        const nextVal = Math.max(0, Math.min(maxVal, current + delta));
        elements.endSeconds.value = nextVal.toString();
        elements.endHhmmss.value = formatTime(nextVal);
        updateDurationDisplay();
        return;
      }

      const value = parseFloat(btnEl.dataset.value || '0');
      elements.endSeconds.value = value.toString();
      elements.endHhmmss.value = formatTime(value);
      updateDurationDisplay();
    });
  });
}

function updateDurationDisplay(): void {
  let start: number;
  let end: number;
  
  try {
    start = parseTimeInput(elements.startSeconds.value || elements.startHhmmss.value);
  } catch {
    start = 0;
  }
  
  try {
    end = parseTimeInput(elements.endSeconds.value || elements.endHhmmss.value);
  } catch {
    end = 0;
  }
  
  const duration = end - start;
  if (duration > 0) {
    elements.durationDisplay.textContent = formatTime(duration);
    elements.durationDisplay.style.color = '#1a73e8';
  } else if (end > 0 && start > 0 && end <= start) {
    elements.durationDisplay.textContent = '終了時間は開始時間より後で指定してください';
    elements.durationDisplay.style.color = '#d93025';
  } else {
    elements.durationDisplay.textContent = '00:00:00';
    elements.durationDisplay.style.color = '#d93025';
  }
  
  const valid = duration > 0 && start >= 0;
  elements.downloadBtn.disabled = !valid || !currentStream;
  elements.downloadAllBtn.disabled = !currentStream;
}

function resetProgress(): void {
  elements.progressContainer.classList.add('hidden');
  elements.progressFill.style.width = '0%';
  elements.progressMessage.textContent = '';
  elements.progressDetail.textContent = '';
  elements.errorMessage.classList.add('hidden');
  elements.errorMessage.textContent = '';
}

function showProgress(progress: DownloadProgress): void {
  elements.progressContainer.classList.remove('hidden');
  elements.progressFill.style.width = `${progress.progress}%`;
  elements.progressMessage.textContent = progress.message;
  
  if (progress.speed !== undefined && progress.eta !== undefined && progress.segmentsDownloaded !== undefined && progress.segmentsTotal !== undefined) {
    const speedMB = (progress.speed / 1024 / 1024).toFixed(2);
    const etaSec = Math.round(progress.eta);
    const etaMin = Math.floor(etaSec / 60);
    const etaSecRem = etaSec % 60;
    const etaStr = etaMin > 0 ? `${etaMin}分${etaSecRem}秒` : `${etaSec}秒`;
    
    elements.progressDetail.textContent = `${speedMB} MB/s · 残り ${etaStr} · ${progress.segmentsDownloaded}/${progress.segmentsTotal} セグメント`;
  }
  
  if (progress.stage === 'error') {
    elements.errorMessage.textContent = progress.error || 'ダウンロードに失敗しました';
    elements.errorMessage.classList.remove('hidden');
    elements.downloadBtn.disabled = false;
    elements.downloadAllBtn.disabled = false;
  }
  
  if (progress.stage === 'complete') {
    setTimeout(() => {
      resetProgress();
      showStreamList();
    }, 2000);
  }
}

function showError(message: string): void {
  elements.errorMessage.textContent = message;
  elements.errorMessage.classList.remove('hidden');
  elements.downloadBtn.disabled = false;
  elements.downloadAllBtn.disabled = false;
}

function renderStreamList(): void {
  const streamList = elements.streamLists[activeTab];
  streamList.innerHTML = '';
  
  if (activeTab === 'history') {
    for (const item of history) {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      
      const statusClass = item.status === 'success' ? 'success' : item.status === 'failed' ? 'failed' : 'pending';
      
      historyItem.innerHTML = `
        <div class="history-item-header">
          <div class="history-item-title">${escapeHtml(item.filename)}</div>
          <span class="history-item-status ${statusClass}">${item.status === 'success' ? '成功' : item.status === 'failed' ? '失敗' : '待機中'}</span>
        </div>
        <div class="history-item-meta">${new Date(item.timestamp).toLocaleString('ja-JP')} · ${(item.fileSize / 1024 / 1024).toFixed(1)} MB</div>
        <div class="history-item-range">${formatTime(item.startTime)} - ${formatTime(item.endTime)}</div>
        ${item.error ? `<div class="history-item-meta" style="color: #d93025;" title="${escapeHtml(item.error)}">エラー: ${escapeHtml(item.error.substring(0, 50))}...</div>` : ''}
        <div class="history-item-actions">
          <button class="btn btn-secondary history-redownload" data-id="${item.id}">再ダウンロード</button>
          <button class="btn btn-secondary history-delete" data-id="${item.id}">削除</button>
        </div>
      `;
      
      historyItem.querySelector('.history-redownload')?.addEventListener('click', (e) => {
        e.stopPropagation();
        redownloadHistory(item.id);
      });
      
      historyItem.querySelector('.history-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteHistoryItem(item.id);
      });
      
      streamList.appendChild(historyItem);
    }
    return;
  }
  
  // 検出されたストリーム一覧（新しいものが上）
  for (const stream of streams) {
    const item = document.createElement('div');
    item.className = 'stream-item';
    item.dataset.id = stream.id;
    
    const time = new Date(stream.timestamp).toLocaleTimeString();
    const typeBadge = stream.type === 'live' 
      ? '<span class="live-badge">LIVE</span>' 
      : '<span class="vod-badge">VOD</span>';
    
    item.innerHTML = `
      <div class="stream-item-header">
        <div class="stream-item-title">${escapeHtml(stream.tabTitle)} ${typeBadge}</div>
        <button class="btn-delete" data-id="${stream.id}" title="削除" aria-label="削除">&times;</button>
      </div>
      <div class="stream-item-meta">${time} · ${stream.videoId || 'Unknown ID'}</div>
    `;
    
    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.btn-delete')) return;
      showStreamDetail(stream);
    });
    
    item.querySelector('.btn-delete')!.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteStream(stream.id);
    });
    
    streamList.appendChild(item);
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function syncTimeInputs(source: 'seconds' | 'hhmmss', startOrEnd: 'start' | 'end'): void {
  const secondsEl = startOrEnd === 'start' ? elements.startSeconds : elements.endSeconds;
  const hhmmssEl = startOrEnd === 'start' ? elements.startHhmmss : elements.endHhmmss;
  
  const sourceValue = source === 'seconds' ? secondsEl.value : hhmmssEl.value;
  const targetEl = source === 'seconds' ? hhmmssEl : secondsEl;
  
  try {
    const seconds = parseTimeInput(sourceValue);
    targetEl.value = source === 'seconds' ? formatTime(seconds) : seconds.toString();
    updateDurationDisplay();
  } catch {
    // Invalid input, don't sync
  }
}

async function loadStreams(): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: MessageType.GET_STREAMS }, (response: Message | undefined) => {
      if (response && response.type === MessageType.STREAMS_LIST) {
        streams = response.payload as CapturedStream[];
        renderStreamList();
      }
      resolve();
    });
  });
}

async function loadHistory(): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: MessageType.GET_HISTORY }, (response: Message | undefined) => {
      if (response && response.type === MessageType.HISTORY_LIST) {
        history = response.payload as DownloadHistoryItem[];
        if (activeTab === 'history') {
          renderStreamList();
        }
      }
      resolve();
    });
  });
}

function deleteStream(streamId: string): void {
  const stream = streams.find(s => s.id === streamId);
  if (!stream) return;
  
  showConfirm(`「${stream.tabTitle}」を削除しますか？`, async () => {
    chrome.runtime.sendMessage({ type: MessageType.DELETE_STREAM, payload: { streamId } });
    streams = streams.filter(s => s.id !== streamId);
    renderStreamList();
    if (currentStream?.id === streamId) {
      showStreamList();
    }
  });
}

function clearAllStreams(): void {
  showConfirm('すべてのストリームを削除しますか？この操作は元に戻せません。', async () => {
    chrome.runtime.sendMessage({ type: MessageType.CLEAR_ALL_STREAMS });
    streams = [];
    currentStream = null;
    renderStreamList();
    showStreamList();
  });
}

function redownloadHistory(historyId: string): void {
  const item = history.find(h => h.id === historyId);
  if (!item) return;
  
  const stream = streams.find(s => s.id === item.streamId);
  if (!stream) {
    showError('ストリームが見つかりません。履歴から再取得してください。');
    return;
  }
  
  showStreamDetail(stream);
  elements.startSeconds.value = item.startTime.toString();
  elements.startHhmmss.value = formatTime(item.startTime);
  elements.endSeconds.value = item.endTime.toString();
  elements.endHhmmss.value = formatTime(item.endTime);
  updateDurationDisplay();
  
  if (elements.streamDetail.classList.contains('hidden')) {
    elements.streamDetail.classList.remove('hidden');
    elements.tabPanels.forEach(p => p.classList.add('hidden'));
  }
}

function deleteHistoryItem(historyId: string): void {
  showConfirm('この履歴項目を削除しますか？', () => {
    chrome.runtime.sendMessage({ type: MessageType.DELETE_HISTORY, payload: { id: historyId } });
    history = history.filter(h => h.id !== historyId);
    renderStreamList();
  });
}

function showConfirm(message: string, callback: () => void): void {
  confirmCallback = callback;
  elements.confirmMessage.textContent = message;
  elements.confirmModal.classList.remove('hidden');
  elements.confirmOk.focus();
}

function hideConfirm(): void {
  elements.confirmModal.classList.add('hidden');
  confirmCallback = null;
}

function showAbout(): void {
  elements.aboutModal.classList.remove('hidden');
}

function hideAbout(): void {
  elements.aboutModal.classList.add('hidden');
}

function updateStorageInfo(): void {
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(estimate => {
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      elements.storageInfo.textContent = `IndexedDB: ${(used / 1024 / 1024).toFixed(1)} MB / ${(quota / 1024 / 1024).toFixed(1)} MB`;
    }).catch(() => {
      elements.storageInfo.textContent = 'IndexedDB: N/A';
    });
  } else {
    elements.storageInfo.textContent = 'IndexedDB: N/A';
  }
}

function setVersion(): void {
  const manifest = chrome.runtime.getManifest();
  elements.version.textContent = manifest.version;
  elements.modalVersion.textContent = manifest.version;
}


elements.clearAllBtn.addEventListener('click', clearAllStreams);

elements.backBtn.addEventListener('click', () => {
  showStreamList();
});

elements.startSeconds.addEventListener('input', () => syncTimeInputs('seconds', 'start'));
elements.startHhmmss.addEventListener('input', () => syncTimeInputs('hhmmss', 'start'));
elements.endSeconds.addEventListener('input', () => syncTimeInputs('seconds', 'end'));
elements.endHhmmss.addEventListener('input', () => syncTimeInputs('hhmmss', 'end'));

elements.downloadBtn.addEventListener('click', async () => {
  if (!currentStream) return;
  
  let startTime: number, endTime: number;
  
  try {
    startTime = parseTimeInput(elements.startSeconds.value || elements.startHhmmss.value);
    endTime = parseTimeInput(elements.endSeconds.value || elements.endHhmmss.value);
  } catch {
    showError('無効な時間形式です');
    return;
  }
  
  const duration = currentStream.duration || Infinity;
  const validation = validateTimeRange(startTime, endTime, duration);
  if (!validation.valid) {
    showError(validation.error || '無効な時間範囲です');
    return;
  }
  
  const outputFilename = elements.outputFilename.value.trim() || 'video.mp4';
  const quality = elements.qualitySelect.value;
  
  elements.downloadBtn.disabled = true;
  elements.downloadAllBtn.disabled = true;
  resetProgress();
  showProgress({ stage: 'fetching', progress: 0, message: 'ダウンロードを準備中...' });
  
  chrome.runtime.sendMessage({
    type: MessageType.DOWNLOAD_STREAM,
    payload: {
      streamId: currentStream.id,
      startTime,
      endTime,
      quality,
      outputFilename,
    },
  });
});

elements.downloadAllBtn.addEventListener('click', async () => {
  if (!currentStream) return;
  const stream = currentStream;
  
  showConfirm(`「${stream.tabTitle}」を全長ダウンロードしますか？`, () => {
    const duration = stream.duration || 0;
    const outputFilename = elements.outputFilename.value.trim() || 'video.mp4';
    const quality = elements.qualitySelect.value;
    
    elements.downloadBtn.disabled = true;
    elements.downloadAllBtn.disabled = true;
    resetProgress();
    showProgress({ stage: 'fetching', progress: 0, message: 'ダウンロードを準備中...' });
    
    chrome.runtime.sendMessage({
      type: MessageType.DOWNLOAD_STREAM,
      payload: {
        streamId: stream.id,
        startTime: 0,
        endTime: duration,
        quality,
        outputFilename,
      },
    });
  });
});

elements.tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    showTab(tab.dataset.tab as 'streams' | 'history');
  });
});

elements.aboutBtn.addEventListener('click', showAbout);

elements.confirmOk.addEventListener('click', () => {
  if (confirmCallback) {
    confirmCallback();
  }
  hideConfirm();
});

elements.confirmCancel.addEventListener('click', hideConfirm);

elements.modalCloseButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    hideAbout();
    hideConfirm();
  });
});

elements.modalBackdrops.forEach(backdrop => {
  backdrop.addEventListener('click', () => {
    hideAbout();
    hideConfirm();
  });
});

chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === MessageType.STREAM_CAPTURED) {
    const stream = message.payload as CapturedStream;
    const existingIndex = streams.findIndex(s => s.id === stream.id);
    if (existingIndex >= 0) {
      streams[existingIndex] = stream;
    } else {
      streams.unshift(stream);
    }
    
    if (activeTab === 'streams') {
      renderStreamList();
      elements.emptyStates.streams.classList.add('hidden');
      elements.streamLists.streams.classList.remove('hidden');
    }
    
    // Update detail view if this stream is currently being viewed
    if (currentStream?.id === stream.id) {
      showStreamDetail(stream);
    }
  }
  
  if (message.type === MessageType.DOWNLOAD_PROGRESS) {
    showProgress(message.payload as DownloadProgress);
  }
  
  if (message.type === MessageType.DOWNLOAD_COMPLETE) {
    showProgress({ stage: 'complete', progress: 100, message: 'ダウンロード完了！' });
  }
  
  if (message.type === MessageType.DOWNLOAD_ERROR) {
    const error = (message.payload as { error?: string })?.error || 'ダウンロードに失敗しました';
    showError(error);
  }
  
  if (message.type === MessageType.RECORDING_STATE_CHANGE) {
    const { streamId, state } = message.payload as { streamId: string; state: RecordingState };
    const stream = streams.find(s => s.id === streamId);
    if (stream) {
      renderStreamList();
      if (currentStream?.id === streamId) {
        if (state === 'stopped') {
          showStreamList();
        }
      }
    }
  }
  
  if (message.type === MessageType.HISTORY_LIST) {
    history = message.payload as DownloadHistoryItem[];
    if (activeTab === 'history') {
      renderStreamList();
    }
  }
});

loadStreams();
loadHistory();
setVersion();
updateStorageInfo();
setInterval(updateStorageInfo, 30000);

console.log('Twicaster popup loaded');