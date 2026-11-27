import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import { useSuggestions } from "./Context";
import { FieldSuggestion } from "./FieldSuggestion";
import { getSuggester, warnUnregisteredField } from "../../suggestions/registry";
import { resolveAnchor } from "./dom";

class SuggestionBoundary extends Component {
  static getDerivedStateFromError() {
    return { failed: true };
  }

  state = { failed: false };

  componentDidCatch(error) {
    console.error("suggestions: failed to render a suggestion:", error);
  }

  render() {
    const { children } = this.props;
    const { failed } = this.state;
    return failed ? null : children;
  }
}

SuggestionBoundary.propTypes = {
  children: PropTypes.node,
};

export const SuggestionsOutlet = () => {
  const { suggestions } = useSuggestions();
  const [, setTick] = useState(0);
  const containersRef = useRef(new Map());

  const visible = useMemo(
    () =>
      suggestions.filter((s) => {
        if (getSuggester(s.field)) return true;
        warnUnregisteredField(s.field);
        return false;
      }),
    [suggestions]
  );

  const syncContainers = useCallback(() => {
    const containers = containersRef.current;
    const wanted = new Map();
    for (const suggestion of visible) {
      const entry = getSuggester(suggestion.field);
      if (!wanted.has(entry.fieldPath)) wanted.set(entry.fieldPath, entry);
    }

    let changed = false;
    for (const [fieldPath, container] of [...containers]) {
      if (!wanted.has(fieldPath)) {
        container.remove();
        containers.delete(fieldPath);
        changed = true;
      }
    }
    for (const [fieldPath, entry] of wanted) {
      const anchor = resolveAnchor(entry);
      if (!anchor) continue;

      let container = containers.get(fieldPath);
      if (!container) {
        container = document.createElement("div");
        container.className = "suggestions-outlet";
        container.dataset.fieldPath = fieldPath;
        containers.set(fieldPath, container);
        changed = true;
      }
      if (anchor.nextElementSibling !== container) {
        anchor.insertAdjacentElement("afterend", container);
        changed = true;
      }
    }
    return changed;
  }, [visible]);

  const syncRef = useRef(syncContainers);
  syncRef.current = syncContainers;

  useEffect(() => {
    if (syncContainers()) setTick((t) => t + 1);
  }, [syncContainers]);

  useEffect(() => {
    const containers = containersRef.current;
    let frame = 0;
    const resync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (syncRef.current()) setTick((t) => t + 1);
      });
    };
    const observer = new MutationObserver(resync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const container of containers.values()) {
        container.remove();
      }
      containers.clear();
    };
  }, []);

  return visible.map((suggestion) => {
    const entry = getSuggester(suggestion.field);
    const container = containersRef.current.get(entry.fieldPath);
    if (!container) return null;
    return createPortal(
      <SuggestionBoundary>
        <FieldSuggestion key={suggestion.id} suggestion={suggestion} />
      </SuggestionBoundary>,
      container,
      suggestion.id
    );
  });
};
