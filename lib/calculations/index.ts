// Motor de cálculo puro do Intertec (docs/02-Arquitetura.md §4).
// Ponto único de importação: `import { ... } from "@calc"`.
// Sem dependência de UI ou banco — só matemática financeira testável.

export * from "./decimal";
export * from "./types";
export * from "./inputs";
export * from "./cmv";
export * from "./allocation";
export * from "./order";
export * from "./cascade";
export * from "./ficha";
export * from "./kits";
