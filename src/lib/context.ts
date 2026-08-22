import type { Bindings } from "../db/schema";
import type { User } from "./auth";

/** Shared Hono environment: bindings plus the resolved user, if any. */
export type Env = {
  Bindings: Bindings;
  Variables: { user: User | null };
};
