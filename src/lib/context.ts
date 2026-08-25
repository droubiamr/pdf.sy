import type { Bindings } from "../db/schema";
import type { User } from "./auth";
import type { Lang } from "./i18n";

/** Shared Hono environment: bindings plus what middleware resolved per request. */
export type Env = {
  Bindings: Bindings;
  Variables: {
    user: User | null;
    /** Resolved once in index.tsx; read via `t(c)` and by the Layout. */
    lang: Lang;
  };
};
