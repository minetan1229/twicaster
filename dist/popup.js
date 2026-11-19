// src/shared/types.ts
var MessageType = {
  GET_STREAMS: "GET_STREAMS",
  STREAMS_LIST: "STREAMS_LIST",
  STREAM_CAPTURED: "STREAM_CAPTURED",
  DOWNLOAD_STREAM: "DOWNLOAD_STREAM",
  DOWNLOAD_PROGRESS: "DOWNLOAD_PROGRESS",
  DOWNLOAD_COMPLETE: "DOWNLOAD_COMPLETE",
  DOWNLOAD_ERROR: "DOWNLOAD_ERROR",
  CONTENT_READY: "CONTENT_READY",
  CURRENT_TIME_UPDATE: "CURRENT_TIME_UPDATE",
  GET_CURRENT_TIME: "GET_CURRENT_TIME",
  CURRENT_TIME_RESPONSE: "CURRENT_TIME_RESPONSE",
  STOP_RECORDING: "STOP_RECORDING",
  STOP_DOWNLOAD: "STOP_DOWNLOAD",
  RECORDING_STATE_CHANGE: "RECORDING_STATE_CHANGE",
  DELETE_STREAM: "DELETE_STREAM",
  CLEAR_ALL_STREAMS: "CLEAR_ALL_STREAMS",
  GET_HISTORY: "GET_HISTORY",
  HISTORY_LIST: "HISTORY_LIST",
  DELETE_HISTORY: "DELETE_HISTORY",
  OFFSCREEN_READY: "OFFSCREEN_READY",
  CHECK_OFFSCREEN: "CHECK_OFFSCREEN",
  DEBUG_LOG: "DEBUG_LOG",
  GET_DEBUG_LOGS: "GET_DEBUG_LOGS",
  DEBUG_LOGS_RESPONSE: "DEBUG_LOGS_RESPONSE",
  CLEAR_DEBUG_LOGS: "CLEAR_DEBUG_LOGS",
  GET_DOWNLOAD_STATUS: "GET_DOWNLOAD_STATUS",
  DOWNLOAD_STATUS_RESPONSE: "DOWNLOAD_STATUS_RESPONSE"
};

