import { CapturedStream, Message, MessageType } from '../shared/types';
import { buildRequestHeaders } from '../shared/headers';

const capturedStreams = new Map<string, CapturedStream>();
const debuggerTabs = new Set<number>();

function generateStreamId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isMasterM3U8(url: string): boolean {
  return url.includes('master.m3u8');
}

async function attachDebugger(tabId: number): Promise<void> {
  if (debuggerTabs.has(tabId)) return;
  
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
    await chrome.debugger.sendCommand({ tabId }, 'Network.setCacheDisabled', { cacheDisabled: true });
    debuggerTabs.add(tabId);
    console.log(`Debugger attached to tab ${tabId}`);
  } catch (error) {
    console.error('Failed to attach debugger:', error);
    throw error;
  }
}

async function detachDebugger(tabId: number): Promise<void> {
  if (!debuggerTabs.has(tabId)) return;
  
  try {
    await chrome.debugger.detach({ tabId });
    debuggerTabs.delete(tabId);
    console.log(`Debugger detached from tab ${tabId}`);
  } catch (error) {
    console.error('Failed to detach debugger:', error);
  }
}

async function extractCookies(): Promise<string> {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'twitcasting.tv' });
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } catch (error) {
    console.error('Failed to extract cookies:', error);
    return '';
  }
}

async function getTabInfo(tabId: number): Promise<{ title: string; url: string } | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return { title: tab.title || '', url: tab.url || '' };
  } catch {
    return null;
  }
}

function extractVideoId(url: string): string | undefined {
  const match = url.match(/\/([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1] : undefined;
}

chrome.debugger.onEvent.addListener(async (source, method, params?: object) => {
  const tabId = source.tabId;
  
  if (!params || tabId === undefined) return;
  
  const p = params as Record<string, unknown>;
  
  if (method === 'Network.requestWillBeSent') {
    const request = p.request as { url: string; headers: Record<string, string> };
    const documentURL = p.documentURL as string;
    
    if (isMasterM3U8(request.url)) {
      console.log('Captured master.m3u8:', request.url);
      
      const tabInfo = await getTabInfo(tabId);
      const cookieHeader = await extractCookies();
      
      const headers: Record<string, string> = {
        ...request.headers,
        Cookie: cookieHeader || request.headers.Cookie || request.headers.cookie || '',
      };
      
      const streamId = generateStreamId();
      const stream: CapturedStream = {
        id: streamId,
        masterUrl: request.url,
        headers,
        timestamp: Date.now(),
        tabId,
        tabTitle: tabInfo?.title || 'Unknown',
        videoId: extractVideoId(documentURL || ''),
      };
      
      capturedStreams.set(streamId, stream);
      
      const message: Message = {
        type: MessageType.STREAM_CAPTURED,
        payload: stream,
      };
      
      chrome.runtime.sendMessage(message).catch(() => {});
    }
  }
  
  if (method === 'Network.responseReceived') {
    const requestId = p.requestId as string;
    const response = p.response as Record<string, unknown>;
    // We could capture response headers here if needed
  }
});

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (message.type === MessageType.GET_STREAMS) {
    const streams = Array.from(capturedStreams.values());
    sendResponse({ type: MessageType.STREAMS_LIST, payload: streams });
    return true;
  }
  
  if (message.type === MessageType.DOWNLOAD_STREAM) {
    const { streamId, startTime, endTime, quality, outputFilename } = message.payload as {
      streamId: string;
      startTime: number;
      endTime: number;
      quality: string;
      outputFilename: string;
    };
    
    const stream = capturedStreams.get(streamId);
    if (!stream) {
      sendResponse({ type: MessageType.DOWNLOAD_ERROR, payload: { error: 'Stream not found' } });
      return true;
    }
    
    const offscreenReadyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Offscreen document ready timeout')), 10000);
      
      const listener = (msg: Message) => {
        if (msg.type === MessageType.OFFSCREEN_READY) {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(listener);
          resolve();
        }
      };
      chrome.runtime.onMessage.addListener(listener);
    });
    
    chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK', 'CLIPBOARD'] as chrome.offscreen.Reason[],
      justification: 'Required for FFmpeg.wasm video processing',
    }).then(async () => {
      try {
        await offscreenReadyPromise;
        chrome.runtime.sendMessage({
          type: MessageType.DOWNLOAD_STREAM,
          payload: {
            streamId,
            masterUrl: stream.masterUrl,
            headers: stream.headers,
            startTime,
            endTime,
            quality,
            outputFilename,
          },
        });
      } catch (error) {
        sendResponse({ type: MessageType.DOWNLOAD_ERROR, payload: { error: error instanceof Error ? error.message : 'Offscreen document failed to initialize' } });
      }
    }).catch((error) => {
      sendResponse({ type: MessageType.DOWNLOAD_ERROR, payload: { error: error.message } });
    });
    
    return true;
  }
  
  return false;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('twitcasting.tv')) {
    try {
      await attachDebugger(tabId);
    } catch (error) {
      console.error('Failed to auto-attach debugger:', error);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  detachDebugger(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Twicaster extension installed');
});

console.log('Background service worker started');