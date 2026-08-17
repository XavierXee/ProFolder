import path from "node:path";
import { config } from "../config/config.js";
import { getEffectiveMusicRoot } from "../config/musicRoot.js";
import { openDb } from "../database/db.js";
import { runScan } from "../scanner/scanner.js";

async function main(): Promise<void> {
  const db = openDb(config.dbPath);
  const rootPath = process.argv[2] ? path.resolve(process.argv[2]) : getEffectiveMusicRoot(db);

  console.log(`Scanning ${rootPath} ...`);
  const stats = await runScan({ rootPath, audioExtensions: config.audioExtensions }, db);

  console.log("");
  console.log("Scan complete.");
  console.log("");
  console.log(`Root:`);
  console.log(stats.rootPath);
  console.log("");
  console.log(`Folders scanned: ${stats.foldersScanned}`);
  console.log(`Audio files found: ${stats.audioFilesFound}`);
  console.log(`DAW projects: ${stats.dawProjectsFound}`);
  console.log(`Likely exports: ${stats.likelyExports}`);
  console.log(`Likely samples: ${stats.likelySamples}`);
  console.log(`Unknown: ${stats.unknownConfidence}`);
  console.log("");
  console.log(`New files: ${stats.newFiles}`);
  console.log(`Modified files: ${stats.modifiedFiles}`);
  console.log(`Removed files: ${stats.removedFiles}`);
  console.log("");
  console.log(`Duration: ${(stats.durationMs / 1000).toFixed(1)} seconds`);

  if (stats.errors.length > 0) {
    console.log("");
    console.log(`Warnings (${stats.errors.length}):`);
    for (const err of stats.errors.slice(0, 20)) {
      console.log(`  ${err.path}: ${err.message}`);
    }
    if (stats.errors.length > 20) {
      console.log(`  ... and ${stats.errors.length - 20} more`);
    }
  }

  db.close();
}

main().catch((err) => {
  console.error("Scan failed:", err);
  process.exit(1);
});
