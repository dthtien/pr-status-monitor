# PR Status Monitor - Example Configuration

## Basic Workflow
This is a minimal workflow that runs the PR monitor daily:

```yaml
name: Daily PR Check
on:
  schedule:
    - cron: '0 9 * * 1-5'  # Weekdays at 9 AM UTC

permissions:
  pull-requests: write
  issues: write
  contents: read

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/pr-status-monitor
        with:
          token: ${{ github.token }}
```

## Advanced Configuration
This example shows all available options:

```yaml
name: Advanced PR Monitor
on:
  schedule:
    - cron: '0 9 * * 1-5'
  workflow_dispatch:
    inputs:
      staleDays:
        description: 'Days to consider PR as stale'
        default: '7'
        type: string
      excludeLabels:
        description: 'Labels to exclude'
        default: 'wip,draft'
        type: string

jobs:
  monitor:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: read
      checks: read
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install and Build Action
        run: |
          cd .github/actions/pr-status-monitor
          npm install
          npm run build

      - name: Run PR Monitor
        id: pr-monitor
        uses: ./.github/actions/pr-status-monitor
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          staleDays: ${{ inputs.staleDays || '7' }}
          excludeLabels: ${{ inputs.excludeLabels || 'wip,draft' }}
          notifyChannel: ${{ secrets.SLACK_WEBHOOK_URL }}
          dryRun: ${{ github.event_name == 'workflow_dispatch' }}

      - name: Post Summary
        if: steps.pr-monitor.outputs.stalled-count > 0
        run: |
          echo "Found ${{ steps.pr-monitor.outputs.stalled-count }} stalled PRs"
          echo "Found ${{ steps.pr-monitor.outputs.blocked-count }} blocked PRs"
```

## Custom Labels Configuration
Exclude specific labels from monitoring:

```yaml
- uses: ./.github/actions/pr-status-monitor
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    excludeLabels: 'wip,draft,experimental,on-hold'
```

## Notification Integration
Send alerts to Slack:

```yaml
- uses: ./.github/actions/pr-status-monitor
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    slack-webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
    teams-webhook: ${{ secrets.TEAMS_WEBHOOK_URL }}
```

## Dry Run Mode
Test the action without posting comments:

```yaml
- uses: ./.github/actions/pr-status-monitor
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    dryRun: 'true'
```

## Multiple Schedules
Run at different times for different purposes:

```yaml
name: PR Monitor
on:
  schedule:
    # Daily check for stalled PRs
    - cron: '0 9 * * 1-5'
    # Weekly comprehensive report
    - cron: '0 10 * * 1'
    # Hourly check for critical issues
    - cron: '0 * * * *'

jobs:
  daily-check:
    if: github.event.schedule == '0 9 * * 1-5'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/pr-status-monitor
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          staleDays: '7'

  weekly-report:
    if: github.event.schedule == '0 10 * * 1'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/pr-status-monitor
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          staleDays: '14'
          excludeLabels: 'wip,draft,experimental'

  critical-check:
    if: github.event.schedule == '0 * * * *'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/pr-status-monitor
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          staleDays: '1'
          excludeLabels: 'wip,draft'
```

## Conditional Execution
Only run on specific branches or conditions:

```yaml
jobs:
  monitor:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/pr-status-monitor
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Integration with Other Actions
Combine with other monitoring tools:

```yaml
jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: PR Status Monitor
        id: pr-monitor
        uses: ./.github/actions/pr-status-monitor
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Security Scan
        uses: github/super-linter@v4

      - name: Dependency Check
        uses: actions/dependency-review-action@v3

      - name: Combined Report
        if: always()
        run: |
          echo "PR Status: ${{ steps.pr-monitor.outputs.report }}"
          echo "Security: Completed"
          echo "Dependencies: Checked"
```

## Environment-Specific Configuration
Different settings for different environments:

```yaml
jobs:
  monitor-dev:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/pr-status-monitor
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          staleDays: '3'  # More aggressive for dev
          excludeLabels: 'wip'

  monitor-main:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/pr-status-monitor
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          staleDays: '7'  # Standard for main
          excludeLabels: 'wip,draft'
```
