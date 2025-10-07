const core = require('@actions/core');
const github = require('@actions/github');

/**
 * GitHub API service that auto-initializes and encapsulates Octokit operations
 * Provides centralized error handling and common operations
 */
let _octokit = null;
let _owner = null;
let _repo = null;

/**
 * Initialize the service with GitHub context
 * Called automatically on first use
 */
function _initialize() {
  if (_octokit) {
    return; // Already initialized
  }

  const token = core.getInput('github-token', { required: true });
  _octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  _owner = owner;
  _repo = repo;

  core.debug(`GitHubService initialized for ${owner}/${repo}`);
}

/**
 * Get repository content by path
 */
async function getContent(path) {
  _initialize();
  try {
    const { data } = await _octokit.rest.repos.getContent({
      owner: _owner,
      repo: _repo,
      path
    });
    return data;
  } catch (error) {
    core.debug(`Content not found at: ${path}`);
    return null;
  }
}

/**
 * List all open pull requests
 */
async function listPullRequests(options = {}) {
  _initialize();
  try {
    const { data } = await _octokit.rest.pulls.list({
      owner: _owner,
      repo: _repo,
      state: 'open',
      per_page: 100,
      sort: 'updated',
      direction: 'asc',
      ...options
    });
    return data;
  } catch (error) {
    core.error(`Failed to list pull requests: ${error.message}`);
    throw error;
  }
}

/**
 * Get reviews for a specific pull request
 */
async function getPullRequestReviews(pullNumber) {
  _initialize();
  try {
    const { data } = await _octokit.rest.pulls.listReviews({
      owner: _owner,
      repo: _repo,
      pull_number: pullNumber
    });
    return data;
  } catch (error) {
    core.error(`Failed to get reviews for PR #${pullNumber}: ${error.message}`);
    throw error;
  }
}

/**
 * Get files changed in a pull request
 */
async function getPullRequestFiles(pullNumber) {
  _initialize();
  try {
    const { data } = await _octokit.rest.pulls.listFiles({
      owner: _owner,
      repo: _repo,
      pull_number: pullNumber,
      per_page: 100
    });
    return data;
  } catch (error) {
    core.warning(`Failed to get PR files: ${error.message}`);
    return [];
  }
}

/**
 * Assign users to a pull request
 */
async function assignPullRequest(pullNumber, assignees) {
  _initialize();
  try {
    await _octokit.rest.issues.addAssignees({
      owner: _owner,
      repo: _repo,
      issue_number: pullNumber,
      assignees
    });
    return true;
  } catch (error) {
    core.warning(`Failed to assign PR #${pullNumber}: ${error.message}`);
    return false;
  }
}

/**
 * Create an issue
 */
async function createIssue(title, body, labels = []) {
  _initialize();
  try {
    const { data } = await _octokit.rest.issues.create({
      owner: _owner,
      repo: _repo,
      title,
      body,
      labels
    });
    return data;
  } catch (error) {
    core.error(`Failed to create issue: ${error.message}`);
    throw error;
  }
}

/**
 * Get comments for an issue/PR
 */
async function getIssueComments(issueNumber) {
  _initialize();
  try {
    console.log(`Fetching comments for issue #${issueNumber}`);
    const { data } = await _octokit.rest.issues.listComments({
      owner: _owner,
      repo: _repo,
      issue_number: issueNumber
    });
    return data;
  } catch (error) {
    core.warning(`Failed to get comments for issue #${issueNumber}: ${error.message}`);
    return [];
  }
}

/**
 * Create a comment on an issue/PR
 */
async function createComment(issueNumber, body) {
  _initialize();
  try {
    const { data } = await _octokit.rest.issues.createComment({
      owner: _owner,
      repo: _repo,
      issue_number: issueNumber,
      body
    });
    return data;
  } catch (error) {
    core.warning(`Failed to comment on issue #${issueNumber}: ${error.message}`);
    throw error;
  }
}

/**
 * Check if a comment exists based on a predicate function
 */
async function hasRecentBotComment(issueNumber, predicate, dayThreshold = 7) {
  const comments = await getIssueComments(issueNumber);
  const now = new Date();

  return comments.find(c =>
    c.user.type === 'Bot' &&
    predicate(c) && // TODO: there's a bug here, this predicate is not working as intended
    (now - new Date(c.created_at)) / (1000 * 60 * 60 * 24) < dayThreshold
  );
}

/**
 * Comment on multiple PRs with a message template
 */
async function commentOnPRs(prs, messageTemplate, dayThreshold = 7) {
  for (const pr of prs) {
    try {
      const hasRecentComment = await hasRecentBotComment(
        pr.number,
        (c) => c.body.includes('This PR has been inactive'),
        dayThreshold
      );

      if (!hasRecentComment) {
        let assignees = (pr.assignees && pr.assignees.length) > 0
          ? pr.assignees.map(a => `@${a.login}`).join(', ')
          : `@${pr.author}`;

        assignees += (pr.requested_reviewers && pr.requested_reviewers.length) > 0
          ? pr.requested_reviewers.map(r => ` @${r.login}`).join(', ')
          : '';

        const message = messageTemplate
          .replace('{days}', pr.daysSinceCreated || pr.daysSinceUpdate)
          .replace('{assignees}', assignees);

        console.log(`PR #${pr.number} - Commenting with message: ${message}`);
        core.info(`💬 Commenting on PR #${pr.number} with message: ${message}`);

        await createComment(pr.number, message);
        core.info(`  ✅ Commented on PR #${pr.number}`);
      } else {
        core.debug(`  ⏭️  Skipped PR #${pr.number} (already commented recently)`);
      }
    } catch (error) {
      core.warning(`Failed to comment on PR #${pr.number}: ${error.message}`);
    }
  }
}

/**
 * Get repository context
 */
function getContext() {
  _initialize();
  return {
    owner: _owner,
    repo: _repo
  };
}

/**
 * Reset state (mainly for testing)
 */
function reset() {
  _octokit = null;
  _owner = null;
  _repo = null;
}

module.exports = {
  getContent,
  listPullRequests,
  getPullRequestReviews,
  getPullRequestFiles,
  assignPullRequest,
  createIssue,
  getIssueComments,
  createComment,
  hasRecentBotComment,
  commentOnPRs,
  getContext,
  reset
};
