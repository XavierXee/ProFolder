export type ScanError = { path: string; message: string };

export type ScanOptions = {
  rootPath: string;
  audioExtensions?: string[];
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
  errors: ScanError[];
};
