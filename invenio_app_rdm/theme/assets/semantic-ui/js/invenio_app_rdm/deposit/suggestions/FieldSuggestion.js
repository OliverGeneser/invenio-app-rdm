import { useRef, useState } from "react";
import PropTypes from "prop-types";
import { connect as connectFormik } from "formik";
import { Button, Form, Icon, Message, TextArea } from "semantic-ui-react";
import { useSuggestions } from "./Context";
import {
  describeSuggestion,
  dedupeKey,
  getSuggester,
  getValueAt,
} from "../../suggestions/registry";
import { i18next } from "@translations/invenio_app_rdm/i18next";

const renderSuggestionActions = (onApply, onDeny) => (
  <Button.Group size="mini" compact className="suggestions-actions">
    <Button
      type="button"
      positive
      icon="check"
      content={i18next.t("Apply")}
      onClick={onApply}
    />
    <Button
      type="button"
      negative
      icon="times"
      aria-label={i18next.t("Deny")}
      onClick={onDeny}
    />
  </Button.Group>
);

const FieldSuggestionComponent = ({ suggestion, formik = null }) => {
  const suggestions = useSuggestions();
  const [feedbackState, setFeedbackState] = useState(null);
  const [comment, setComment] = useState("");
  const suggestionRef = useRef(suggestion);

  if (!suggestions || !formik || !suggestion) return null;

  const entry = getSuggester(suggestion.field);
  if (!entry) return null;

  const { apply, deny, sendFeedback } = suggestions;
  const isList = Array.isArray(suggestion.value) && entry.strategyName === "append";

  if (suggestionRef.current !== suggestion) {
    suggestionRef.current = suggestion;
    if (suggestion.status === "pending") {
      if (feedbackState !== null) setFeedbackState(null);
      if (comment !== "") setComment("");
    }
  }

  const current = getValueAt(formik.values, entry.fieldPath);
  const isExactMatch = entry.match
    ? entry.match(suggestion.value, formik.values)
    : typeof current === "string" &&
      typeof suggestion.value === "string" &&
      current.trim() === suggestion.value.trim();
  if (suggestion.status === "pending" && isExactMatch) {
    return null;
  }

  if (suggestion.status !== "pending" && feedbackState !== "shown") {
    return null;
  }

  if (feedbackState === "submitted") {
    return null;
  }

  const handleApply = () => {
    apply(formik, suggestion.id);
    setFeedbackState("shown");
  };

  const handleDeny = () => {
    deny(suggestion.id);
    setFeedbackState("shown");
  };

  const handlePerEntryAction = (index, isApply) => {
    const count = Array.isArray(suggestion.value) ? suggestion.value.length : 0;
    if (isApply) {
      apply(formik, suggestion.id, index);
    } else {
      deny(suggestion.id, index);
    }
    if (count <= 1) {
      setFeedbackState("shown");
    }
  };

  const handleSubmitFeedback = (rating) => {
    sendFeedback(suggestion.field, rating, comment.trim() || null);
    setFeedbackState("submitted");
  };

  if (feedbackState === "shown") {
    return (
      <Message size="tiny" className="suggestions-message feedback">
        <Message.Content>
          <Message.Header>
            <Icon name="lightbulb outline" />
            {i18next.t("Was this suggestion helpful?")}
          </Message.Header>
          <div className="suggestions-row">
            <div className="suggestions-value">
              <Form.Field
                className="suggestions-feedback-comment"
                control={TextArea}
                placeholder={i18next.t("Optional feedback...")}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <Button.Group size="mini" compact className="suggestions-actions">
              <Button
                type="button"
                positive
                icon="thumbs up"
                content={i18next.t("Yes")}
                onClick={() => handleSubmitFeedback("positive")}
              />
              <Button
                type="button"
                negative
                icon="thumbs down"
                content={i18next.t("No")}
                onClick={() => handleSubmitFeedback("negative")}
              />
            </Button.Group>
          </div>
        </Message.Content>
      </Message>
    );
  }

  return (
    <Message size="tiny" info className="suggestions-message">
      <Message.Content>
        <Message.Header>
          <Icon name="lightbulb outline" />
          {i18next.t("Suggested {{field}}", {
            field: entry.label,
            interpolation: { escapeValue: false },
          })}
          {isList && (
            <Button
              type="button"
              positive
              compact
              size="mini"
              icon="check"
              content={i18next.t("Apply all")}
              onClick={handleApply}
              className="ml-30"
            />
          )}
        </Message.Header>
        {isList ? (
          <ul className="suggestions-list">
            {suggestion.value.map((item, index) => (
              <li key={dedupeKey(item) ?? index}>
                <span className="suggestions-value">
                  {entry.renderItem
                    ? entry.renderItem(item)
                    : (entry.describeItem ?? describeSuggestion)(item)}
                </span>
                {renderSuggestionActions(
                  () => handlePerEntryAction(index, true),
                  () => handlePerEntryAction(index, false)
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="suggestions-row">
            <div className="suggestions-value">
              <span>{(entry.describe ?? describeSuggestion)(suggestion.value)}</span>
            </div>
            {renderSuggestionActions(handleApply, handleDeny)}
          </div>
        )}
      </Message.Content>
    </Message>
  );
};

FieldSuggestionComponent.propTypes = {
  suggestion: PropTypes.object.isRequired,
  formik: PropTypes.object,
};

export const FieldSuggestion = connectFormik(FieldSuggestionComponent);
