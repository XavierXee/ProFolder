export const DEFAULT_AUDIO_EXTENSIONS = [".wav", ".aiff", ".aif", ".mp3", ".m4a", ".flac", ".ogg"];

export function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0) return "";
  return filename.slice(lastDot).toLowerCase();
}

export function isAudioFile(filename: string, extensions: string[] = DEFAULT_AUDIO_EXTENSIONS): boolean {
  return extensions.includes(getExtension(filename));
}
