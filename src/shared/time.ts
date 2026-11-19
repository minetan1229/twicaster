export function parseTimeInput(input: string): number {
  const trimmed = input.trim();
  
  if (!trimmed) {
    throw new Error('Empty time input');
  }
  
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }
  
  const parts = trimmed.split(':').map(p => parseFloat(p.trim()));
  
  if (parts.some(isNaN)) {
    throw new Error('Invalid time format');
  }
  
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return Math.round(hours * 3600 + minutes * 60 + seconds);
  }
  
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return Math.round(minutes * 60 + seconds);
  }
  
  throw new Error('Invalid time format. Use seconds, MM:SS, or HH:MM:SS');
}

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secInt = Math.floor(seconds % 60);
  const fraction = seconds - Math.floor(seconds);
  const fracStr = fraction > 0.05 ? (fraction.toFixed(1).substring(1).replace(/\.0$/, '')) : '';
  const secsFormatted = `${secInt.toString().padStart(2, '0')}${fracStr}`;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secsFormatted}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secsFormatted}`;
}

export function formatTimeLong(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs.toFixed(1)}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs.toFixed(1)}s`;
  }
  return `${secs.toFixed(1)}s`;
}

export function validateTimeRange(
  start: number,
  end: number,
  duration: number,
  isLive?: boolean
): { valid: boolean; error?: string; clampedStart?: number; clampedEnd?: number } {
  if (start < 0) {
    return { valid: false, error: 'Start time cannot be negative' };
  }
  
  if (!isLive && duration > 0 && end > duration) {
    return { valid: false, error: `End time exceeds video duration (${formatTime(duration)})` };
  }
  
  if (start >= end) {
    return { valid: false, error: 'Start time must be before end time' };
  }
  
  if (end - start < 1) {
    return { valid: false, error: 'Duration must be at least 1 second' };
  }
  
  return { valid: true, clampedStart: start, clampedEnd: end };
}

export function syncTimeInputs(secondsInput: string, hhmmssInput: string): { seconds: string; hhmmss: string } {
  try {
    const seconds = parseTimeInput(secondsInput);
    return { seconds: seconds.toString(), hhmmss: formatTime(seconds) };
  } catch {
    try {
      const seconds = parseTimeInput(hhmmssInput);
      return { seconds: seconds.toString(), hhmmss: formatTime(seconds) };
    } catch {
      return { seconds: secondsInput, hhmmss: hhmmssInput };
    }
  }
}