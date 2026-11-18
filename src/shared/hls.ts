import { HLSVariant, HLSSegment, HLSKey, HLSMap, MediaPlaylist } from './types';

function parseResolution(resolution: string): { width: number; height: number } | null {
  const match = resolution.match(/(\d+)x(\d+)/);
  if (!match) return null;
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}

function parseCodecs(codecs: string): string {
  return codecs;
}

function parseBandwidth(bandwidth: string): number {
  return parseInt(bandwidth, 10);
}

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([A-Z0-9-]+)=("(?:[^"\\]|\\.)*"|[^,]+)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }
    attrs[match[1]] = value;
  }
  return attrs;
}

export function parseMasterPlaylist(text: string, baseUrl: string): HLSVariant[] {
  const lines = text.split('\n');
  const variants: HLSVariant[] = [];
  let currentVariant: Partial<HLSVariant> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const attrs = parseAttributes(line.slice('#EXT-X-STREAM-INF:'.length));
      currentVariant = {
        bandwidth: attrs.BANDWIDTH ? parseBandwidth(attrs.BANDWIDTH) : 0,
        codecs: attrs.CODECS ? parseCodecs(attrs.CODECS) : undefined,
      };
      
      if (attrs.RESOLUTION) {
        const res = parseResolution(attrs.RESOLUTION);
        if (res) {
          currentVariant.width = res.width;
          currentVariant.height = res.height;
          currentVariant.resolution = attrs.RESOLUTION;
        }
      }
    } else if (line && !line.startsWith('#')) {
      if (currentVariant.bandwidth !== undefined) {
        const uri = new URL(line, baseUrl).href;
        variants.push({
          uri,
          bandwidth: currentVariant.bandwidth,
          resolution: currentVariant.resolution,
          codecs: currentVariant.codecs,
          height: currentVariant.height,
          width: currentVariant.width,
        });
        currentVariant = {};
      }
    }
  }

  return variants;
}

export function selectHighestQuality(variants: HLSVariant[]): HLSVariant | null {
  if (variants.length === 0) return null;
  
  return variants
    .filter(v => v.height !== undefined && v.width !== undefined)
    .sort((a, b) => {
      const heightDiff = (b.height || 0) - (a.height || 0);
      if (heightDiff !== 0) return heightDiff;
      const widthDiff = (b.width || 0) - (a.width || 0);
      if (widthDiff !== 0) return widthDiff;
      return (b.bandwidth || 0) - (a.bandwidth || 0);
    })[0] || variants.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
}

export function parseMediaPlaylist(text: string, baseUrl: string): MediaPlaylist {
  const lines = text.split('\n');
  const segments: HLSSegment[] = [];
  let targetDuration = 0;
  let mediaSequence = 0;
  let isLive = true;
  let totalDuration = 0;
  let currentKey: HLSKey | null = null;
  let currentMap: HLSMap | null = null;
  let currentSegmentDuration = 0;
  let currentSegmentTitle: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = parseInt(line.split(':')[1], 10);
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = parseInt(line.split(':')[1], 10);
    } else if (line === '#EXT-X-ENDLIST') {
      isLive = false;
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseAttributes(line.slice('#EXT-X-KEY:'.length));
      currentKey = {
        method: attrs.METHOD || 'NONE',
        uri: attrs.URI ? new URL(attrs.URI, baseUrl).href : undefined,
        iv: attrs.IV,
      };
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const attrs = parseAttributes(line.slice('#EXT-X-MAP:'.length));
      currentMap = {
        uri: attrs.URI ? new URL(attrs.URI, baseUrl).href : '',
        byterange: attrs.BYTERANGE,
      };
    } else if (line.startsWith('#EXTINF:')) {
      const parts = line.slice('#EXTINF:'.length).split(',');
      currentSegmentDuration = parseFloat(parts[0]);
      currentSegmentTitle = parts[1]?.trim();
      totalDuration += currentSegmentDuration;
    } else if (line && !line.startsWith('#')) {
      const uri = new URL(line, baseUrl).href;
      segments.push({
        uri,
        duration: currentSegmentDuration,
        title: currentSegmentTitle,
        key: currentKey || undefined,
        map: currentMap || undefined,
      });
      currentSegmentDuration = 0;
      currentSegmentTitle = undefined;
      currentKey = null;
      currentMap = null;
    }
  }

  return {
    segments,
    targetDuration,
    mediaSequence,
    isLive,
    totalDuration,
  };
}

export function selectSegmentsInRange(
  playlist: MediaPlaylist,
  startTime: number,
  endTime: number
): HLSSegment[] {
  let currentTime = 0;
  const selectedSegments: HLSSegment[] = [];

  for (const segment of playlist.segments) {
    const segmentStart = currentTime;
    const segmentEnd = currentTime + segment.duration;
    
    if (segmentEnd > startTime && segmentStart < endTime) {
      selectedSegments.push(segment);
    }
    
    currentTime = segmentEnd;
    
    if (currentTime >= endTime) break;
  }

  return selectedSegments;
}