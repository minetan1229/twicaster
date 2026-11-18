// src/shared/types.ts
var MessageType = {
  GET_STREAMS: "GET_STREAMS",
  STREAMS_LIST: "STREAMS_LIST",
  STREAM_CAPTURED: "STREAM_CAPTURED",
  DOWNLOAD_STREAM: "DOWNLOAD_STREAM",
  DOWNLOAD_PROGRESS: "DOWNLOAD_PROGRESS",
  DOWNLOAD_COMPLETE: "DOWNLOAD_COMPLETE",
  DOWNLOAD_ERROR: "DOWNLOAD_ERROR",
  CONTENT_READY: "CONTENT_READY"
};

// src/shared/time.ts
function parseTimeInput(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Empty time input");
  }
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  const parts = trimmed.split(":").map((p) => parseFloat(p.trim()));
  if (parts.some(isNaN)) {
    throw new Error("Invalid time format");
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return Math.round(hours * 3600 + minutes * 60 + seconds);
  }
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return Math.round(minutes * 60 + seconds);
  }
  throw new Error("Invalid time format. Use seconds, MM:SS, or HH:MM:SS");
}
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
function validateTimeRange(start, end, duration) {
  if (start < 0) {
    return { valid: false, error: "Start time cannot be negative" };
  }
  if (end > duration) {
    return { valid: false, error: `End time exceeds video duration (${formatTime(duration)})` };
  }
  if (start >= end) {
    return { valid: false, error: "Start time must be before end time" };
  }
  if (end - start < 1) {
    return { valid: false, error: "Duration must be at least 1 second" };
  }
  return { valid: true, clampedStart: start, clampedEnd: end };
}

