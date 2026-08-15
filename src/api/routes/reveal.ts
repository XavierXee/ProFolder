import { Router } from "express";
import type { FinderService } from "../../services/FinderService.js";
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
      await finderService.revealInFinder(targetPath);
      res.json({ ok: true });
    })
  );

  return router;
}
