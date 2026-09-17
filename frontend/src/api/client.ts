import type {
  AudioFile,
  CustomTab,
  CustomTabType,
  DawType,
  EntityStats,
  Project,
  ProjectDuplicateMatch,
  TrackStatus,
} from "../types.js";
import { PAGE_SIZE } from "../constants.js";

const API_BASE = "/api";

export type FileFilters = {
  search?: string;
  /** OR'd together (any matching status counts). */
  statuses?: TrackStatus[];
  /** OR'd together; "unscored" matches files with no score set. */
  scores?: (number | "unscored")[];
  /** OR'd together (has any of these tags). */
  tags?: string[];
  sortBy?: "name" | "modifiedAt" | "folder" | "score";
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
  files: EntityStats;
  projects: EntityStats;
};

export type ScanStats = {
  rootPath: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  foldersScanned: number;
  audioFilesFound: number;
  dawProjectsFound: number;
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
  for (const s of filters.statuses ?? []) params.append("status", s);
  for (const s of filters.scores ?? []) params.append("score", String(s));
  for (const t of filters.tags ?? []) params.append("tag", t);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDir) params.set("sortDir", filters.sortDir);
  params.set("page", String(filters.page ?? 1));
  params.set("pageSize", String(filters.pageSize ?? PAGE_SIZE));
  const qs = params.toString();
  return request<PagedFiles>(`/files${qs ? `?${qs}` : ""}`);
}

export function getFile(id: string): Promise<AudioFile> {
  return request<AudioFile>(`/files/${encodeId(id)}`);
}

/** Streaming URL for in-app playback — passed straight to an <audio> element's src,
 * not fetched via `request`. The server supports Range requests, so this also works
 * for seeking. */
