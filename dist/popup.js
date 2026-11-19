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
  DELETE_HISTORY: "DELETE_HISTORY"
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
var history = [];
var activeTab = "vod";
var confirmCallback = null;
var elements = {
  tabs: document.querySelectorAll(".tab"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  streamLists: {
    vod: document.getElementById("streams"),
    live: document.getElementById("live-streams"),
    recording: document.getElementById("recording-streams"),
    history: document.getElementById("history-streams")
  },
  emptyStates: {
    vod: document.getElementById("empty-state"),
    live: document.getElementById("live-empty"),
    recording: document.getElementById("recording-empty"),
    history: document.getElementById("history-empty")
  },
  streamDetail: document.getElementById("stream-detail"),
  backBtn: document.getElementById("back-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  clearAllBtn: document.getElementById("clear-all-btn"),
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
  downloadAllBtn: document.getElementById("download-all-btn"),
  progressContainer: document.getElementById("progress-container"),
  progressFill: document.getElementById("progress-fill"),
  progressMessage: document.getElementById("progress-message"),
  progressDetail: document.getElementById("progress-detail"),
  errorMessage: document.getElementById("error-message"),
  aboutBtn: document.getElementById("about-btn"),
  aboutModal: document.getElementById("about-modal"),
  confirmModal: document.getElementById("confirm-modal"),
  confirmMessage: document.getElementById("confirm-message"),
  confirmOk: document.getElementById("confirm-ok"),
  confirmCancel: document.getElementById("confirm-cancel"),
  modalCloseButtons: document.querySelectorAll(".modal-close"),
  modalBackdrops: document.querySelectorAll(".modal-backdrop"),
  version: document.getElementById("version"),
  modalVersion: document.getElementById("modal-version"),
  storageInfo: document.getElementById("storage-info")
};
function getFilteredStreams(type) {
  return streams.filter((s) => {
    if (type === "vod") return s.type === "vod";
    if (type === "live") return s.type === "live";
    if (type === "recording") return s.type === "live";
    return true;
  });
}
function showTab(tab) {
  activeTab = tab;
  elements.tabs.forEach((t) => {
    const isActive = t.dataset.tab === tab;
    t.classList.toggle("active", isActive);
    t.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  elements.tabPanels.forEach((p) => {
    const isActive = p.dataset.tab === tab;
    p.classList.toggle("active", isActive);
    p.classList.toggle("hidden", !isActive);
  });
  renderStreamList();
  if (currentStream) {
    showStreamList();
  }
}
function showStreamList() {
  elements.streamDetail.classList.add("hidden");
  elements.tabPanels.forEach((p) => p.classList.remove("hidden"));
  const emptyState = elements.emptyStates[activeTab];
  const streamList = elements.streamLists[activeTab];
  const filtered = getFilteredStreams(activeTab);
  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    streamList.parentElement.classList.add("hidden");
  } else {
    emptyState.classList.add("hidden");
    streamList.parentElement.classList.remove("hidden");
  }
}
function showStreamDetail(stream) {
  currentStream = stream;
  elements.tabPanels.forEach((p) => p.classList.add("hidden"));
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
  elements.downloadAllBtn.disabled = false;
  resetProgress();
}
function renderPresets(stream) {
  const duration = stream.duration || 0;
  const isLive = stream.type === "live";
  const serverTime = stream.liveInfo?.serverTime ? stream.liveInfo.serverTime * 1e3 : Date.now();
  const now = Math.min(serverTime, Date.now());
  const programStart = stream.liveInfo?.programDateTime?.getTime() || now - duration * 1e3;
  const currentEndTime = isLive ? Math.floor((now - programStart) / 1e3) : duration;
  const startPresets = [
    { label: "00:00:00", value: 0 },
    { label: "\u73FE\u5728", value: currentEndTime, action: "getCurrentTime" },
    { label: "-5\u5206", delta: -300 },
    { label: "-30\u5206", delta: -1800 },
    { label: "-1\u6642\u9593", delta: -3600 }
  ];
  if (isLive) {
    startPresets.push({ label: "\u914D\u4FE1\u958B\u59CB", value: 0 });
    if (stream.liveInfo?.canSkipUntil) {
      startPresets.push({ label: "\u9061\u53CA\u9650\u754C", value: Math.floor((stream.liveInfo.canSkipUntil * 1e3 - programStart) / 1e3) });
    }
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
  if (!isLive) {
    endPresets.push({ label: "\u6700\u5927(\u5168\u9577)", value: duration });
  }
  elements.startPresets.innerHTML = startPresets.map(
    (p) => `<button type="button" class="btn btn-preset" ${p.value !== void 0 ? `data-value="${p.value}"` : ""} ${p.delta !== void 0 ? `data-delta="${p.delta}"` : ""} ${p.action ? `data-action="${p.action}"` : ""}>${p.label}</button>`
  ).join("");
  elements.endPresets.innerHTML = endPresets.map(
    (p) => `<button type="button" class="btn btn-preset" ${p.value !== void 0 ? `data-value="${p.value}"` : ""} ${p.delta !== void 0 ? `data-delta="${p.delta}"` : ""} ${p.action ? `data-action="${p.action}"` : ""}>${p.label}</button>`
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
        return;
      }
      const value = parseFloat(btnEl.dataset.value || "0");
      elements.startSeconds.value = value.toString();
      elements.startHhmmss.value = formatTime(value);
      updateDurationDisplay();
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
        return;
      }
      const value = parseFloat(btnEl.dataset.value || "0");
      elements.endSeconds.value = value.toString();
      elements.endHhmmss.value = formatTime(value);
      updateDurationDisplay();
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
  elements.downloadAllBtn.disabled = !currentStream;
}
function resetProgress() {
  elements.progressContainer.classList.add("hidden");
  elements.progressFill.style.width = "0%";
  elements.progressMessage.textContent = "";
  elements.progressDetail.textContent = "";
  elements.errorMessage.classList.add("hidden");
  elements.errorMessage.textContent = "";
}
function showProgress(progress) {
  elements.progressContainer.classList.remove("hidden");
  elements.progressFill.style.width = `${progress.progress}%`;
  elements.progressMessage.textContent = progress.message;
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
    elements.downloadBtn.disabled = false;
    elements.downloadAllBtn.disabled = false;
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
  elements.downloadAllBtn.disabled = false;
}
function renderStreamList() {
  const filtered = getFilteredStreams(activeTab);
  const streamList = elements.streamLists[activeTab];
  streamList.innerHTML = "";
  if (activeTab === "history") {
    for (const item of history) {
      const historyItem = document.createElement("div");
      historyItem.className = "history-item";
      const statusClass = item.status === "success" ? "success" : item.status === "failed" ? "failed" : "pending";
      historyItem.innerHTML = `
        <div class="history-item-header">
          <div class="history-item-title">${escapeHtml(item.filename)}</div>
          <span class="history-item-status ${statusClass}">${item.status === "success" ? "\u6210\u529F" : item.status === "failed" ? "\u5931\u6557" : "\u5F85\u6A5F\u4E2D"}</span>
        </div>
        <div class="history-item-meta">${new Date(item.timestamp).toLocaleString("ja-JP")} \xB7 ${(item.fileSize / 1024 / 1024).toFixed(1)} MB</div>
        <div class="history-item-range">${formatTime(item.startTime)} - ${formatTime(item.endTime)}</div>
        ${item.error ? `<div class="history-item-meta" style="color: #d93025;" title="${escapeHtml(item.error)}">\u30A8\u30E9\u30FC: ${escapeHtml(item.error.substring(0, 50))}...</div>` : ""}
        <div class="history-item-actions">
          <button class="btn btn-secondary history-redownload" data-id="${item.id}">\u518D\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9</button>
          <button class="btn btn-secondary history-delete" data-id="${item.id}">\u524A\u9664</button>
        </div>
      `;
      historyItem.querySelector(".history-redownload")?.addEventListener("click", (e) => {
        e.stopPropagation();
        redownloadHistory(item.id);
      });
      historyItem.querySelector(".history-delete")?.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteHistoryItem(item.id);
      });
      streamList.appendChild(historyItem);
    }
    return;
  }
  for (const stream of filtered) {
    const item = document.createElement("div");
    item.className = "stream-item";
    item.dataset.id = stream.id;
    const time = new Date(stream.timestamp).toLocaleTimeString();
    let liveBadge = "";
    if (stream.type === "live") {
      liveBadge = '<span class="live-badge">LIVE</span>';
    }
    item.innerHTML = `
      <div class="stream-item-header">
        <div class="stream-item-title">${escapeHtml(stream.tabTitle)} ${liveBadge}</div>
        <button class="btn-delete" data-id="${stream.id}" title="\u524A\u9664" aria-label="\u524A\u9664">&times;</button>
      </div>
      <div class="stream-item-meta">${time} \xB7 ${stream.videoId || "Unknown ID"}</div>
    `;
    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-delete")) return;
      showStreamDetail(stream);
    });
    item.querySelector(".btn-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteStream(stream.id);
    });
    streamList.appendChild(item);
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
async function loadHistory() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: MessageType.GET_HISTORY }, (response) => {
      if (response && response.type === MessageType.HISTORY_LIST) {
        history = response.payload;
        if (activeTab === "history") {
          renderStreamList();
        }
      }
      resolve();
    });
  });
}
function deleteStream(streamId) {
  const stream = streams.find((s) => s.id === streamId);
  if (!stream) return;
  showConfirm(`\u300C${stream.tabTitle}\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F`, async () => {
    chrome.runtime.sendMessage({ type: MessageType.DELETE_STREAM, payload: { streamId } });
    streams = streams.filter((s) => s.id !== streamId);
    renderStreamList();
    if (currentStream?.id === streamId) {
      showStreamList();
    }
  });
}
function clearAllStreams() {
  showConfirm("\u3059\u3079\u3066\u306E\u30B9\u30C8\u30EA\u30FC\u30E0\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\u3053\u306E\u64CD\u4F5C\u306F\u5143\u306B\u623B\u305B\u307E\u305B\u3093\u3002", async () => {
    chrome.runtime.sendMessage({ type: MessageType.CLEAR_ALL_STREAMS });
    streams = [];
    currentStream = null;
    renderStreamList();
    showStreamList();
  });
}
function redownloadHistory(historyId) {
  const item = history.find((h) => h.id === historyId);
  if (!item) return;
  const stream = streams.find((s) => s.id === item.streamId);
  if (!stream) {
    showError("\u30B9\u30C8\u30EA\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u5C65\u6B74\u304B\u3089\u518D\u53D6\u5F97\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    return;
  }
  showStreamDetail(stream);
  elements.startSeconds.value = item.startTime.toString();
  elements.startHhmmss.value = formatTime(item.startTime);
  elements.endSeconds.value = item.endTime.toString();
  elements.endHhmmss.value = formatTime(item.endTime);
  updateDurationDisplay();
  if (elements.streamDetail.classList.contains("hidden")) {
    elements.streamDetail.classList.remove("hidden");
    elements.tabPanels.forEach((p) => p.classList.add("hidden"));
  }
}
function deleteHistoryItem(historyId) {
  showConfirm("\u3053\u306E\u5C65\u6B74\u9805\u76EE\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F", () => {
    chrome.runtime.sendMessage({ type: MessageType.DELETE_HISTORY, payload: { id: historyId } });
    history = history.filter((h) => h.id !== historyId);
    renderStreamList();
  });
}
function showConfirm(message, callback) {
  confirmCallback = callback;
  elements.confirmMessage.textContent = message;
  elements.confirmModal.classList.remove("hidden");
  elements.confirmOk.focus();
}
function hideConfirm() {
  elements.confirmModal.classList.add("hidden");
  confirmCallback = null;
}
function showAbout() {
  elements.aboutModal.classList.remove("hidden");
}
function hideAbout() {
  elements.aboutModal.classList.add("hidden");
}
function updateStorageInfo() {
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then((estimate) => {
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      elements.storageInfo.textContent = `IndexedDB: ${(used / 1024 / 1024).toFixed(1)} MB / ${(quota / 1024 / 1024).toFixed(1)} MB`;
    }).catch(() => {
      elements.storageInfo.textContent = "IndexedDB: N/A";
    });
  } else {
    elements.storageInfo.textContent = "IndexedDB: N/A";
  }
}
function setVersion() {
  const manifest = chrome.runtime.getManifest();
  elements.version.textContent = manifest.version;
  elements.modalVersion.textContent = manifest.version;
}
elements.refreshBtn.addEventListener("click", () => {
  loadStreams();
});
elements.clearAllBtn.addEventListener("click", clearAllStreams);
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
  } catch {
    showError("\u7121\u52B9\u306A\u6642\u9593\u5F62\u5F0F\u3067\u3059");
    return;
  }
  const duration = currentStream.duration || Infinity;
  const validation = validateTimeRange(startTime, endTime, duration);
  if (!validation.valid) {
    showError(validation.error || "\u7121\u52B9\u306A\u6642\u9593\u7BC4\u56F2\u3067\u3059");
    return;
  }
  const outputFilename = elements.outputFilename.value.trim() || "video.mp4";
  const quality = elements.qualitySelect.value;
  elements.downloadBtn.disabled = true;
  elements.downloadAllBtn.disabled = true;
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
elements.downloadAllBtn.addEventListener("click", async () => {
  if (!currentStream) return;
  const stream = currentStream;
  showConfirm(`\u300C${stream.tabTitle}\u300D\u3092\u5168\u9577\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3059\u304B\uFF1F`, () => {
    const duration = stream.duration || 0;
    const outputFilename = elements.outputFilename.value.trim() || "video.mp4";
    const quality = elements.qualitySelect.value;
    elements.downloadBtn.disabled = true;
    elements.downloadAllBtn.disabled = true;
    resetProgress();
    chrome.runtime.sendMessage({
      type: MessageType.DOWNLOAD_STREAM,
      payload: {
        streamId: stream.id,
        startTime: 0,
        endTime: duration,
        quality,
        outputFilename
      }
    });
  });
});
elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    showTab(tab.dataset.tab);
  });
});
elements.aboutBtn.addEventListener("click", showAbout);
elements.confirmOk.addEventListener("click", () => {
  if (confirmCallback) {
    confirmCallback();
  }
  hideConfirm();
});
elements.confirmCancel.addEventListener("click", hideConfirm);
elements.modalCloseButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    hideAbout();
    hideConfirm();
  });
});
elements.modalBackdrops.forEach((backdrop) => {
  backdrop.addEventListener("click", () => {
    hideAbout();
    hideConfirm();
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
    elements.emptyStates[activeTab].classList.add("hidden");
    elements.streamLists[activeTab].parentElement.classList.remove("hidden");
    if (currentStream?.id === stream.id) {
      showStreamDetail(stream);
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
  if (message.type === MessageType.RECORDING_STATE_CHANGE) {
    const { streamId, state } = message.payload;
    const stream = streams.find((s) => s.id === streamId);
    if (stream) {
      renderStreamList();
      if (currentStream?.id === streamId) {
        if (state === "stopped") {
          showStreamList();
        }
      }
    }
  }
  if (message.type === MessageType.HISTORY_LIST) {
    history = message.payload;
    if (activeTab === "history") {
      renderStreamList();
    }
  }
});
loadStreams();
loadHistory();
setVersion();
updateStorageInfo();
setInterval(updateStorageInfo, 3e4);
console.log("Twicaster popup loaded");
//# sourceMappingURL=popup.js.map
