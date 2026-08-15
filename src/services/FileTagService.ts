export interface FileTagService {
  getTags(path: string): Promise<string[]>;
  setTags(path: string, tags: string[]): Promise<void>;
}

/**
 * Placeholder for macOS Finder-tag sync (README Phase 4). Real read/write requires
 * either an xattr `com.apple.metadata:_kMDItemUserTags` plist implementation or an
 * AppleScript/JXA shell-out — deliberately deferred so it never blocks the MVP.
 */
export class NoopFileTagService implements FileTagService {
  async getTags(): Promise<string[]> {
    return [];
  }

  async setTags(): Promise<void> {
    // intentional no-op for MVP
  }
}
