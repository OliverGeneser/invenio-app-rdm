// Per-instance suggestion wiring. Upstream this hook is empty on purpose:
// NO backend and NO suggesters are registered by default. It is imported by
// the deposit bundle, and instances (e.g. zenodo-rdm) shadow it with their
// own copy — the same file-shadowing pattern as
// `overridableRegistry/mapping.js` — to register both their suggestion
// backend (which also switches the feature on) and their suggesters:
//
//   import {
//     registerSuggester,
//     registerSuggestionBackend,
//   } from "../../suggestions/registry";
//
//   registerSuggestionBackend({ trigger: "/api/suggestions" });
//   registerSuggester({ field: "title", apply: "replace" });
