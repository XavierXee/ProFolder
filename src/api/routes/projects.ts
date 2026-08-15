import { Router } from "express";
import type Database from "better-sqlite3";
import { findAllActive, findById } from "../../database/repositories/projectRepository.js";
import {
  findAllActive as findAllFiles,
  countActiveGroupedByProject,
} from "../../database/repositories/audioFileRepository.js";
import { asyncHandler } from "../asyncHandler.js";

export function createProjectsRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const projects = findAllActive(db);
      const countsByProject = countActiveGroupedByProject(db);
      const withCounts = projects.map((project) => ({
        ...project,
        audioFileCount: countsByProject.get(project.id) ?? 0,
      }));
      res.json(withCounts);
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const project = findById(db, id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const audioFiles = findAllFiles(db, { projectId: id });
      res.json({ ...project, audioFiles });
    })
  );

  return router;
}
