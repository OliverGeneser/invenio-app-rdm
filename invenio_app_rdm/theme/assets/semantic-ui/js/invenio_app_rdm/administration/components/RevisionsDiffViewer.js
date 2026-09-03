/*
 * SPDX-FileCopyrightText: 2025 CERN.
 * SPDX-FileCopyrightText: 2025 Graz University of Technology.
 * SPDX-License-Identifier: MIT
 */

import { Component } from "react";
import PropTypes from "prop-types";
import { Grid, Container } from "semantic-ui-react";
import { Differ, Viewer } from "json-diff-kit";

const DEFAULT_DIFF = {};
const DEFAULT_VIEWER_PROPS = {
  indent: 4,
  lineNumbers: true,
  highlightInlineDiff: true,
  inlineDiffOptions: {
    mode: "word",
    wordSeparator: " ",
  },
  hideUnchangedLines: true,
  syntaxHighlight: false,
  virtual: true,
};

export class RevisionsDiffViewer extends Component {
  constructor({ diff = DEFAULT_DIFF, viewerProps = DEFAULT_VIEWER_PROPS, ...props }) {
    super({ diff, viewerProps, ...props });
    this.differ = new Differ({
      detectCircular: true,
      maxDepth: null,
      showModifications: true,
      arrayDiffMethod: "normal",
      ignoreCase: false,
      ignoreCaseForKey: false,
      recursiveEqual: true,
    });
    this.state = {
      currentDiff: undefined,
    };
  }

  componentDidUpdate(prevProps) {
    const { diff } = this.props;

    if (diff !== prevProps.diff) {
      this.computeDiff();
    }
  }

  computeDiff = () => {
    const { diff } = this.props;
    const _diff = this.differ.diff(diff?.srcRevision, diff?.targetRevision);
    this.setState({ currentDiff: _diff });
  };

  render() {
    const { currentDiff, viewerProps } = this.state;

    return currentDiff ? (
      <Grid>
        <Grid.Column width={16}>
          <Container fluid>
            <Viewer diff={currentDiff} {...viewerProps} />
          </Container>
        </Grid.Column>
      </Grid>
    ) : null;
  }
}

RevisionsDiffViewer.propTypes = {
  diff: PropTypes.object,
  viewerProps: PropTypes.object,
};
