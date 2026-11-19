import { CapturedStream, Message, MessageType, DownloadProgress, CurrentTimeInfo, PopupState } from '../shared/types';
import { parseTimeInput, formatTime, validateTimeRange } from '../shared/time';

let currentStream: CapturedStream | null = null;
let streams: CapturedStream[] = [];

const POPUP_STATE_STORAGE_KEY = 'twicasterPopupState';

const elements = {
  streamListSection: document.getElementById('stream-list-section')!,
  streams: document.getElementById('streams')!,
  emptyState: document.getElementById('empty-state')!,
  streamDetail: document.getElementById('stream-detail')!,
  backBtn: document.getElementById('back-btn') as HTMLButtonElement,
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
  progressContainer: document.getElementById('progress-container')!,
  progressFill: document.getElementById('progress-fill')!,
  progressMessage: document.getElementById('progress-message')!,
  progressDetail: document.getElementById('progress-detail')!,
  errorMessage: document.getElementById('error-message')!,
  version: document.getElementById('version')!,
  storageInfo: document.getElementById('storage-info')!,
  debugModeToggle: document.getElementById('debug-mode-toggle') as HTMLInputElement,
  debugSection: document.getElementById('debug-section')!,
  debugLogs: document.getElementById('debug-logs')!,
  copyDebugLogsBtn: document.getElementById('copy-debug-logs-btn') as HTMLButtonElement,
  clearDebugLogsBtn: document.getElementById('clear-debug-logs-btn') as HTMLButtonElement,
};

let debugLogsList: string[] = [];

function appendDebugLog(entry: { timestamp: number; source: string; level: string; message: string; details?: unknown }): void {
  const timeStr = new Date(entry.timestamp).toLocaleTimeString();
  const detailStr = entry.details !== undefined ? ` | ${typeof entry.details === 'object' ? JSON.stringify(entry.details) : entry.details}` : '';
  const logLine = `[${timeStr}] [${entry.source}] [${entry.level.toUpperCase()}] ${entry.message}${detailStr}`;
  debugLogsList.push(logLine);
  if (debugLogsList.length > 200) debugLogsList.shift();

  if (!elements.debugSection.classList.contains('hidden')) {
    const div = document.createElement('div');
    div.className = `debug-log-entry ${entry.level}`;
    div.textContent = logLine;
    elements.debugLogs.appendChild(div);
    elements.debugLogs.scrollTop = elements.debugLogs.scrollHeight;
  }
}

function loadDebugLogs(): void {
  chrome.runtime.sendMessage({ type: MessageType.GET_DEBUG_LOGS }, (res: Message | undefined) => {
    if (res && res.type === MessageType.DEBUG_LOGS_RESPONSE && Array.isArray(res.payload)) {
      elements.debugLogs.innerHTML = '';
      debugLogsList = [];
      for (const item of res.payload) {
        appendDebugLog(item);
      }
    }
  });
}

async function savePopupState(): Promise<void> {
  const state: PopupState = {
    currentStreamId: currentStream ? currentStream.id : null,
    startSeconds: elements.startSeconds.value,
    startHhmmss: elements.startHhmmss.value,
    endSeconds: elements.endSeconds.value,
    endHhmmss: elements.endHhmmss.value,
    quality: elements.qualitySelect.value,
    outputFilename: elements.outputFilename.value,
    debugModeEnabled: elements.debugModeToggle.checked,
  };
  try {
    await chrome.storage.local.set({ [POPUP_STATE_STORAGE_KEY]: state });
  } catch {
    // Ignore storage errors
  }
}

async function restorePopupState(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(POPUP_STATE_STORAGE_KEY);
    const state = result[POPUP_STATE_STORAGE_KEY] as PopupState | undefined;
    if (!state) return;

    if (state.debugModeEnabled) {
      elements.debugModeToggle.checked = true;
      elements.debugSection.classList.remove('hidden');
      loadDebugLogs();
    }

    if (state.currentStreamId) {
      const found = streams.find(s => s.id === state.currentStreamId);
      if (found) {
        showStreamDetail(found, true);
        if (state.startSeconds !== undefined) elements.startSeconds.value = state.startSeconds;
        if (state.startHhmmss !== undefined) elements.startHhmmss.value = state.startHhmmss;
        if (state.endSeconds !== undefined) elements.endSeconds.value = state.endSeconds;
        if (state.endHhmmss !== undefined) elements.endHhmmss.value = state.endHhmmss;
        if (state.quality !== undefined) elements.qualitySelect.value = state.quality;
        if (state.outputFilename !== undefined) elements.outputFilename.value = state.outputFilename;
        updateDurationDisplay();
      }
    }
  } catch {
    // Ignore storage errors
  }
}

function showStreamList(): void {
  currentStream = null;
  elements.streamDetail.classList.add('hidden');
  elements.streamListSection.classList.remove('hidden');
  renderStreamList();
  savePopupState();
}

