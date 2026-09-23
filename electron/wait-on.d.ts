// `wait-on` ships no bundled type declarations and no `@types/wait-on` is installed (the
// package's own `package.json` has no `types`/`typings` field). This is a minimal ambient
// declaration covering only the shape `electron/main.ts` actually uses (the promise-based
// programmatic API with a `resources` array) — see `node_modules/wait-on/README.md`'s
// "Node.js API usage" section for the full option surface this intentionally doesn't cover.
declare module "wait-on" {
  interface WaitOnOptions {
    resources: string[];
    delay?: number;
    interval?: number;
    timeout?: number;
    window?: number;
  }

  export default function waitOn(opts: WaitOnOptions): Promise<void>;
}
