import { Context } from "./context";

// Lightweight enterprise tRPC procedure contract
export type ProcedureHandler<TInput, TOutput> = (opts: {
  ctx: Context;
  input: TInput;
}) => Promise<TOutput> | TOutput;

export class TRPCRouterBuilder {
  private procedures: Map<string, ProcedureHandler<any, any>> = new Map();

  query<TInput = void, TOutput = any>(name: string, handler: ProcedureHandler<TInput, TOutput>) {
    this.procedures.set(name, handler);
    return this;
  }

  mutation<TInput = any, TOutput = any>(name: string, handler: ProcedureHandler<TInput, TOutput>) {
    this.procedures.set(name, handler);
    return this;
  }

  async execute(name: string, ctx: Context, input: any) {
    const handler = this.procedures.get(name);
    if (!handler) {
      throw new Error(`Procedure ${name} not found`);
    }
    return handler({ ctx, input });
  }

  listProcedures(): string[] {
    return Array.from(this.procedures.keys());
  }
}

export const createRouter = () => new TRPCRouterBuilder();
