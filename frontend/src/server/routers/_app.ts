import { createRouter } from "../trpc";
import { workspaceRouter } from "./workspaces";
import { replayRouter } from "./replays";
import { telemetryRouter } from "./telemetry";

export const appRouter = createRouter();

export type AppRouter = typeof appRouter;
