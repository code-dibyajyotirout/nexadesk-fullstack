import { createRouter } from "../trpc";

export const replayRouter = createRouter()
  .query("getRange", async ({ ctx, input }: { ctx: any; input: { sessionId: string; startMs?: number; endMs?: number } }) => {
    const { sessionId, startMs = 0, endMs = 9999999999999 } = input || { sessionId: "default" };
    const res = await fetch(
      `${ctx.apiUrl}/api/v1/replays/${sessionId}?start_ms=${startMs}&end_ms=${endMs}`
    );
    return await res.json();
  })
  .mutation("ingest", async ({ ctx, input }: { ctx: any; input: any }) => {
    const res = await fetch(`${ctx.apiUrl}/api/v1/replays`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return await res.json();
  });
