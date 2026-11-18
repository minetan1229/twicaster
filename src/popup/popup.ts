import { CapturedStream, Message, MessageType, DownloadProgress, TimeRange } from '../shared/types';
import { parseTimeInput, formatTime, validateTimeRange } from '../shared/time';

let currentStream: CapturedStream | null = null;
let streams: CapturedStream[] = [];

const elements = {
  streamList: document.getElementById('streams')!,
  streamDetail: document.getElementById('stream-detail')!,
  emptyState: document.getElementById('empty-state')!,
  refreshBtn: document.getElementById('refresh-btn') as HTMLButtonElement,
  backBtn: document.getElementById('back-btn') as HTMLButtonElement,
  streamTitle: document.getElementById('stream-title')!,
  streamUrl: document.getElementById('stream-url')!,
  qualitySelect: document.getElementById('quality-select') as HTMLSelectElement,
  startSeconds: document.getElementById('start-seconds') as HTMLInputElement,
  startHhmmss: document.getElementById('start-hhmmss') as HTMLInputElement,
  endSeconds: document.getElementById('end-seconds') as HTMLInputElement,
  endHhmmss: document.getElementById('end-hhmmss') as HTMLInputElement,
  durationDisplay: document.getElementById('duration-display')!,
  outputFilename: document.getElementById('output-filename') as HTMLInputElement,
  downloadBtn: document.getElementById('download-btn') as HTMLButtonElement,
  progressContainer: document.getElementById('progress-container')!,
  progressFill: document.getElementById('progress-fill')!,
  progressMessage: document.getElementById('progress-message')!,
  errorMessage: document.getElementById('error-message')!,
};

function showStreamList(): void {
  elements.streamDetail.classList.add('hidden');
  elements.emptyState.classList.add('hidden');
  elements.streamList.parentElement!.classList.remove('hidden');
  
  if (streams.length === 0) {
    elements.emptyState.classList.remove('hidden');
    elements.streamList.parentElement!.classList.add('hidden');
  }
}

function showStreamDetail(stream: CapturedStream): void {
  currentStream = stream;
  elements.streamList.parentElement!.classList.add('hidden');
  elements.emptyState.classList.add('hidden');
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
  
  elements.qualitySelect.innerHTML = '<option value="auto">Auto (Highest)</option>';
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
  
  elements.downloadBtn.disabled = false;
  resetProgress();
}

function updateDurationDisplay(): void {
  let start = 0, end = 0;
  
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
  elements.errorMessage.classList.add('hidden');
  elements.errorMessage.textContent = '';
}

function showProgress(progress: DownloadProgress): void {
  elements.progressContainer.classList.remove('hidden');
  elements.progressFill.style.width = `${progress.progress}%`;
  elements.progressMessage.textContent = progress.message;
  
  if (progress.stage === 'error') {
    elements.errorMessage.textContent = progress.error || 'Download failed';
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

function renderStreamList(): void {
  elements.streamList.innerHTML = '';
  
  for (const stream of streams) {
    const item = document.createElement('div');
    item.className = 'stream-item';
    item.dataset.id = stream.id;
    
    const time = new Date(stream.timestamp).toLocaleTimeString();
    item.innerHTML = `
      <div class="stream-item-title">${escapeHtml(stream.tabTitle)}</div>
      <div class="stream-item-meta">${time} · ${stream.videoId || 'Unknown ID'}</div>
    `;
    
    item.addEventListener('click', () => {
      showStreamDetail(stream);
    });
    
    elements.streamList.appendChild(item);
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

elements.refreshBtn.addEventListener('click', () => {
  loadStreams();
});

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
  } catch (error) {
    showError('Invalid time format');
    return;
  }
  
  const validation = validateTimeRange(startTime, endTime, currentStream.duration || Infinity);
  if (!validation.valid) {
    showError(validation.error || 'Invalid time range');
    return;
  }
  
  const outputFilename = elements.outputFilename.value.trim() || 'video.mp4';
  const quality = elements.qualitySelect.value;
  
  elements.downloadBtn.disabled = true;
  resetProgress();
  
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
      streams.unshift(stream);
    }
    renderStreamList();
    elements.emptyState.classList.add('hidden');
    elements.streamList.parentElement!.classList.remove('hidden');
  }
  
  if (message.type === MessageType.DOWNLOAD_PROGRESS) {
    showProgress(message.payload as DownloadProgress);
  }
  
  if (message.type === MessageType.DOWNLOAD_COMPLETE) {
    showProgress({ stage: 'complete', progress: 100, message: 'Download complete!' });
  }
  
  if (message.type === MessageType.DOWNLOAD_ERROR) {
    const error = (message.payload as { error?: string })?.error || 'Download failed';
    showError(error);
  }
});

loadStreams();