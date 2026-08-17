import type { AudioFile as BackendAudioFile } from "../../src/models/AudioFile.js";

export type AudioFile = BackendAudioFile & { projectPath?: string };
export type { TrackStatus } from "../../src/models/AudioFile.js";
export type { Project } from "../../src/models/Project.js";
export type { DawType } from "../../src/scanner/dawTypes.js";
export { DAW_LABELS } from "../../src/scanner/dawTypes.js";