function showStreamDetail(stream: CapturedStream, preserveInputs = false): void {
  currentStream = stream;
  elements.streamListSection.classList.add('hidden');
  elements.streamDetail.classList.remove('hidden');

  elements.streamTitle.textContent = stream.tabTitle;
  elements.streamUrl.textContent = stream.masterUrl;

  const duration = stream.duration || 0;
  const endTime = duration > 0 ? duration : 0;

  if (!preserveInputs) {
    elements.startSeconds.value = '0';
    elements.startHhmmss.value = '00:00:00';
    elements.endSeconds.value = endTime.toString();
    elements.endHhmmss.value = formatTime(endTime);
    updateDurationDisplay();

    const baseName = stream.videoId || `twicast_${Date.now()}`;
    elements.outputFilename.value = `${baseName}.mp4`;
  } else {
    updateDurationDisplay();
  }

  const prevQuality = elements.qualitySelect.value;
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
  if (prevQuality && Array.from(elements.qualitySelect.options).some(o => o.value === prevQuality)) {
    elements.qualitySelect.value = prevQuality;
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
  if (!preserveInputs) {
    resetProgress();
  }
}

function renderPresets(stream: CapturedStream): void {
  const duration = stream.duration || 0;
  const isLive = stream.type === 'live';
  const serverTime = stream.liveInfo?.serverTime ? stream.liveInfo.serverTime * 1000 : Date.now();
  const now = Math.min(serverTime, Date.now());
  const programStart = stream.liveInfo?.programDateTime?.getTime() || now - duration * 1000;
  const currentEndTime = isLive ? Math.max(0, Math.floor((now - programStart) / 1000)) : duration;

  interface PresetConfig {
    label: string;
    value?: number;
    delta?: number;
    action?: string;
  }

  const startPresets: PresetConfig[] = [
    { label: '00:00:00', value: 0 },
    { label: '現在', value: isLive ? currentEndTime : 0, action: 'getCurrentTime' },
    { label: '-5分', delta: -300 },
    { label: '-30分', delta: -1800 },
    { label: '-1時間', delta: -3600 },
  ];

  if (isLive) {
    startPresets.push({ label: '配信開始', value: 0 });
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

  elements.startPresets.innerHTML = startPresets.map(p =>
    `<button type="button" class="btn-preset" ${p.value !== undefined ? `data-value="${p.value}"` : ''} ${p.delta !== undefined ? `data-delta="${p.delta}"` : ''} ${p.action ? `data-action="${p.action}"` : ''}>${p.label}</button>`
  ).join('');

  elements.endPresets.innerHTML = endPresets.map(p =>
    `<button type="button" class="btn-preset" ${p.value !== undefined ? `data-value="${p.value}"` : ''} ${p.delta !== undefined ? `data-delta="${p.delta}"` : ''} ${p.action ? `data-action="${p.action}"` : ''}>${p.label}</button>`
  ).join('');

  elements.startPresets.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', async () => {
      const btnEl = btn as HTMLElement;
      const action = btnEl.dataset.action;
      if (action === 'getCurrentTime' && currentStream) {
        chrome.runtime.sendMessage(
          { type: MessageType.GET_CURRENT_TIME, payload: { streamId: currentStream.id } },
          (response: Message | undefined) => {
            const value = (response && response.type === MessageType.CURRENT_TIME_RESPONSE && response.payload)
              ? (response.payload as CurrentTimeInfo).currentTime
              : parseFloat(btnEl.dataset.value || '0');
            elements.startSeconds.value = value.toString();
            elements.startHhmmss.value = formatTime(value);
            updateDurationDisplay();
            savePopupState();
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
        savePopupState();
        return;
      }

      const value = parseFloat(btnEl.dataset.value || '0');
      elements.startSeconds.value = value.toString();
      elements.startHhmmss.value = formatTime(value);
      updateDurationDisplay();
      savePopupState();
    });
  });

  elements.endPresets.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', async () => {
      const btnEl = btn as HTMLElement;
      const action = btnEl.dataset.action;
      if (action === 'getCurrentTime' && currentStream) {
        chrome.runtime.sendMessage(
          { type: MessageType.GET_CURRENT_TIME, payload: { streamId: currentStream.id } },
          (response: Message | undefined) => {
            const value = (response && response.type === MessageType.CURRENT_TIME_RESPONSE && response.payload)
              ? (response.payload as CurrentTimeInfo).currentTime
              : parseFloat(btnEl.dataset.value || duration.toString());
            elements.endSeconds.value = value.toString();
            elements.endHhmmss.value = formatTime(value);
            updateDurationDisplay();
            savePopupState();
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
        savePopupState();
        return;
      }

      const value = parseFloat(btnEl.dataset.value || '0');
      elements.endSeconds.value = value.toString();
      elements.endHhmmss.value = formatTime(value);
      updateDurationDisplay();
      savePopupState();
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
}

function renderStreamList(): void {
  elements.streams.innerHTML = '';

  if (streams.length === 0) {
    elements.emptyState.classList.remove('hidden');
    elements.streams.classList.add('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.streams.classList.remove('hidden');

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
      savePopupState();
    });

    item.querySelector('.btn-delete')!.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteStream(stream.id);
    });

    elements.streams.appendChild(item);
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
    // 無効な入力時は同期しない
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

function deleteStream(streamId: string): void {
  chrome.runtime.sendMessage({ type: MessageType.DELETE_STREAM, payload: { streamId } });
  streams = streams.filter(s => s.id !== streamId);
  renderStreamList();
  if (currentStream?.id === streamId) {
    showStreamList();
  }
}

function updateStorageInfo(): void {
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(estimate => {
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      elements.storageInfo.textContent = `IndexedDB: ${(used / 1024 / 1024).toFixed(1)} MB / ${(quota / 1024 / 1024).toFixed(1)} MB`;
    }).catch(() => {
      elements.storageInfo.textContent = '';
    });
  } else {
    elements.storageInfo.textContent = '';
  }
}

