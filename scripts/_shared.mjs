import { readFileSync } from "fs";

/** Carrega variáveis de .env e .env.test (scripts locais). */
export function loadEnv(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1).replace(/^<|>$/g, "").replace(/^"|"$/g, "")];
        })
    );
  } catch {
    return {};
  }
}

export function loadMergedEnv() {
  return { ...loadEnv(".env"), ...loadEnv(".env.test") };
}
