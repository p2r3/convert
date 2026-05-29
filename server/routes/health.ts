import { Router } from "express";
import { isBrowserConverterAvailable } from "../lib/browserConvert.ts";

export const healthRouter: Router = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    browserConverterAvailable: isBrowserConverterAvailable(),
  });
});
