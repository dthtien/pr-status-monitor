const core = require('@actions/core');
const axios = require('axios');
const { listPullRequests, getPullRequestReviews, createIssue, commentOnPRs } = require('./github-service');
const { loadCodeowners, getPRCodeowners, assignPRToOwners } = require('./codeowners');

async function run() {
  try {
    // Get inputs
    const staleDays = parseInt(core.getInput('stale-days'));
    const oldDays = parseInt(core.getInput('old-days'));
    const blockedLabels = core.getInput('blocked-labels').split(',').map(l => l.trim());
    const createIssueEnabled = core.getInput('create-issue') === 'true';
    const issueLabels = core.getInput('issue-labels').split(',').map(l => l.trim());
    const autoComment = core.getInput('auto-comment') === 'true';
    const commentMessage = core.getInput('comment-message');
    const slackWebhook = core.getInput('slack-webhook');
    const teamsWebhook = core.getInput('teams-webhook');
    const ignoreDrafts = core.getInput('ignore-drafts') === 'true';
    const autoAssignCodeowners = core.getInput('auto-assign-codeowners') === 'true';

    // GitHub service will auto-initialize on first use

    // load CODEOWNERS if auto-assign is enabled
    let codeowners = null;
    if (autoAssignCodeowners) {
      codeowners = await loadCodeowners();
      if (codeowners) {
        core.info(`📋 Loaded CODEOWNERS with ${codeowners.length} rules`);
      } else {
        core.warning('⚠️  CODEOWNERS file not found. Auto-assign disabled.');
      }
    }

    core.info('🔍 Starting PR status monitoring...');
    core.info(`Configuration: Stale=${staleDays}d, Old=${oldDays}d, Ignore Drafts=${ignoreDrafts}`);

    // Get all open PRs
    const pullRequests = await listPullRequests();

    core.info(`📋 Found ${pullRequests.length} open PRs`);

    const now = new Date();
    const issues = {
      stalled: [],
      unassigned: [],
      blocked: [],
      old: [],
      needsReview: []
    };

    // Analyze each PR
    for (const pr of pullRequests) {
      // Skip drafts if configured
      if (ignoreDrafts && pr.draft) {
        core.debug(`Skipping draft PR #${pr.number}`);
        continue;
      }

      const createdDate = new Date(pr.created_at);
      const updatedDate = new Date(pr.updated_at);
      const daysSinceCreated = (now - createdDate) / (1000 * 60 * 60 * 24);
      const daysSinceUpdate = (now - updatedDate) / (1000 * 60 * 60 * 24);

      // Get review status
      const reviews = await getPullRequestReviews(pr.number);

      const hasApprovals = reviews.some(r => r.state === 'APPROVED');
      const hasChangesRequested = reviews.some(r => r.state === 'CHANGES_REQUESTED');

      // Check if stalled
      if (daysSinceUpdate >= staleDays) {
        issues.stalled.push({
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          url: pr.html_url,
          daysSinceUpdate: Math.floor(daysSinceUpdate),
          daysSinceCreated: Math.floor(daysSinceCreated),
          draft: pr.draft,
          reviewStatus: hasChangesRequested ? 'changes-requested' : hasApprovals ? 'approved' : 'pending',
          assignees: pr.assignees,
          requested_reviewers: pr.requested_reviewers
        });
      }

      // Check if old
      if (daysSinceCreated >= oldDays) {
        issues.old.push({
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          url: pr.html_url,
          daysSinceCreated: Math.floor(daysSinceCreated),
          draft: pr.draft,
          assignees: pr.assignees,
          requested_reviewers: pr.requested_reviewers
        });
      }

      // Check if unassigned
      if (!pr.assignees || pr.assignees.length === 0) {
         let assigned = false;

        // Try to auto-assign to CODEOWNERS if enabled
        if (autoAssignCodeowners && codeowners) {
          const prOwners = await getPRCodeowners(pr.number, codeowners);

          if (prOwners.length > 0) {
            const success = await assignPRToOwners(pr.number, prOwners);
            if (success) {
              core.info(`  ✅ Auto-assigned PR #${pr.number} to: ${prOwners.join(', ')}`);
              assigned = true;
            }
          }
        }

        // If not assigned, add to unassigned list
        if (!assigned) {
          issues.unassigned.push({
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          url: pr.html_url,
          draft: pr.draft,
          assignees: pr.assignees,
          daysSinceCreated: Math.floor(daysSinceCreated),
          requested_reviewers: pr.requested_reviewers
          });
        }
      }

      // Check if blocked
      const labels = pr.labels.map(l => l.name.toLowerCase());
      const isBlocked = blockedLabels.some(label =>
        labels.includes(label.toLowerCase())
      );

      if (isBlocked) {
        issues.blocked.push({
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          url: pr.html_url,
          labels: pr.labels.map(l => l.name).join(', '),
          draft: pr.draft,
          daysSinceCreated: Math.floor(daysSinceCreated),
          assignees: pr.assignees,
          requested_reviewers: pr.requested_reviewers
        });
      }

      // Check if needs review
      if (!pr.draft && reviews.length === 0 && daysSinceCreated >= 2) { // TODO: make this configurable
        issues.needsReview.push({
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          url: pr.html_url,
          daysSinceCreated: Math.floor(daysSinceCreated),
          assignees: pr.assignees,
          requested_reviewers: pr.requested_reviewers
        });
      }
    }

    // Generate report
    const report = generateReport(issues, pullRequests.length, staleDays, oldDays);

    core.info('\n' + report);

    const totalIssues = issues.stalled.length + issues.unassigned.length +
      issues.blocked.length + issues.old.length;

    // Set outputs
    core.setOutput('report', report);
    core.setOutput('stalled-count', issues.stalled.length);
    core.setOutput('unassigned-count', issues.unassigned.length);
    core.setOutput('blocked-count', issues.blocked.length);
    core.setOutput('old-count', issues.old.length);
    core.setOutput('needs-review-count', issues.needsReview.length);
    core.setOutput('total-issues', totalIssues);

    // Create issue if enabled
    if (createIssueEnabled && totalIssues > 0) {
      core.info('📝 Creating issue with report...');
      const issue = await createIssue(
        `PR Status Report - ${new Date().toISOString().split('T')[0]}`,
        report,
        issueLabels
      );
      core.info(`✅ Created issue #${issue.number}`);
    }

    // Auto-comment on stalled PRs if enabled
    if (autoComment && issues.stalled.length > 0) {
      core.info('💬 Adding comments to stalled PRs...');
      await commentOnPRs(issues.stalled, commentMessage);
    }

    if (autoComment && issues.needsReview.length > 0) {
      core.info('💬 Adding comments to PRs needing review...');
      const messageTemplate = '👀 This PR has been open for {days} days without any reviews. {assignees} please take a look!';
      await commentOnPRs(issues.needsReview, messageTemplate);
    }

    // Send notifications
    if (slackWebhook && totalIssues > 0) {
      await sendSlackNotification(slackWebhook, issues, totalIssues);
    }

    if (teamsWebhook && totalIssues > 0) {
      await sendTeamsNotification(teamsWebhook, issues, totalIssues);
    }

    core.info('✅ PR monitoring completed successfully!');

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

function generateReport(issues, totalPRs, staleDays, oldDays) {
  const now = new Date();
  let report = '# 📊 Pull Request Status Report\n\n';
  report += `**Generated:** ${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]} UTC\n`;
  report += `**Total Open PRs:** ${totalPRs}\n\n`;

  const totalIssues = issues.stalled.length + issues.unassigned.length +
    issues.blocked.length + issues.old.length;

  if (totalIssues === 0) {
    report += '## ✅ All Clear!\n\nNo issues found with open pull requests.\n\n';
  } else {
    report += `## ⚠️ Summary\n\n`;
    report += `- 🔴 **${issues.stalled.length}** stalled PRs\n`;
    report += `- 🟡 **${issues.unassigned.length}** unassigned PRs\n`;
    report += `- 🚫 **${issues.blocked.length}** blocked PRs\n`;
    report += `- 📅 **${issues.old.length}** long-running PRs\n`;
    report += `- 👀 **${issues.needsReview.length}** PRs awaiting first review\n\n`;
  }

  // Stalled PRs
  report += `## ⏱️ Stalled PRs (No activity for ${staleDays}+ days)\n\n`;
  if (issues.stalled.length > 0) {
    issues.stalled.forEach(pr => {
      const draftBadge = pr.draft ? '`DRAFT`' : '';
      const reviewBadge = pr.reviewStatus === 'approved' ? '✅' :
        pr.reviewStatus === 'changes-requested' ? '❌' : '⏳';
      report += `- ${reviewBadge} [#${pr.number}](${pr.url}) ${draftBadge} - ${pr.title}\n`;
      report += `  - Author: @${pr.author} | Last updated: **${pr.daysSinceUpdate} days ago**\n\n`;
    });
  } else {
    report += '✅ No stalled PRs found.\n\n';
  }

  // Needs Review
  if (issues.needsReview.length > 0) {
    report += `## 👀 PRs Awaiting First Review\n\n`;
    issues.needsReview.forEach(pr => {
      report += `- [#${pr.number}](${pr.url}) - ${pr.title}\n`;
      report += `  - Author: @${pr.author} | Open for: **${pr.daysSinceCreated} days**\n\n`;
    });
  }

  // Unassigned PRs
  report += `## 👤 Unassigned PRs\n\n`;
  if (issues.unassigned.length > 0) {
    issues.unassigned.forEach(pr => {
      const draftBadge = pr.draft ? '`DRAFT`' : '';
      report += `- [#${pr.number}](${pr.url}) ${draftBadge} - ${pr.title}\n`;
      report += `  - Author: @${pr.author}\n\n`;
    });
  } else {
    report += '✅ No unassigned PRs found.\n\n';
  }

  // Blocked PRs
  report += `## 🚫 Blocked PRs\n\n`;
  if (issues.blocked.length > 0) {
    issues.blocked.forEach(pr => {
      const draftBadge = pr.draft ? '`DRAFT`' : '';
      report += `- [#${pr.number}](${pr.url}) ${draftBadge} - ${pr.title}\n`;
      report += `  - Author: @${pr.author} | Labels: \`${pr.labels}\`\n\n`;
    });
  } else {
    report += '✅ No blocked PRs found.\n\n';
  }

  // Old PRs
  report += `## 📅 Long-Running PRs (Open for ${oldDays}+ days)\n\n`;
  if (issues.old.length > 0) {
    issues.old.forEach(pr => {
      const draftBadge = pr.draft ? '`DRAFT`' : '';
      report += `- [#${pr.number}](${pr.url}) ${draftBadge} - ${pr.title}\n`;
      report += `  - Author: @${pr.author} | Open for: **${pr.daysSinceCreated} days**\n\n`;
    });
  } else {
    report += '✅ No long-running PRs found.\n\n';
  }

  return report;
}

// Function removed - functionality moved to GitHubService.commentOnPRs()

async function sendSlackNotification(webhookUrl, issues, totalIssues) {
  try {
    const message = {
      text: `🔔 *PR Status Alert*: ${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found`,
      blocks: [{
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Pull Request Status Report'
        }
      },
        {
          type: 'section',
          fields: [{
            type: 'mrkdwn',
            text: `*Stalled PRs:*\n${issues.stalled.length}`
          },
            {
              type: 'mrkdwn',
              text: `*Unassigned PRs:*\n${issues.unassigned.length}`
            },
            {
              type: 'mrkdwn',
              text: `*Blocked PRs:*\n${issues.blocked.length}`
            },
            {
              type: 'mrkdwn',
              text: `*Long-running PRs:*\n${issues.old.length}`
            }
          ]
        }
      ]
    };

    await axios.post(webhookUrl, message);
    core.info('✅ Slack notification sent');
  } catch (error) {
    core.warning(`Failed to send Slack notification: ${error.message}`);
  }
}

async function sendTeamsNotification(webhookUrl, issues, totalIssues) {
  try {
    const message = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: 'FF6B35',
      summary: `PR Status Alert: ${totalIssues} issues found`,
      sections: [{
        activityTitle: 'Pull Request Status Report',
        facts: [
          { name: 'Stalled PRs', value: issues.stalled.length.toString() },
          { name: 'Unassigned PRs', value: issues.unassigned.length.toString() },
          { name: 'Blocked PRs', value: issues.blocked.length.toString() },
          { name: 'Long-running PRs', value: issues.old.length.toString() }
        ]
      }]
    };

    await axios.post(webhookUrl, message);
    core.info('✅ Teams notification sent');
  } catch (error) {
    core.warning(`Failed to send Teams notification: ${error.message}`);
  }
}

module.exports = {
  run
}

run();