export function getFileAudioUrl(id: string): string {
  return `${API_BASE}/files/${encodeId(id)}/audio`;
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

export function updateFileScore(id: string, score: number | null): Promise<AudioFile> {
  return request<AudioFile>(`/files/${encodeId(id)}/score`, {
    method: "PATCH",
    body: JSON.stringify({ score }),
  });
}

export function batchUpdateFileScore(ids: string[], score: number | null): Promise<{ updated: number }> {
  return request(`/files/batch/score`, { method: "PATCH", body: JSON.stringify({ ids, score }) });
}

/** Adds these tags to every listed file (union — a file keeps its own existing tags too). */
export function batchAddFileTags(ids: string[], tags: string[]): Promise<{ updated: number }> {
  return request(`/files/batch/tags`, { method: "PATCH", body: JSON.stringify({ ids, tags }) });
}

/** Shared response shape for every batch copy/move/delete route (files and projects
 * alike): each id is processed independently (best-effort, no rollback), so the caller
 * needs the per-item result rather than a bare count. */
export type BatchOpResult = {
  succeeded: string[];
  failed: { id: string; error: string }[];
};

export function copyFile(id: string, destDir: string): Promise<AudioFile> {
  return request<AudioFile>(`/files/${encodeId(id)}/copy`, {
    method: "POST",
    body: JSON.stringify({ destDir }),
  });
}

export function moveFile(id: string, destDir: string): Promise<AudioFile> {
  return request<AudioFile>(`/files/${encodeId(id)}/move`, {
    method: "POST",
    body: JSON.stringify({ destDir }),
  });
}

export async function deleteFile(id: string): Promise<void> {
  await request(`/files/${encodeId(id)}`, { method: "DELETE" });
}

export function batchCopyFiles(ids: string[], destDir: string): Promise<BatchOpResult> {
  return request<BatchOpResult>(`/files/batch/copy`, {
    method: "POST",
    body: JSON.stringify({ ids, destDir }),
  });
}

export function batchMoveFiles(ids: string[], destDir: string): Promise<BatchOpResult> {
  return request<BatchOpResult>(`/files/batch/move`, {
    method: "POST",
    body: JSON.stringify({ ids, destDir }),
  });
}

export function batchDeleteFiles(ids: string[]): Promise<BatchOpResult> {
  return request<BatchOpResult>(`/files/batch`, {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

export type ProjectFilters = {
  search?: string;
  /** OR'd together (any matching status counts). */
  statuses?: TrackStatus[];
  /** OR'd together; "unscored" matches projects with no score set. */
  scores?: (number | "unscored")[];
  /** OR'd together (has any of these tags). */
  tags?: string[];
  sortBy?: "name" | "modifiedAt" | "score";
  sortDir?: "asc" | "desc";
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
  for (const s of filters.statuses ?? []) params.append("status", s);
  for (const s of filters.scores ?? []) params.append("score", String(s));
  for (const t of filters.tags ?? []) params.append("tag", t);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDir) params.set("sortDir", filters.sortDir);
  params.set("page", String(filters.page ?? 1));
  params.set("pageSize", String(filters.pageSize ?? PAGE_SIZE));
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

export function updateProjectStatus(id: string, status: TrackStatus): Promise<Project> {
  return request<Project>(`/projects/${encodeId(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateProjectTags(id: string, tags: string[]): Promise<Project> {
  return request<Project>(`/projects/${encodeId(id)}/tags`, {
    method: "PATCH",
    body: JSON.stringify({ tags }),
  });
}

export function updateProjectScore(id: string, score: number | null): Promise<Project> {
  return request<Project>(`/projects/${encodeId(id)}/score`, {
    method: "PATCH",
    body: JSON.stringify({ score }),
  });
}

export function batchUpdateProjectScore(ids: string[], score: number | null): Promise<{ updated: number }> {
  return request(`/projects/batch/score`, { method: "PATCH", body: JSON.stringify({ ids, score }) });
}

/** Adds these tags to every listed project (union — a project keeps its own existing tags too). */
export function batchAddProjectTags(ids: string[], tags: string[]): Promise<{ updated: number }> {
  return request(`/projects/batch/tags`, { method: "PATCH", body: JSON.stringify({ ids, tags }) });
}

export type CopyProjectResult = {
  project: Project;
  clonedNestedProjectCount: number;
  clonedFileCount: number;
};

export type MoveProjectResult = {
  project: Project;
  movedNestedProjectCount: number;
  movedFileCount: number;
};

export type DeleteProjectResult = {
  removedProjectIds: string[];
  removedFileIds: string[];
};

export function copyProject(id: string, destDir: string): Promise<CopyProjectResult> {
  return request<CopyProjectResult>(`/projects/${encodeId(id)}/copy`, {
    method: "POST",
    body: JSON.stringify({ destDir }),
  });
}

export function moveProject(id: string, destDir: string): Promise<MoveProjectResult> {
  return request<MoveProjectResult>(`/projects/${encodeId(id)}/move`, {
    method: "POST",
    body: JSON.stringify({ destDir }),
  });
}

export function deleteProject(id: string): Promise<DeleteProjectResult> {
  return request<DeleteProjectResult>(`/projects/${encodeId(id)}`, { method: "DELETE" });
}

export function batchCopyProjects(ids: string[], destDir: string): Promise<BatchOpResult> {
  return request<BatchOpResult>(`/projects/batch/copy`, {
    method: "POST",
    body: JSON.stringify({ ids, destDir }),
  });
}

export function batchMoveProjects(ids: string[], destDir: string): Promise<BatchOpResult> {
  return request<BatchOpResult>(`/projects/batch/move`, {
    method: "POST",
    body: JSON.stringify({ ids, destDir }),
  });
}

export function batchDeleteProjects(ids: string[]): Promise<BatchOpResult> {
  return request<BatchOpResult>(`/projects/batch`, {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

export type ProjectDuplicatesResult = {
  projectId: string;
  sampleCount: number;
  matches: ProjectDuplicateMatch[];
};

export function getProjectDuplicates(id: string): Promise<ProjectDuplicatesResult> {
  return request<ProjectDuplicatesResult>(`/projects/${encodeId(id)}/duplicates`);
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

export async function getAllTags(): Promise<string[]> {
  const result = await request<{ tags: string[] }>(`/tags`);
  return result.tags;
}

export function getExclusions(): Promise<{ excludedPaths: string[] }> {
  return request(`/scan/exclusions`);
}

export function setExclusions(excludedPaths: string[]): Promise<{ excludedPaths: string[] }> {
  return request(`/scan/exclusions`, { method: "PUT", body: JSON.stringify({ excludedPaths }) });
}

export async function getCustomTabs(): Promise<CustomTab[]> {
  const result = await request<{ tabs: CustomTab[] }>(`/custom-tabs`);
  return result.tabs;
}

export function createCustomTab(input: {
  name: string;
  type: CustomTabType;
  statuses?: TrackStatus[];
  scores?: (number | "unscored")[];
  tags?: string[];
}): Promise<CustomTab> {
  return request<CustomTab>(`/custom-tabs`, { method: "POST", body: JSON.stringify(input) });
}

export async function deleteCustomTab(id: number): Promise<void> {
  await request(`/custom-tabs/${id}`, { method: "DELETE" });
}