function setVersion(): void {
  const manifest = chrome.runtime.getManifest();
  elements.version.textContent = manifest.version;
}

function restoreActiveDownload(): void {
  chrome.runtime.sendMessage({ type: MessageType.GET_DOWNLOAD_STATUS }, (res: Message | undefined) => {
    if (res && res.type === MessageType.DOWNLOAD_STATUS_RESPONSE && res.payload) {
      const { streamId, progress } = res.payload as { streamId: string | null; progress: DownloadProgress | null };
      if (streamId && progress) {
        if (!currentStream || currentStream.id !== streamId) {
          const s = streams.find(item => item.id === streamId);
          if (s) {
            showStreamDetail(s, true);
          }
        }
        showProgress(progress);
      }
    }
  });
}

elements.backBtn.addEventListener('click', () => {
  showStreamList();
});

elements.startSeconds.addEventListener('input', () => {
  syncTimeInputs('seconds', 'start');
  savePopupState();
});
elements.startHhmmss.addEventListener('input', () => {
  syncTimeInputs('hhmmss', 'start');
  savePopupState();
});
elements.endSeconds.addEventListener('input', () => {
  syncTimeInputs('seconds', 'end');
  savePopupState();
});
elements.endHhmmss.addEventListener('input', () => {
  syncTimeInputs('hhmmss', 'end');
  savePopupState();
});
elements.qualitySelect.addEventListener('change', () => {
  savePopupState();
});
elements.outputFilename.addEventListener('input', () => {
  savePopupState();
});

elements.debugModeToggle.addEventListener('change', () => {
  if (elements.debugModeToggle.checked) {
    elements.debugSection.classList.remove('hidden');
    loadDebugLogs();
  } else {
    elements.debugSection.classList.add('hidden');
  }
  savePopupState();
});

elements.copyDebugLogsBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(debugLogsList.join('\n')).then(() => {
    elements.copyDebugLogsBtn.textContent = 'コピー完了';
    setTimeout(() => {
      elements.copyDebugLogsBtn.textContent = 'コピー';
    }, 1500);
  });
});

elements.clearDebugLogsBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: MessageType.CLEAR_DEBUG_LOGS }, () => {
    elements.debugLogs.innerHTML = '';
    debugLogsList = [];
  });
});

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
  const isLive = currentStream.type === 'live';
  const validation = validateTimeRange(startTime, endTime, duration, isLive);
  if (!validation.valid) {
    showError(validation.error || '無効な時間範囲です');
    return;
  }

  const outputFilename = elements.outputFilename.value.trim() || 'video.mp4';
  const quality = elements.qualitySelect.value;

  elements.downloadBtn.disabled = true;
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

chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === MessageType.STREAM_CAPTURED) {
    const stream = message.payload as CapturedStream;
    const existingIndex = streams.findIndex(s => s.id === stream.id);
    if (existingIndex >= 0) {
      streams[existingIndex] = stream;
    } else {
      // 開いているものを検知したら上に足していく
      streams.unshift(stream);
    }

    if (!currentStream) {
      renderStreamList();
    } else if (currentStream.id === stream.id) {
      showStreamDetail(stream, true);
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

  if (message.type === MessageType.DEBUG_LOG) {
    appendDebugLog(message.payload as { timestamp: number; source: string; level: string; message: string; details?: unknown });
  }
});

(async () => {
  await loadStreams();
  await restorePopupState();
  restoreActiveDownload();
  setVersion();
  updateStorageInfo();
  setInterval(updateStorageInfo, 30000);
})();

console.log('Twicaster popup loaded');