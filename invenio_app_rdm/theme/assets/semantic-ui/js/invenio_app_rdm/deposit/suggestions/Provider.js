import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { i18next } from "@translations/invenio_app_rdm/i18next";
import { SuggestionsContext } from "./Context";
import {
  getSuggestionBackend,
  getSuggester,
  getValueAt,
  resolveEndpoint,
} from "../../suggestions/registry";
import { setRichEditorContent } from "./dom";

const STATUS = {
  IDLE: "idle",
  TRIGGERING: "triggering",
  STREAMING: "streaming",
  SUCCESS: "success",
  ERROR: "error",
};

const SUGGESTION_PENDING = "pending";
const SUGGESTION_APPLIED = "applied";
const SUGGESTION_DENIED = "denied";

const getDraftId = (record) => {
  const id = record?.id;
  return id && id !== "null" && id !== "undefined" ? id : null;
};

export const SuggestionsProvider = ({ children = null }) => {
  const [state, setState] = useState({
    status: STATUS.IDLE,
    error: null,
    suggestions: [],
    activeFileKey: null,
    recordId: null,
  });
  const eventSourceRef = useRef(null);
  const streamTimeoutIdRef = useRef(null);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (streamTimeoutIdRef.current) {
        clearTimeout(streamTimeoutIdRef.current);
        streamTimeoutIdRef.current = null;
      }
    };
  }, []);

  const closeEventSource = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const clearStreamTimeout = () => {
    if (streamTimeoutIdRef.current) {
      clearTimeout(streamTimeoutIdRef.current);
      streamTimeoutIdRef.current = null;
    }
  };

  const updateSuggestionStatus = (id, status) => {
    setState((prev) => ({
      ...prev,
      suggestions: prev.suggestions.map((s) => (s.id === id ? { ...s, status } : s)),
    }));
  };

  const removeSuggestedItem = (id, index, emptyStatus) => {
    setState((prev) => ({
      ...prev,
      suggestions: prev.suggestions.map((s) => {
        if (s.id !== id || !Array.isArray(s.value)) return s;

        const value = s.value.filter((_, currentIndex) => currentIndex !== index);
        return {
          ...s,
          value,
          status: value.length > 0 ? SUGGESTION_PENDING : emptyStatus,
        };
      }),
    }));
  };

  const trigger = (record, fileKey = null) => {
    if (!record) return;
    const draftId = getDraftId(record);
    if (!draftId) {
      setState((prev) => ({
        ...prev,
        status: STATUS.ERROR,
        error: i18next.t("Save the draft before extracting metadata."),
        activeFileKey: fileKey,
      }));
      return;
    }

    closeEventSource();
    clearStreamTimeout();

    const backend = getSuggestionBackend();
    if (!backend) return;

    setState((prev) => ({
      ...prev,
      status: STATUS.TRIGGERING,
      error: null,
      activeFileKey: fileKey,
      recordId: draftId,
    }));

    const requestOptions = { method: "POST" };
    if (fileKey) {
      requestOptions.headers = { "Content-Type": "application/json" };
      requestOptions.body = JSON.stringify({ fileKey });
    }

    fetch(resolveEndpoint(backend.trigger, draftId, fileKey), requestOptions)
      .then((res) => {
        if (!res.ok) {
          return res.text().then((body) => {
            throw new Error(body || `HTTP ${res.status}`);
          });
        }
        return res.json();
      })
      .then(({ workflowId, streamUrl, workflowUrl }) => {
        setState((prev) => ({
          ...prev,
          status: STATUS.STREAMING,
          workflowId,
        }));

        const source = new EventSource(streamUrl);
        eventSourceRef.current = source;

        streamTimeoutIdRef.current = setTimeout(() => {
          closeEventSource();
          setState((prev) => ({
            ...prev,
            status: STATUS.ERROR,
            error: i18next.t("Metadata extraction timed out."),
          }));
        }, 180 * 1000);

        source.onmessage = (event) => {
          if (event.data === "ERROR") {
            clearStreamTimeout();
            closeEventSource();
            setState((prev) => ({
              ...prev,
              status: STATUS.ERROR,
              error: i18next.t("Metadata extraction failed."),
            }));
            return;
          }

          if (event.data !== "SUCCESS") return;

          clearStreamTimeout();
          closeEventSource();

          fetch(workflowUrl)
            .then((res) => {
              if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
              }
              return res.json();
            })
            .then((workflow) => {
              const suggestions = workflow?.result?.suggestions ?? [];
              if (!Array.isArray(suggestions)) {
                throw new Error("Malformed extracted metadata result.");
              }

              setState((prev) => ({
                ...prev,
                status: STATUS.SUCCESS,
                suggestions: suggestions.map((s, index) => ({
                  ...s,
                  id: `${s.field}:${index}`,
                  status: SUGGESTION_PENDING,
                })),
              }));
            })
            .catch(() => {
              setState((prev) => ({
                ...prev,
                status: STATUS.ERROR,
                error: i18next.t("Failed to fetch extracted metadata result."),
              }));
            });
        };
        source.onerror = () => {
          if (!eventSourceRef.current) return;
          clearStreamTimeout();
          closeEventSource();
          setState((prev) => ({
            ...prev,
            status: STATUS.ERROR,
            error: i18next.t(
              "An unexpected error occurred while streaming the workflow results."
            ),
          }));
        };
      })
      .catch((err) => {
        let message = err.message;
        try {
          const parsed = JSON.parse(err.message);
          message = parsed.error || parsed.detail || parsed.message || err.message;
        } catch {
          // Just use the raw mesage
        }
        setState((prev) => ({
          ...prev,
          status: STATUS.ERROR,
          error: message,
        }));
      });
  };

  const applyValue = (formik, entry, rawValue) => {
    const value = Array.isArray(rawValue)
      ? entry.serializeItem
        ? rawValue.map(entry.serializeItem)
        : rawValue
      : entry.serialize
      ? entry.serialize(rawValue)
      : rawValue;
    const current = getValueAt(formik.values, entry.fieldPath);
    const next = entry.apply(current, value);
    formik.setFieldValue(entry.fieldPath, next);
    setRichEditorContent(entry.fieldPath, next);
  };

  const apply = (formik, id, valueIndex = null) => {
    const suggestion = state.suggestions.find((s) => s.id === id);
    const entry = suggestion && getSuggester(suggestion.field);
    if (!suggestion || !entry) return;

    if (Array.isArray(suggestion.value) && entry.strategyName === "append") {
      if (valueIndex === null) {
        if (suggestion.value.length === 0) return;
        applyValue(formik, entry, suggestion.value);
        updateSuggestionStatus(id, SUGGESTION_APPLIED);
        return;
      }

      const item = suggestion.value[valueIndex];
      if (!item) return;
      applyValue(formik, entry, [item]);
      removeSuggestedItem(id, valueIndex, SUGGESTION_APPLIED);
      return;
    }

    applyValue(formik, entry, suggestion.value);
    updateSuggestionStatus(id, SUGGESTION_APPLIED);
  };

  const deny = (id, valueIndex = null) => {
    const suggestion = state.suggestions.find((s) => s.id === id);
    if (!suggestion) return;

    if (Array.isArray(suggestion.value) && valueIndex !== null) {
      removeSuggestedItem(id, valueIndex, SUGGESTION_DENIED);
      return;
    }

    updateSuggestionStatus(id, SUGGESTION_DENIED);
  };

  const sendFeedback = (field, rating, comment = null) => {
    const { workflowId, recordId } = state;
    const backend = getSuggestionBackend();
    if (!backend?.feedback || !workflowId || !recordId) return;

    fetch(resolveEndpoint(backend.feedback, recordId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowId,
        fieldPath: field,
        rating,
        comment,
      }),
    }).catch((e) => {
      console.error(e);
    });
  };

  const dismissError = () => {
    setState((prev) => ({ ...prev, error: null }));
  };

  const { status, error, activeFileKey } = state;
  const value = {
    status,
    error,
    activeFileKey,
    workflowId: state.workflowId,
    suggestions: state.suggestions,
    isLoading: status === STATUS.TRIGGERING || status === STATUS.STREAMING,
    trigger,
    apply,
    deny,
    sendFeedback,
    dismissError,
  };

  return (
    <SuggestionsContext.Provider value={value}>{children}</SuggestionsContext.Provider>
  );
};

SuggestionsProvider.propTypes = {
  children: PropTypes.node,
};