// src/shared/time.ts
function parseTimeInput(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Empty time input");
  }
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
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
  const secInt = Math.floor(seconds % 60);
  const fraction = seconds - Math.floor(seconds);
  const fracStr = fraction > 0.05 ? fraction.toFixed(1).substring(1).replace(/\.0$/, "") : "";
  const secsFormatted = `${secInt.toString().padStart(2, "0")}${fracStr}`;
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secsFormatted}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secsFormatted}`;
}
function validateTimeRange(start, end, duration, isLive) {
  if (start < 0) {
    return { valid: false, error: "Start time cannot be negative" };
  }
  if (!isLive && duration > 0 && end > duration) {
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
var POPUP_STATE_STORAGE_KEY = "twicasterPopupState";
var elements = {
  streamListSection: document.getElementById("stream-list-section"),
  streams: document.getElementById("streams"),
  emptyState: document.getElementById("empty-state"),
  streamDetail: document.getElementById("stream-detail"),
  backBtn: document.getElementById("back-btn"),
  streamTitle: document.getElementById("stream-title"),
  streamUrl: document.getElementById("stream-url"),
  streamLiveInfo: document.getElementById("stream-live-info"),
  qualitySelect: document.getElementById("quality-select"),
  startSeconds: document.getElementById("start-seconds"),
  startHhmmss: document.getElementById("start-hhmmss"),
  endSeconds: document.getElementById("end-seconds"),
  endHhmmss: document.getElementById("end-hhmmss"),
  startPresets: document.getElementById("start-presets"),
  endPresets: document.getElementById("end-presets"),
  durationDisplay: document.getElementById("duration-display"),
  outputFilename: document.getElementById("output-filename"),
  downloadBtn: document.getElementById("download-btn"),
  cancelBtn: document.getElementById("cancel-btn"),
  progressContainer: document.getElementById("progress-container"),
  progressFill: document.getElementById("progress-fill"),
  progressMessage: document.getElementById("progress-message"),
  progressDetail: document.getElementById("progress-detail"),
  errorMessage: document.getElementById("error-message"),
  version: document.getElementById("version"),
  storageInfo: document.getElementById("storage-info"),
  debugModeToggle: document.getElementById("debug-mode-toggle"),
  debugSection: document.getElementById("debug-section"),
  debugLogs: document.getElementById("debug-logs"),
  copyDebugLogsBtn: document.getElementById("copy-debug-logs-btn"),
  clearDebugLogsBtn: document.getElementById("clear-debug-logs-btn")
};
var debugLogsList = [];
function appendDebugLog(entry) {
  const timeStr = new Date(entry.timestamp).toLocaleTimeString();
  const detailStr = entry.details !== void 0 ? ` | ${typeof entry.details === "object" ? JSON.stringify(entry.details) : entry.details}` : "";
  const logLine = `[${timeStr}] [${entry.source}] [${entry.level.toUpperCase()}] ${entry.message}${detailStr}`;
  debugLogsList.push(logLine);
  if (debugLogsList.length > 200) debugLogsList.shift();
  if (!elements.debugSection.classList.contains("hidden")) {
    const div = document.createElement("div");
    div.className = `debug-log-entry ${entry.level}`;
    div.textContent = logLine;
    elements.debugLogs.appendChild(div);
    elements.debugLogs.scrollTop = elements.debugLogs.scrollHeight;
  }
}
function loadDebugLogs() {
  chrome.runtime.sendMessage({ type: MessageType.GET_DEBUG_LOGS }, (res) => {
    if (res && res.type === MessageType.DEBUG_LOGS_RESPONSE && Array.isArray(res.payload)) {
      elements.debugLogs.innerHTML = "";
      debugLogsList = [];
      for (const item of res.payload) {
        appendDebugLog(item);
      }
    }
  });
}
async function savePopupState() {
  const state = {
    currentStreamId: currentStream ? currentStream.id : null,
    startSeconds: elements.startSeconds.value,
    startHhmmss: elements.startHhmmss.value,
    endSeconds: elements.endSeconds.value,
    endHhmmss: elements.endHhmmss.value,
    quality: elements.qualitySelect.value,
    outputFilename: elements.outputFilename.value,
    debugModeEnabled: elements.debugModeToggle.checked
  };
  try {
    await chrome.storage.local.set({ [POPUP_STATE_STORAGE_KEY]: state });
  } catch {
  }
}
async function restorePopupState() {
  try {
    const result = await chrome.storage.local.get(POPUP_STATE_STORAGE_KEY);
    const state = result[POPUP_STATE_STORAGE_KEY];
    if (!state) return;
    if (state.debugModeEnabled) {
      elements.debugModeToggle.checked = true;
      elements.debugSection.classList.remove("hidden");
      loadDebugLogs();
    }
    if (state.currentStreamId) {
      const found = streams.find((s) => s.id === state.currentStreamId);
      if (found) {
        showStreamDetail(found, true);
        if (state.startSeconds !== void 0) elements.startSeconds.value = state.startSeconds;
        if (state.startHhmmss !== void 0) elements.startHhmmss.value = state.startHhmmss;
        if (state.endSeconds !== void 0) elements.endSeconds.value = state.endSeconds;
        if (state.endHhmmss !== void 0) elements.endHhmmss.value = state.endHhmmss;
        if (state.quality !== void 0) elements.qualitySelect.value = state.quality;
        if (state.outputFilename !== void 0) elements.outputFilename.value = state.outputFilename;
        updateDurationDisplay();
      }
    }
  } catch {
  }
}
function showStreamList() {
  currentStream = null;
  elements.streamDetail.classList.add("hidden");
  elements.streamListSection.classList.remove("hidden");
  renderStreamList();
  savePopupState();
}
function showStreamDetail(stream, preserveInputs = false) {
  currentStream = stream;
  elements.streamListSection.classList.add("hidden");
  elements.streamDetail.classList.remove("hidden");
  elements.streamTitle.textContent = stream.tabTitle;
  elements.streamUrl.textContent = stream.masterUrl;
  const duration = stream.duration || 0;
  const endTime = duration > 0 ? duration : 0;
  if (!preserveInputs) {
    elements.startSeconds.value = "0";
    elements.startHhmmss.value = "00:00:00";
    elements.endSeconds.value = endTime.toString();
    elements.endHhmmss.value = formatTime(endTime);
    updateDurationDisplay();
    const baseName = stream.videoId || `twicast_${Date.now()}`;
    elements.outputFilename.value = `${baseName}.mp4`;
  } else {
    updateDurationDisplay();
  }
  const prevQuality = elements.qualitySelect.value;
  elements.qualitySelect.innerHTML = '<option value="auto">Auto (\u6700\u9AD8\u753B\u8CEA)</option>';
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
  if (prevQuality && Array.from(elements.qualitySelect.options).some((o) => o.value === prevQuality)) {
    elements.qualitySelect.value = prevQuality;
  }
  renderPresets(stream);
  if (stream.type === "live" && stream.liveInfo) {
    elements.streamLiveInfo.classList.remove("hidden");
    const info = stream.liveInfo;
    let liveInfoText = "\u{1F534} LIVE";
    if (info.programDateTime) {
      liveInfoText += ` | \u958B\u59CB: ${info.programDateTime.toLocaleString("ja-JP")}`;
    }
    if (info.canSkipUntil !== void 0) {
      const skipDate = new Date(info.canSkipUntil * 1e3);
      liveInfoText += ` | \u9061\u53CA\u9650\u754C: ${skipDate.toLocaleTimeString("ja-JP")}`;
    }
    elements.streamLiveInfo.textContent = liveInfoText;
  } else {
    elements.streamLiveInfo.classList.add("hidden");
  }
  elements.downloadBtn.disabled = false;
  if (!preserveInputs) {
    resetProgress();
  }
}
function renderPresets(stream) {
  const duration = stream.duration || 0;
  const isLive = stream.type === "live";
  const serverTime = stream.liveInfo?.serverTime ? stream.liveInfo.serverTime * 1e3 : Date.now();
  const now = Math.min(serverTime, Date.now());
  const programStart = stream.liveInfo?.programDateTime?.getTime() || now - duration * 1e3;
  const currentEndTime = isLive ? Math.max(0, Math.floor((now - programStart) / 1e3)) : duration;
  const startPresets = [
    { label: "00:00:00", value: 0 },
    { label: "\u73FE\u5728", value: isLive ? currentEndTime : 0, action: "getCurrentTime" },
    { label: "-5\u5206", delta: -300 },
    { label: "-30\u5206", delta: -1800 },
    { label: "-1\u6642\u9593", delta: -3600 }
  ];
  if (isLive) {
    startPresets.push({ label: "\u914D\u4FE1\u958B\u59CB", value: 0 });
  } else {
    startPresets.push({ label: "\u6700\u5927(\u5168\u9577)", value: duration });
  }
  const endPresets = [
    { label: "\u5168\u9577", value: duration },
    { label: "\u73FE\u5728", value: currentEndTime, action: "getCurrentTime" },
    { label: "+5\u5206", delta: 300 },
    { label: "+30\u5206", delta: 1800 },
    { label: "+1\u6642\u9593", delta: 3600 }
  ];
  elements.startPresets.innerHTML = startPresets.map(
    (p) => `<button type="button" class="btn-preset" ${p.value !== void 0 ? `data-value="${p.value}"` : ""} ${p.delta !== void 0 ? `data-delta="${p.delta}"` : ""} ${p.action ? `data-action="${p.action}"` : ""}>${p.label}</button>`
  ).join("");
  elements.endPresets.innerHTML = endPresets.map(
    (p) => `<button type="button" class="btn-preset" ${p.value !== void 0 ? `data-value="${p.value}"` : ""} ${p.delta !== void 0 ? `data-delta="${p.delta}"` : ""} ${p.action ? `data-action="${p.action}"` : ""}>${p.label}</button>`
  ).join("");
  elements.startPresets.querySelectorAll(".btn-preset").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const btnEl = btn;
      const action = btnEl.dataset.action;
      if (action === "getCurrentTime" && currentStream) {
        chrome.runtime.sendMessage(
          { type: MessageType.GET_CURRENT_TIME, payload: { streamId: currentStream.id } },
          (response) => {
            const value2 = response && response.type === MessageType.CURRENT_TIME_RESPONSE && response.payload ? response.payload.currentTime : parseFloat(btnEl.dataset.value || "0");
            elements.startSeconds.value = value2.toString();
            elements.startHhmmss.value = formatTime(value2);
            updateDurationDisplay();
            savePopupState();
          }
        );
        return;
      }
      if (btnEl.dataset.delta !== void 0) {
        const delta = parseFloat(btnEl.dataset.delta);
        let current;
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
      const value = parseFloat(btnEl.dataset.value || "0");
      elements.startSeconds.value = value.toString();
      elements.startHhmmss.value = formatTime(value);
      updateDurationDisplay();
      savePopupState();
    });
  });
  elements.endPresets.querySelectorAll(".btn-preset").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const btnEl = btn;
      const action = btnEl.dataset.action;
      if (action === "getCurrentTime" && currentStream) {
        chrome.runtime.sendMessage(
          { type: MessageType.GET_CURRENT_TIME, payload: { streamId: currentStream.id } },
          (response) => {
            const value2 = response && response.type === MessageType.CURRENT_TIME_RESPONSE && response.payload ? response.payload.currentTime : parseFloat(btnEl.dataset.value || duration.toString());
            elements.endSeconds.value = value2.toString();
            elements.endHhmmss.value = formatTime(value2);
            updateDurationDisplay();
            savePopupState();
          }
        );
        return;
      }
      if (btnEl.dataset.delta !== void 0) {
        const delta = parseFloat(btnEl.dataset.delta);
        let current;
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
      const value = parseFloat(btnEl.dataset.value || "0");
      elements.endSeconds.value = value.toString();
      elements.endHhmmss.value = formatTime(value);
      updateDurationDisplay();
      savePopupState();
    });
  });
}
function updateDurationDisplay() {
  let start;
  let end;
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
  } else if (end > 0 && start > 0 && end <= start) {
    elements.durationDisplay.textContent = "\u7D42\u4E86\u6642\u9593\u306F\u958B\u59CB\u6642\u9593\u3088\u308A\u5F8C\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044";
    elements.durationDisplay.style.color = "#d93025";
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
  elements.progressDetail.textContent = "";
  elements.errorMessage.classList.add("hidden");
  elements.errorMessage.textContent = "";
  elements.cancelBtn.classList.add("hidden");
  elements.downloadBtn.classList.remove("hidden");
}
function showProgress(progress) {
  elements.progressContainer.classList.remove("hidden");
  elements.progressFill.style.width = `${progress.progress}%`;
  elements.progressMessage.textContent = progress.message;
  if (progress.stage !== "complete" && progress.stage !== "error") {
    elements.downloadBtn.classList.add("hidden");
    elements.cancelBtn.classList.remove("hidden");
    elements.cancelBtn.disabled = false;
  }
  if (progress.speed !== void 0 && progress.eta !== void 0 && progress.segmentsDownloaded !== void 0 && progress.segmentsTotal !== void 0) {
    const speedMB = (progress.speed / 1024 / 1024).toFixed(2);
    const etaSec = Math.round(progress.eta);
    const etaMin = Math.floor(etaSec / 60);
    const etaSecRem = etaSec % 60;
    const etaStr = etaMin > 0 ? `${etaMin}\u5206${etaSecRem}\u79D2` : `${etaSec}\u79D2`;
    elements.progressDetail.textContent = `${speedMB} MB/s \xB7 \u6B8B\u308A ${etaStr} \xB7 ${progress.segmentsDownloaded}/${progress.segmentsTotal} \u30BB\u30B0\u30E1\u30F3\u30C8`;
  }
  if (progress.stage === "error") {
    elements.errorMessage.textContent = progress.error || "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
    elements.errorMessage.classList.remove("hidden");
    elements.downloadBtn.classList.remove("hidden");
    elements.downloadBtn.disabled = false;
    elements.cancelBtn.classList.add("hidden");
  }
  if (progress.stage === "complete") {
    elements.downloadBtn.classList.remove("hidden");
    elements.cancelBtn.classList.add("hidden");
    setTimeout(() => {
      resetProgress();
      showStreamList();
    }, 2e3);
  }
}
function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.classList.remove("hidden");
  elements.downloadBtn.classList.remove("hidden");
  elements.downloadBtn.disabled = false;
  elements.cancelBtn.classList.add("hidden");
}
function renderStreamList() {
  elements.streams.innerHTML = "";
  if (streams.length === 0) {
    elements.emptyState.classList.remove("hidden");
    elements.streams.classList.add("hidden");
    return;
  }
  elements.emptyState.classList.add("hidden");
  elements.streams.classList.remove("hidden");
  for (const stream of streams) {
    const item = document.createElement("div");
    item.className = "stream-item";
    item.dataset.id = stream.id;
    const time = new Date(stream.timestamp).toLocaleTimeString();
    const typeBadge = stream.type === "live" ? '<span class="live-badge">LIVE</span>' : '<span class="vod-badge">VOD</span>';
    item.innerHTML = `
      <div class="stream-item-header">
        <div class="stream-item-title">${escapeHtml(stream.tabTitle)} ${typeBadge}</div>
        <button class="btn-delete" data-id="${stream.id}" title="\u524A\u9664" aria-label="\u524A\u9664">&times;</button>
      </div>
      <div class="stream-item-meta">${time} \xB7 ${stream.videoId || "Unknown ID"}</div>
    `;
    item.addEventListener("click", (e) => {
      if (e.target.closest(".btn-delete")) return;
      showStreamDetail(stream);
      savePopupState();
    });
    item.querySelector(".btn-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteStream(stream.id);
    });
    elements.streams.appendChild(item);
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
function deleteStream(streamId) {
  chrome.runtime.sendMessage({ type: MessageType.DELETE_STREAM, payload: { streamId } });
  streams = streams.filter((s) => s.id !== streamId);
  renderStreamList();
  if (currentStream?.id === streamId) {
    showStreamList();
  }
}
function updateStorageInfo() {
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then((estimate) => {
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      elements.storageInfo.textContent = `IndexedDB: ${(used / 1024 / 1024).toFixed(1)} MB / ${(quota / 1024 / 1024).toFixed(1)} MB`;
    }).catch(() => {
      elements.storageInfo.textContent = "";
    });
  } else {
    elements.storageInfo.textContent = "";
  }
}
function setVersion() {
  const manifest = chrome.runtime.getManifest();
  elements.version.textContent = manifest.version;
}
function restoreActiveDownload() {
  chrome.runtime.sendMessage({ type: MessageType.GET_DOWNLOAD_STATUS }, (res) => {
    if (res && res.type === MessageType.DOWNLOAD_STATUS_RESPONSE && res.payload) {
      const { streamId, progress } = res.payload;
      if (streamId && progress) {
        if (!currentStream || currentStream.id !== streamId) {
          const s = streams.find((item) => item.id === streamId);
          if (s) {
            showStreamDetail(s, true);
          }
        }
        showProgress(progress);
      }
    }
  });
}
elements.backBtn.addEventListener("click", () => {
  showStreamList();
});
elements.startSeconds.addEventListener("input", () => {
  syncTimeInputs("seconds", "start");
  savePopupState();
});
elements.startHhmmss.addEventListener("input", () => {
  syncTimeInputs("hhmmss", "start");
  savePopupState();
});
elements.endSeconds.addEventListener("input", () => {
  syncTimeInputs("seconds", "end");
  savePopupState();
});
elements.endHhmmss.addEventListener("input", () => {
  syncTimeInputs("hhmmss", "end");
  savePopupState();
});
elements.qualitySelect.addEventListener("change", () => {
  savePopupState();
});
elements.outputFilename.addEventListener("input", () => {
  savePopupState();
});
elements.debugModeToggle.addEventListener("change", () => {
  if (elements.debugModeToggle.checked) {
    elements.debugSection.classList.remove("hidden");
    loadDebugLogs();
  } else {
    elements.debugSection.classList.add("hidden");
  }
  savePopupState();
});
elements.copyDebugLogsBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(debugLogsList.join("\n")).then(() => {
    elements.copyDebugLogsBtn.textContent = "\u30B3\u30D4\u30FC\u5B8C\u4E86";
    setTimeout(() => {
      elements.copyDebugLogsBtn.textContent = "\u30B3\u30D4\u30FC";
    }, 1500);
  });
});
elements.clearDebugLogsBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: MessageType.CLEAR_DEBUG_LOGS }, () => {
    elements.debugLogs.innerHTML = "";
    debugLogsList = [];
  });
});
elements.downloadBtn.addEventListener("click", async () => {
  if (!currentStream) return;
  let startTime, endTime;
  try {
    startTime = parseTimeInput(elements.startSeconds.value || elements.startHhmmss.value);
    endTime = parseTimeInput(elements.endSeconds.value || elements.endHhmmss.value);
  } catch {
    showError("\u7121\u52B9\u306A\u6642\u9593\u5F62\u5F0F\u3067\u3059");
    return;
  }
  const duration = currentStream.duration || Infinity;
  const isLive = currentStream.type === "live";
  const validation = validateTimeRange(startTime, endTime, duration, isLive);
  if (!validation.valid) {
    showError(validation.error || "\u7121\u52B9\u306A\u6642\u9593\u7BC4\u56F2\u3067\u3059");
    return;
  }
  const outputFilename = elements.outputFilename.value.trim() || "video.mp4";
  const quality = elements.qualitySelect.value;
  elements.downloadBtn.disabled = true;
  resetProgress();
  showProgress({ stage: "fetching", progress: 0, message: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u6E96\u5099\u4E2D..." });
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
elements.cancelBtn.addEventListener("click", () => {
  if (!currentStream) return;
  elements.cancelBtn.disabled = true;
  showProgress({ stage: "error", progress: 0, message: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u505C\u6B62\u4E2D...", error: "\u30E6\u30FC\u30B6\u30FC\u306B\u3088\u3063\u3066\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u304C\u505C\u6B62\u3055\u308C\u307E\u3057\u305F" });
  chrome.runtime.sendMessage({
    type: MessageType.STOP_DOWNLOAD,
    payload: {
      streamId: currentStream.id
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
    if (!currentStream) {
      renderStreamList();
    } else if (currentStream.id === stream.id) {
      showStreamDetail(stream, true);
    }
  }
  if (message.type === MessageType.DOWNLOAD_PROGRESS) {
    showProgress(message.payload);
  }
  if (message.type === MessageType.DOWNLOAD_COMPLETE) {
    showProgress({ stage: "complete", progress: 100, message: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u5B8C\u4E86\uFF01" });
  }
  if (message.type === MessageType.DOWNLOAD_ERROR) {
    const error = message.payload?.error || "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
    showError(error);
  }
  if (message.type === MessageType.DEBUG_LOG) {
    appendDebugLog(message.payload);
  }
});
(async () => {
  await loadStreams();
  await restorePopupState();
  restoreActiveDownload();
  setVersion();
  updateStorageInfo();
  setInterval(updateStorageInfo, 3e4);
})();
console.log("Twicaster popup loaded");
//# sourceMappingURL=popup.js.map
