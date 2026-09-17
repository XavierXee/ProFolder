import type { AudioFile as BackendAudioFile } from "../../src/models/AudioFile.js";

export type AudioFile = BackendAudioFile & { projectPath?: string };

/** The 3 selectable UI themes — see index.css's `[data-theme]` blocks. */
export type Theme = "profolder" | "light" | "dark";
export type { TrackStatus, EntityStats } from "../../src/models/AudioFile.js";
export type { Project } from "../../src/models/Project.js";
export type { DawType } from "../../src/scanner/dawTypes.js";
export { DAW_LABELS } from "../../src/scanner/dawTypes.js";
export type { ProjectDuplicateMatch } from "../../src/models/ProjectDuplicate.js";
export type { CustomTab, CustomTabType } from "../../src/models/CustomTab.js";
