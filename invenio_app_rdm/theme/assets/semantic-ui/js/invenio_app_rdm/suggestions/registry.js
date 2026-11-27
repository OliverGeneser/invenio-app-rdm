export const dedupeKey = (value) => {
  const inner = value?.person_or_org ?? value;
  return inner?.id ?? inner?.name ?? inner?.subject ?? JSON.stringify(value);
};

export const STRATEGIES = {
  replace: (current, value) => value,
  append: (current, value) => {
    const list = Array.isArray(current) ? current : [];
    const added = (Array.isArray(value) ? value : [value]).filter(
      (item) => !list.some((entry) => dedupeKey(entry) === dedupeKey(item))
    );
    return [...list, ...added];
  },
  merge: (current, value) => ({ ...(current ?? {}), ...value }),
};

export const getValueAt = (values, path) =>
  path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), values);

export const describeSuggestion = (value) => {
  if (typeof value === "string") return value.replace(/<[^>]+>/g, "");
  if (Array.isArray(value)) {
    return value
      .map(
        (v) =>
          v.person_or_org?.name ||
          v.subject ||
          v.title_l10n?.en ||
          v.id ||
          JSON.stringify(v)
      )
      .join("; ");
  }
  return JSON.stringify(value);
};

const registry = new Map();
const warnedFields = new Set();

export const registerSuggester = ({
  field,
  fieldPath,
  label,
  describe,
  describeItem,
  renderItem,
  serialize,
  serializeItem,
  match,
  anchor,
  apply = "replace",
}) => {
  if (!field) throw new Error("registerSuggester: field is required");
  const strategy = typeof apply === "string" ? STRATEGIES[apply] : apply;
  if (typeof strategy !== "function") {
    throw new Error(`registerSuggester(${field}): unknown strategy ${apply}`);
  }
  registry.set(field, {
    field,
    fieldPath: fieldPath ?? `metadata.${field}`,
    label: label ?? field,
    apply: strategy,
    strategyName: typeof apply === "string" ? apply : "replace",
    describe,
    describeItem,
    renderItem,
    serialize,
    serializeItem,
    match,
    anchor,
  });
};

export const getSuggester = (field) => registry.get(field) ?? null;

export const warnUnregisteredField = (field) => {
  if (!field || warnedFields.has(field)) return;
  warnedFields.add(field);
  console.warn(
    `suggestions: no suggester registered for field "${field}" — register one with registerSuggester() to show its suggestions.`
  );
};

const isEndpoint = (endpoint) =>
  typeof endpoint === "string" || typeof endpoint === "function";

let suggestionBackend = null;

export const registerSuggestionBackend = ({ trigger, feedback }) => {
  if (!isEndpoint(trigger)) {
    throw new Error("registerSuggestionBackend: trigger endpoint is required");
  }
  if (feedback !== undefined && !isEndpoint(feedback)) {
    throw new Error("registerSuggestionBackend: feedback must be a URL or a function");
  }
  suggestionBackend = { trigger, feedback };
};

export const getSuggestionBackend = () => suggestionBackend;

export const hasSuggestionBackend = () => suggestionBackend !== null;

export const resolveEndpoint = (endpoint, draftId, fileKey = null) =>
  typeof endpoint === "function" ? endpoint(draftId, fileKey) : endpoint;