// src/popup/popup.ts
var currentStream = null;
var streams = [];
var elements = {
  streamList: document.getElementById("streams"),
  streamDetail: document.getElementById("stream-detail"),
  emptyState: document.getElementById("empty-state"),
  refreshBtn: document.getElementById("refresh-btn"),
  backBtn: document.getElementById("back-btn"),
  streamTitle: document.getElementById("stream-title"),
  streamUrl: document.getElementById("stream-url"),
  qualitySelect: document.getElementById("quality-select"),
  startSeconds: document.getElementById("start-seconds"),
  startHhmmss: document.getElementById("start-hhmmss"),
  endSeconds: document.getElementById("end-seconds"),
  endHhmmss: document.getElementById("end-hhmmss"),
  durationDisplay: document.getElementById("duration-display"),
  outputFilename: document.getElementById("output-filename"),
  downloadBtn: document.getElementById("download-btn"),
  progressContainer: document.getElementById("progress-container"),
  progressFill: document.getElementById("progress-fill"),
  progressMessage: document.getElementById("progress-message"),
  errorMessage: document.getElementById("error-message")
};
function showStreamList() {
  elements.streamDetail.classList.add("hidden");
  elements.emptyState.classList.add("hidden");
  elements.streamList.parentElement.classList.remove("hidden");
  if (streams.length === 0) {
    elements.emptyState.classList.remove("hidden");
    elements.streamList.parentElement.classList.add("hidden");
  }
}
function showStreamDetail(stream) {
  currentStream = stream;
  elements.streamList.parentElement.classList.add("hidden");
  elements.emptyState.classList.add("hidden");
  elements.streamDetail.classList.remove("hidden");
  elements.streamTitle.textContent = stream.tabTitle;
  elements.streamUrl.textContent = stream.masterUrl;
  const duration = stream.duration || 0;
  const endTime = duration > 0 ? duration : 0;
  elements.startSeconds.value = "0";
  elements.startHhmmss.value = "00:00:00";
  elements.endSeconds.value = endTime.toString();
  elements.endHhmmss.value = formatTime(endTime);
  updateDurationDisplay();
  const baseName = stream.videoId || `twicast_${Date.now()}`;
  elements.outputFilename.value = `${baseName}.mp4`;
  elements.qualitySelect.innerHTML = '<option value="auto">Auto (Highest)</option>';
  if (stream.variants) {
    for (const variant of stream.variants) {
      if (variant.height) {
        const option = document.createElement("option");
        option.value = `${variant.height}p`;
        option.textContent = `${variant.height}p (${Math.round(variant.bandwidth / 1e3)} kbps)`;
        elements.qualitySelect.appendChild(option);
      }
    }
  }
  elements.downloadBtn.disabled = false;
  resetProgress();
}
function updateDurationDisplay() {
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
    elements.durationDisplay.style.color = "#1a73e8";
  } else {
    elements.durationDisplay.textContent = "00:00:00";
    elements.durationDisplay.style.color = "#d93025";
  }
  const valid = duration > 0 && start >= 0;
  elements.downloadBtn.disabled = !valid || !currentStream;
}
function resetProgress() {
  elements.progressContainer.classList.add("hidden");
  elements.progressFill.style.width = "0%";
  elements.progressMessage.textContent = "";
  elements.errorMessage.classList.add("hidden");
  elements.errorMessage.textContent = "";
}
function showProgress(progress) {
  elements.progressContainer.classList.remove("hidden");
  elements.progressFill.style.width = `${progress.progress}%`;
  elements.progressMessage.textContent = progress.message;
  if (progress.stage === "error") {
    elements.errorMessage.textContent = progress.error || "Download failed";
    elements.errorMessage.classList.remove("hidden");
    elements.downloadBtn.disabled = false;
  }
  if (progress.stage === "complete") {
    setTimeout(() => {
      resetProgress();
      showStreamList();
    }, 2e3);
  }
}
function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.classList.remove("hidden");
  elements.downloadBtn.disabled = false;
}
async function loadStreams() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: MessageType.GET_STREAMS }, (response) => {
      if (response && response.type === MessageType.STREAMS_LIST) {
        streams = response.payload;
        renderStreamList();
      }
      resolve();
    });
  });
}
function renderStreamList() {
  elements.streamList.innerHTML = "";
  for (const stream of streams) {
    const item = document.createElement("div");
    item.className = "stream-item";
    item.dataset.id = stream.id;
    const time = new Date(stream.timestamp).toLocaleTimeString();
    item.innerHTML = `
      <div class="stream-item-title">${escapeHtml(stream.tabTitle)}</div>
      <div class="stream-item-meta">${time} \xB7 ${stream.videoId || "Unknown ID"}</div>
    `;
    item.addEventListener("click", () => {
      showStreamDetail(stream);
    });
    elements.streamList.appendChild(item);
  }
}
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
function syncTimeInputs(source, startOrEnd) {
  const secondsEl = startOrEnd === "start" ? elements.startSeconds : elements.endSeconds;
  const hhmmssEl = startOrEnd === "start" ? elements.startHhmmss : elements.endHhmmss;
  const sourceValue = source === "seconds" ? secondsEl.value : hhmmssEl.value;
  const targetEl = source === "seconds" ? hhmmssEl : secondsEl;
  try {
    const seconds = parseTimeInput(sourceValue);
    targetEl.value = source === "seconds" ? formatTime(seconds) : seconds.toString();
    updateDurationDisplay();
  } catch {
  }
}
elements.refreshBtn.addEventListener("click", () => {
  loadStreams();
});
elements.backBtn.addEventListener("click", () => {
  showStreamList();
});
elements.startSeconds.addEventListener("input", () => syncTimeInputs("seconds", "start"));
elements.startHhmmss.addEventListener("input", () => syncTimeInputs("hhmmss", "start"));
elements.endSeconds.addEventListener("input", () => syncTimeInputs("seconds", "end"));
elements.endHhmmss.addEventListener("input", () => syncTimeInputs("hhmmss", "end"));
elements.downloadBtn.addEventListener("click", async () => {
  if (!currentStream) return;
  let startTime, endTime;
  try {
    startTime = parseTimeInput(elements.startSeconds.value || elements.startHhmmss.value);
    endTime = parseTimeInput(elements.endSeconds.value || elements.endHhmmss.value);
  } catch (error) {
    showError("Invalid time format");
    return;
  }
  const validation = validateTimeRange(startTime, endTime, currentStream.duration || Infinity);
  if (!validation.valid) {
    showError(validation.error || "Invalid time range");
    return;
  }
  const outputFilename = elements.outputFilename.value.trim() || "video.mp4";
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
      outputFilename
    }
  });
});
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MessageType.STREAM_CAPTURED) {
    const stream = message.payload;
    const existingIndex = streams.findIndex((s) => s.id === stream.id);
    if (existingIndex >= 0) {
      streams[existingIndex] = stream;
    } else {
      streams.unshift(stream);
    }
    renderStreamList();
    elements.emptyState.classList.add("hidden");
    elements.streamList.parentElement.classList.remove("hidden");
  }
  if (message.type === MessageType.DOWNLOAD_PROGRESS) {
    showProgress(message.payload);
  }
  if (message.type === MessageType.DOWNLOAD_COMPLETE) {
    showProgress({ stage: "complete", progress: 100, message: "Download complete!" });
  }
  if (message.type === MessageType.DOWNLOAD_ERROR) {
    const error = message.payload?.error || "Download failed";
    showError(error);
  }
});
loadStreams();
//# sourceMappingURL=popup.js.map
