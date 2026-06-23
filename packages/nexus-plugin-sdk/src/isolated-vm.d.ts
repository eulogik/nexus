declare module "isolated-vm" {
  export class Isolate {
    constructor(options?: { memoryLimit?: number; inspector?: boolean });
    createContext(): Promise<Context>;
    compileScript(code: string, options?: { filename?: string }): Promise<Script>;
    dispose(): void;
    getHeapStatistics(): Promise<{
      total_heap_size: number;
      total_heap_size_executable: number;
      total_physical_size: number;
      used_heap_size: number;
      heap_size_limit: number;
    }>;
  }

  export class Context {
    readonly global: Reference;
    release(): void;
    eval(code: string, options?: { timeout?: number }): Promise<unknown>;
  }

  export class Script {
    run(context: Context, options?: { timeout?: number; release?: boolean }): Promise<Reference>;
    release(): void;
  }

  export class Reference {
    copy(): unknown;
    readonly typeOf: string;
    get(property: string): Promise<Reference>;
    set(key: string, value: Reference | unknown, options?: { copy?: boolean; deep?: boolean }): Promise<void>;
    apply(
      receiver: Reference | undefined,
      args: unknown[],
      options?: { timeout?: number; arguments?: { copy?: boolean } },
    ): Promise<unknown>;
  }

  declare const _isolated: {
    Isolate: typeof Isolate;
    Context: typeof Context;
    Script: typeof Script;
    Reference: typeof Reference;
  };

  export default _isolated;
}
