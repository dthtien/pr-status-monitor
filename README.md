# PR Status Monitor Configuration

## Overview
This GitHub Action monitors pull request status to identify:
- **Stalled PRs**: PRs with no activity for a specified number of days
- **Unassigned PRs**: PRs without any assignees
- **Blocked PRs**: PRs with failing checks, merge conflicts, or other blocking issues

## Features
- 🔍 Comprehensive PR analysis
- 📊 Detailed status reporting
- 💬 Automated PR comments
- 📢 Optional notifications
- 🏷️ Label-based exclusions
- ⚙️ Configurable thresholds

## Configuration Options

### Inputs
- `github-token`: GitHub token for API access (required)
- `stale-days`: Days to consider a PR as stale (default: 7)
- `old-days`: Days to consider a PR as old/long-running (default: 30)
- `blocked-labels`: Comma-separated labels that indicate blocked PRs (default: 'blocked,wip,draft')
- `create-issue`: Create a GitHub issue with the report (default: true)
- `issue-labels`: Labels to add to created issues (default: 'pr-monitor,automated')
- `auto-comment`: Automatically comment on stalled PRs (default: false)
- `comment-message`: Message template for auto-comments (use {days} placeholder)
- `slack-webhook`: Slack webhook URL for notifications (optional)
- `teams-webhook`: Microsoft Teams webhook URL for notifications (optional)
- `ignore-drafts`: Skip draft PRs from monitoring (default: false)

### Outputs
- `stalled-count`: Number of stalled PRs
- `unassigned-count`: Number of unassigned PRs
- `blocked-count`: Number of blocked PRs
- `old-count`: Number of long-running PRs
- `needs-review-count`: Number of PRs awaiting first review
- `total-issues`: Total number of issues found
- `report`: Formatted status report

## Usage Examples

### Basic Usage
```yaml
- uses: ./.github/actions/pr-status-monitor
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Custom Configuration
```yaml
- uses: ./.github/actions/pr-status-monitor
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    stale-days: '14'
    old-days: '60'
    blocked-labels: 'blocked,wip,draft,experimental'
    auto-comment: 'true'
    ignore-drafts: 'true'
```

### With Notifications
```yaml
- uses: ./.github/actions/pr-status-monitor
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    slack-webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
    teams-webhook: ${{ secrets.TEAMS_WEBHOOK_URL }}
```

## Workflow Integration

The action is designed to run on a schedule (weekdays at 9 AM UTC) and can also be triggered manually. It will:

1. Fetch all open pull requests
2. Analyze each PR for issues
3. Generate a comprehensive report
4. Post comments on problematic PRs
5. Create summary issues when needed
6. Send notifications (if configured)

## Permissions Required
- `issues: write` - To post comments and create summary issues
- `pull-requests: read` - To fetch PR data
- `checks: read` - To check CI/CD status
- `contents: read` - To access repository information

## Customization

### Adding New Blocking Conditions
Modify the `getPRStatus` method in `src/index.js` to add new conditions:

```javascript
// Example: Block PRs with specific labels
if (pr.labels.some(label => label.name === 'needs-review')) {
  status.isBlocked = true;
  status.issues.push('🏷️ Needs review label');
}
```

### Custom Notifications
Implement the `sendNotifications` method to integrate with your preferred notification system (Slack, Discord, email, etc.).

## Troubleshooting

### Common Issues
1. **Permission errors**: Ensure the GitHub token has the required permissions
2. **Rate limiting**: The action respects GitHub API rate limits
3. **Missing dependencies**: Run `npm install` in the action directory

### Debug Mode
Set `dryRun: 'true'` to test the action without posting comments or creating issues.

## Contributing
To modify or extend this action:
1. Update the source code in `src/index.js`
2. Run `npm run build` to compile
3. Test with `npm run test`
4. Update this documentation as needed
