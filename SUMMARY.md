# 🚀 PR Status Monitor - GitHub Action

## Overview
A comprehensive GitHub Action that monitors pull request status to identify stalled, unassigned, or blocked pull requests. This action helps maintain repository health by proactively identifying PRs that need attention.

## ✨ Features

### 🔍 Comprehensive Monitoring
- **Stalled PRs**: Identifies PRs with no activity for a specified number of days
- **Unassigned PRs**: Finds PRs without any assignees
- **Blocked PRs**: Detects PRs with failing checks, merge conflicts, or other blocking issues
- **Health Status**: Categorizes all PRs into healthy, stalled, unassigned, or blocked

### 📊 Detailed Analysis
- Checks CI/CD status and test results
- Analyzes review status and pending reviews
- Monitors recent activity and comments
- Detects merge conflicts and draft status
- Tracks label-based exclusions

### 💬 Automated Actions
- Posts informative comments on problematic PRs
- Creates summary issues for team visibility
- Provides actionable suggestions for resolution
- Supports dry-run mode for testing

### ⚙️ Flexible Configuration
- Configurable stale day threshold
- Label-based exclusions (WIP, draft, etc.)
- Optional notification channels
- Manual workflow triggers
- Environment-specific settings

## 📁 File Structure

```
.github/
├── actions/
│   └── pr-status-monitor/
│       ├── action.yml              # Action metadata
│       ├── package.json            # Dependencies
│       ├── README.md              # Documentation
│       ├── examples.md            # Usage examples
│       ├── build.sh               # Build script
│       ├── .eslintrc.js           # Linting config
│       ├── src/
│       │   ├── index.js           # Main action code
│       │   └── index.test.js      # Unit tests
│       └── dist/
│           └── index.js           # Compiled action
└── workflows/
    └── pr-status-monitor.yml      # Workflow definition
```

## 🚀 Quick Start

### 1. Basic Setup
The action is already configured and ready to use. It will run automatically on weekdays at 9 AM UTC.

### 2. Manual Trigger
You can also trigger it manually from the GitHub Actions tab with custom parameters:
- `staleDays`: Number of days to consider a PR as stale
- `excludeLabels`: Labels to exclude from monitoring
- `dryRun`: Test mode without posting comments

### 3. Custom Configuration
Modify `.github/workflows/pr-status-monitor.yml` to adjust:
- Schedule frequency
- Input parameters
- Notification settings
- Branch-specific behavior

## 📋 Configuration Options

| Input | Description | Default | Required |
|-------|-------------|---------|----------|
| `token` | GitHub token for API access | - | ✅ |
| `staleDays` | Days to consider PR as stale | `7` | ❌ |
| `excludeLabels` | Labels to exclude | `wip,draft` | ❌ |
| `notifyChannel` | Notification webhook URL | - | ❌ |
| `dryRun` | Run without posting comments | `false` | ❌ |

## 📤 Outputs

| Output | Description |
|--------|-------------|
| `stalled-count` | Number of stalled PRs |
| `unassigned-count` | Number of unassigned PRs |
| `blocked-count` | Number of blocked PRs |
| `healthy-count` | Number of healthy PRs |
| `total-count` | Total open PRs |
| `report` | Formatted status report |

## 🔧 Advanced Usage

### Custom Schedules
```yaml
on:
  schedule:
    # Daily check
    - cron: '0 9 * * 1-5'
    # Weekly comprehensive report
    - cron: '0 10 * * 1'
    # Hourly critical check
    - cron: '0 * * * *'
```

### Environment-Specific Settings
```yaml
jobs:
  monitor-dev:
    if: github.ref == 'refs/heads/develop'
    steps:
      - uses: ./.github/actions/pr-status-monitor
        with:
          staleDays: '3'  # More aggressive for dev
          
  monitor-main:
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: ./.github/actions/pr-status-monitor
        with:
          staleDays: '7'  # Standard for main
```

### Integration with Notifications
```yaml
- uses: ./.github/actions/pr-status-monitor
  with:
    notifyChannel: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## 🧪 Testing

The action includes comprehensive unit tests:
```bash
cd .github/actions/pr-status-monitor
npm test
```

## 🔨 Development

### Building the Action
```bash
cd .github/actions/pr-status-monitor
npm install
npm run build
```

### Linting
```bash
npm run lint
```

### Testing Changes
Use dry-run mode to test without affecting PRs:
```yaml
- uses: ./.github/actions/pr-status-monitor
  with:
    dryRun: 'true'
```

## 📊 Monitoring Results

The action provides detailed reports including:

### Sample Report
```
# 📊 PR Status Report

**Total Open PRs:** 15
**Healthy PRs:** 8
**Stalled PRs:** 3
**Unassigned PRs:** 2
**Blocked PRs:** 2

## 🐌 Stalled PRs (3)

- [#123](https://github.com/owner/repo/pull/123) - Feature implementation (10 days)
  - No recent activity
- [#124](https://github.com/owner/repo/pull/124) - Bug fix (8 days)
  - 2 pending check(s)

## 👤 Unassigned PRs (2)

- [#125](https://github.com/owner/repo/pull/125) - Documentation update
- [#126](https://github.com/owner/repo/pull/126) - Test improvements

## 🚫 Blocked PRs (2)

- [#127](https://github.com/owner/repo/pull/127) - New feature
  - ❌ 1 failing check(s)
  - ⚠️ Merge conflicts detected
```

## 🛠️ Troubleshooting

### Common Issues
1. **Permission Errors**: Ensure the GitHub token has required permissions
2. **Rate Limiting**: The action respects GitHub API rate limits
3. **Missing Dependencies**: Run `npm install` in the action directory

### Debug Mode
Enable dry-run mode to test without posting comments:
```yaml
dryRun: 'true'
```

## 📈 Benefits

- **Proactive Management**: Identifies issues before they become problems
- **Team Visibility**: Keeps everyone informed about PR status
- **Automated Workflow**: Reduces manual monitoring overhead
- **Customizable**: Adapts to your team's workflow and requirements
- **Comprehensive**: Covers all aspects of PR health

## 🔮 Future Enhancements

Potential improvements could include:
- Integration with project management tools
- Custom notification templates
- Advanced filtering options
- Historical trend analysis
- Team-specific notifications

---

*This GitHub Action was created to help maintain repository health by proactively monitoring pull request status and identifying areas that need attention.*
