// Lets `node --import ./scripts/ts-resolve.mjs foo.ts` follow extensionless
// relative imports ("./bar" -> "./bar.ts"), which Vite allows and Node doesn't.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try {
    return await next(spec, ctx);
  } catch (e) {
    if (e.code === "ERR_MODULE_NOT_FOUND" && spec.startsWith(".")) {
      return next(spec + ".ts", ctx);
    }
    throw e;
  }
}`),
);
