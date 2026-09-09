import { createRouter } from "../trpc";

export const workspaceRouter = createRouter()
  .query("list", async ({ ctx }) => {
    try {
      const res = await fetch(`${ctx.apiUrl}/api/v1/workspaces`);
      if (!res.ok) throw new Error("Backend unavailable");
      return await res.json();
    } catch {
      return [
        {
          id: "ws-local-fallback",
          title: "On-Device Spatial Sandbox",
          description: "Local client-side execution workspace",
          layout: "cascade",
          files: [],
        },
      ];
    }
  })
  .mutation("create", async ({ ctx, input }: { ctx: any; input: { title: string; description?: string } }) => {
    const res = await fetch(`${ctx.apiUrl}/api/v1/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return await res.json();
  });
