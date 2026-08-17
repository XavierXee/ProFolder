import type { AudioFile, DawType, Project, TrackStatus } from "../types.js";

const API_BASE = "/api";

export type FileFilters = {
  search?: string;
  status?: TrackStatus;
  hasExport?: boolean;
  tag?: string;
  sortBy?: "name" | "modifiedAt" | "folder";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type PagedFiles = {
  files: AudioFile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type LibraryStats = {
  total: number;
  likelyExports: number;
  needsReview: number;
  draftCount: number;
  lowConfidenceCount: number;
};

export type ScanStats = {
  rootPath: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  foldersScanned: number;
  audioFilesFound: number;
  dawProjectsFound: number;
  likelyExports: number;
  likelySamples: number;
  unknownConfidence: number;
  newFiles: number;
  modifiedFiles: number;
  removedFiles: number;
  errors: { path: string; message: string }[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function encodeId(id: string): string {
  return encodeURIComponent(id);
}

export function getFiles(filters: FileFilters = {}): Promise<PagedFiles> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.hasExport !== undefined) params.set("hasExport", String(filters.hasExport));
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDir) params.set("sortDir", filters.sortDir);
  params.set("page", String(filters.page ?? 1));
  params.set("pageSize", String(filters.pageSize ?? 50));
  const qs = params.toString();
  return request<PagedFiles>(`/files${qs ? `?${qs}` : ""}`);
}

export function getFile(id: string): Promise<AudioFile> {
  return request<AudioFile>(`/files/${encodeId(id)}`);
}

export function updateStatus(id: string, status: TrackStatus): Promise<AudioFile> {
  return request<AudioFile>(`/files/${encodeId(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateTags(id: string, tags: string[]): Promise<AudioFile> {
  return request<AudioFile>(`/files/${encodeId(id)}/tags`, {
    method: "PATCH",
    body: JSON.stringify({ tags }),
  });
}

export type ProjectFilters = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type PagedProjects = {
  projects: (Project & { audioFileCount: number })[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function getProjects(filters: ProjectFilters = {}): Promise<PagedProjects> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  params.set("page", String(filters.page ?? 1));
  params.set("pageSize", String(filters.pageSize ?? 50));
  const qs = params.toString();
  return request<PagedProjects>(`/projects${qs ? `?${qs}` : ""}`);
}

export type NestedDawProjectFile = {
  dawType: DawType;
  path: string;
  relativePath: string;
  detectedVia: string;
};

export type ProjectDetail = Project & {
  audioFiles: AudioFile[];
  subfolderTree: FolderNode;
  dawProjectFiles: NestedDawProjectFile[];
};

export function getProjectDetail(id: string): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/projects/${encodeURIComponent(id)}`);
}

export function triggerScan(): Promise<ScanStats> {
  return request<ScanStats>(`/scan`, { method: "POST", body: JSON.stringify({}) });
}

export function getLastScan(): Promise<ScanStats | undefined> {
  return request<ScanStats>(`/scan/last`).catch(() => undefined);
}

export function reveal(path: string): Promise<void> {
  return request(`/reveal`, { method: "POST", body: JSON.stringify({ path }) });
}

export function getConfig(): Promise<{ musicRoot: string }> {
  return request(`/config`);
}

export function setMusicRoot(musicRoot: string): Promise<{ musicRoot: string }> {
  return request(`/config/music-root`, { method: "PUT", body: JSON.stringify({ musicRoot }) });
}

/** Opens the native macOS folder picker. Resolves with the chosen path, or undefined if the user canceled. */
export async function chooseMusicRoot(): Promise<string | undefined> {
  const result = await request<{ path?: string }>(`/config/music-root/choose`, { method: "POST" });
  return result.path;
}

export type ScanSettings = {
  excludeSamplesFolders: boolean;
  excludeBackupFolders: boolean;
};

export function getScanSettings(): Promise<ScanSettings> {
  return request<ScanSettings>(`/config/scan-settings`);
}

export function setScanSettings(patch: Partial<ScanSettings>): Promise<ScanSettings> {
  return request<ScanSettings>(`/config/scan-settings`, { method: "PUT", body: JSON.stringify(patch) });
}

export function getStats(): Promise<LibraryStats> {
  return request<LibraryStats>(`/stats`);
}

export type FolderNode = {
  name: string;
  path: string;
  type: "folder" | "file";
  children: FolderNode[];
};

export function getFolderTree(): Promise<FolderNode> {
  return request<FolderNode>(`/folders/tree`);
}

export function getExclusions(): Promise<{ excludedPaths: string[] }> {
  return request(`/scan/exclusions`);
}

export function setExclusions(excludedPaths: string[]): Promise<{ excludedPaths: string[] }> {
  return request(`/scan/exclusions`, { method: "PUT", body: JSON.stringify({ excludedPaths }) });
}
