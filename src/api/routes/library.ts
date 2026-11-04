import express, { Router } from "express";
import type Database from "better-sqlite3";
import { asyncHandler } from "../asyncHandler.js";
import { buildLibraryExport } from "../../services/libraryExport.js";
import { importLibrary, ImportFormatError } from "../../services/libraryImport.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Whole-library export to, and non-destructive import from, an Excel workbook. */
export function createLibraryRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/export",
    asyncHandler(async (_req, res) => {
      const workbook = await buildLibraryExport(db);
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", XLSX_MIME);
      res.setHeader("Content-Disposition", `attachment; filename="ProFolder export ${date}.xlsx"`);
      res.send(workbook);
    })
  );

  // The workbook's raw bytes as the request body (not multipart). 50MB comfortably covers a
  // large library's export while keeping a stray huge upload from being buffered whole.
  router.post(
    "/import",
    express.raw({ type: [XLSX_MIME, "application/octet-stream"], limit: "50mb" }),
    asyncHandler(async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: "Send the .xlsx file's contents as the request body" });
        return;
      }
      try {
        res.json(await importLibrary(db, req.body));
      } catch (err) {
        if (err instanceof ImportFormatError) {
          res.status(400).json({ error: err.message });
          return;
        }
        throw err;
      }
    })
  );

  return router;
}
