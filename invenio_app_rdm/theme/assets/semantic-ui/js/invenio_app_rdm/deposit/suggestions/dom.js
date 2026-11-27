export const getRichEditor = (fieldPath) => {
  if (typeof document === "undefined" || typeof window === "undefined") return null;

  const fieldElement = document.getElementById(fieldPath);
  if (!fieldElement) return null;

  const editorId = fieldElement.querySelector("textarea")?.id;
  const editorManager = window.hugerte;
  return editorId && typeof editorManager?.get === "function"
    ? editorManager.get(editorId)
    : null;
};

export const setRichEditorContent = (fieldPath, value) => {
  const editor = getRichEditor(fieldPath);
  if (!editor) return;

  const updateEditor = () => {
    editor.setContent(value, { no_events: true });
    editor.save?.();
  };

  if (editor.initialized === false && typeof editor.on === "function") {
    editor.on("init", updateEditor);
    return;
  }

  updateEditor();
};

export const resolveAnchor = (entry) => {
  if (typeof document === "undefined") return null;

  if (typeof entry.anchor === "function") return entry.anchor();
  if (typeof entry.anchor === "string") return document.querySelector(entry.anchor);

  const byId = document.getElementById(entry.fieldPath);
  if (byId) return byId.closest(".field") ?? byId;

  return (
    document.querySelector(`label[for="${entry.fieldPath}"]`)?.closest(".field") ?? null
  );
};
