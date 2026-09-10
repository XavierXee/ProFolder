import { Router } from "express";
import { PathOutsideRootError, type FinderService } from "../../services/FinderService.js";
import { asyncHandler } from "../asyncHandler.js";

export function createRevealRouter(finderService: FinderService): Router {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { path: targetPath } = req.body as { path?: string };
      if (!targetPath) {
        res.status(400).json({ error: "path is required" });
        return;
      }
      try {
        await finderService.revealInFinder(targetPath);
      } catch (err) {
        if (err instanceof PathOutsideRootError) {
          res.status(404).json({ error: "File not found" });
          return;
        }
        throw err;
      }
      res.json({ ok: true });
    })
  );

  return router;
}
