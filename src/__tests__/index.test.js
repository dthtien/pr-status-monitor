const core = require('@actions/core');
const axios = require('axios');

// Mock the dependencies
jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('axios');
jest.mock('../github-service');
jest.mock('../codeowners');


const mockInputs = {
  'github-token': 'fake-token',
  'stale-days': '7',
  'old-days': '14',
  'blocked-labels': 'blocked,on-hold',
  'create-issue': 'false',
  'issue-labels': 'report,automation',
  'auto-comment': 'false',
  'comment-message': 'This PR has been inactive for {days} days',
  'slack-webhook': '',
  'teams-webhook': '',
  'ignore-drafts': 'false'
};
const mockGithubService = {
  listPullRequests: jest.fn(),
  getPullRequestReviews: jest.fn(),
  createIssue: jest.fn(),
  commentOnPRs: jest.fn()
};

const mockCodeowners = {
  loadCodeowners: jest.fn().mockResolvedValue(null),
  getPRCodeowners: jest.fn().mockResolvedValue([]),
  assignPRToOwners: jest.fn().mockResolvedValue(false)
};

describe('PR Status Monitor Action', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Reset singleton and clear cache
    delete require.cache[require.resolve('../github-service')];
    delete require.cache[require.resolve('../index')];

    // Default input values

    core.getInput = jest.fn((name) => mockInputs[name] || '');
    core.setOutput = jest.fn();
    core.setFailed = jest.fn();
    core.info = jest.fn();
    core.warning = jest.fn();
    core.debug = jest.fn();

    // Mock github-service functions
    require('../github-service').listPullRequests = mockGithubService.listPullRequests;
    require('../github-service').getPullRequestReviews = mockGithubService.getPullRequestReviews;
    require('../github-service').createIssue = mockGithubService.createIssue;
    require('../github-service').commentOnPRs = mockGithubService.commentOnPRs;

    // Mock codeowners functions

    require('../codeowners').loadCodeowners = mockCodeowners.loadCodeowners;
    require('../codeowners').getPRCodeowners = mockCodeowners.getPRCodeowners;
    require('../codeowners').assignPRToOwners = mockCodeowners.assignPRToOwners;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PR Detection', () => {
    test('should detect stalled PRs', async () => {
      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 1,
          title: 'Stalled PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/1',
          created_at: stalledDate.toISOString(),
          updated_at: stalledDate.toISOString(),
          draft: false,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      expect(core.setOutput).toHaveBeenCalledWith('stalled-count', 1);
    });

    test('should detect unassigned PRs', async () => {
      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 2,
          title: 'Unassigned PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/2',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          draft: false,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      expect(core.setOutput).toHaveBeenCalledWith('unassigned-count', 1);
    });

    test('should detect blocked PRs', async () => {
      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 3,
          title: 'Blocked PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/3',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          draft: false,
          assignees: [{ login: 'assignee' }],
          requested_reviewers: [],
          labels: [{ name: 'blocked' }]
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      expect(core.setOutput).toHaveBeenCalledWith('blocked-count', 1);
    });

    test('should detect old PRs', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 20);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 4,
          title: 'Old PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/4',
          created_at: oldDate.toISOString(),
          updated_at: new Date().toISOString(),
          draft: false,
          assignees: [{ login: 'assignee' }],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      expect(core.setOutput).toHaveBeenCalledWith('old-count', 1);
    });

    test('should detect PRs needing review', async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 5,
          title: 'PR Needs Review',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/5',
          created_at: threeDaysAgo.toISOString(),
          updated_at: threeDaysAgo.toISOString(),
          draft: false,
          assignees: [{ login: 'assignee' }],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      expect(core.setOutput).toHaveBeenCalledWith('needs-review-count', 1);
    });

    test('should ignore draft PRs when configured', async () => {
      mockInputs['ignore-drafts'] = 'true';

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 6,
          title: 'Draft PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/6',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          draft: true,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      // Should not count draft PR
      expect(core.setOutput).toHaveBeenCalledWith('unassigned-count', 0);
      expect(core.debug).toHaveBeenCalledWith('Skipping draft PR #6');
    });
  });

  describe('Review Status Detection', () => {
    test('should detect approved PRs', async () => {
      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 7,
          title: 'Approved PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/7',
          created_at: stalledDate.toISOString(),
          updated_at: stalledDate.toISOString(),
          draft: false,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([{ state: 'APPROVED' }]);

      const { run } = require('../index');
      await run();

      // Should still be counted as stalled
      expect(core.setOutput).toHaveBeenCalledWith('stalled-count', 1);
    });

    test('should detect PRs with changes requested', async () => {
      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 8,
          title: 'PR with changes requested',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/8',
          created_at: stalledDate.toISOString(),
          updated_at: stalledDate.toISOString(),
          draft: false,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([{ state: 'CHANGES_REQUESTED' }]);

      const { run } = require('../index');
      await run();

      expect(core.setOutput).toHaveBeenCalledWith('stalled-count', 1);
    });
  });

  describe('Issue Creation', () => {
    test('should create issue when enabled and issues found', async () => {
      mockInputs['create-issue'] = 'true';

      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 9,
          title: 'Stalled PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/9',
          created_at: stalledDate.toISOString(),
          updated_at: stalledDate.toISOString(),
          draft: false,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);
      mockGithubService.createIssue.mockResolvedValue({ number: 100 });

      const { run } = require('../index');
      await run();

      expect(mockGithubService.createIssue).toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('✅ Created issue #100');
    });

    test('should not create issue when no issues found', async () => {
      mockInputs['create-issue'] = 'true';

      mockGithubService.listPullRequests.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      expect(mockGithubService.createIssue).not.toHaveBeenCalled();
    });
  });

  describe('Auto-commenting', () => {
    test('should comment on stalled PRs when enabled', async () => {
      mockInputs['auto-comment'] = 'true';

      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 10,
          title: 'Stalled PR',
          user: { login: 'author' },
          html_url: 'https://github.com/test/pr/10',
          created_at: stalledDate.toISOString(),
          updated_at: stalledDate.toISOString(),
          draft: false,
          assignees: [{ login: 'assignee1' }],
          requested_reviewers: [{ login: 'reviewer1' }],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);
      const { run } = require('../index');
      await run();

      expect(mockGithubService.commentOnPRs).toHaveBeenCalled();
    });

    test('should not comment if recent bot comment exists', async () => {
      mockInputs['auto-comment'] = 'true';

      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      const recentComment = new Date();
      recentComment.setDate(recentComment.getDate() - 3);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 11,
          title: 'Stalled PR with recent comment',
          user: { login: 'author' },
          html_url: 'https://github.com/test/pr/11',
          created_at: stalledDate.toISOString(),
          updated_at: stalledDate.toISOString(),
          draft: false,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);
      const { run } = require('../index');
      await run();

      expect(mockGithubService.commentOnPRs).toHaveBeenCalled();
    });

    test('should replace {days} placeholder in comment', async () => {
      mockInputs['auto-comment'] = 'true';
      mockInputs['comment-message'] = 'Inactive for {days} days';

      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 12,
          title: 'Stalled PR',
          user: { login: 'author' },
          html_url: 'https://github.com/test/pr/12',
          created_at: stalledDate.toISOString(),
          updated_at: stalledDate.toISOString(),
          draft: false,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      expect(mockGithubService.commentOnPRs).toHaveBeenCalledWith(
        expect.any(Array),
        expect.stringContaining('Inactive for')
      );
    });

    test('should mention assignees and reviewers in comment', async () => {
      mockInputs['auto-comment'] = 'true';

      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 13,
          title: 'PR needs review',
          user: { login: 'author' },
          html_url: 'https://github.com/test/pr/13',
          created_at: threeDaysAgo.toISOString(),
          updated_at: threeDaysAgo.toISOString(),
          draft: false,
          assignees: [{ login: 'assignee1' }],
          requested_reviewers: [{ login: 'reviewer1' }],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      // Should comment on PRs needing review
      expect(mockGithubService.commentOnPRs).toHaveBeenCalled();
    });
  });

  describe('Notifications', () => {
    test('should send Slack notification when webhook configured', async () => {
      mockInputs['slack-webhook'] = 'https://hooks.slack.com/test';

      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 14,
          title: 'Stalled PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/14',
          created_at: stalledDate.toISOString(),
          updated_at: stalledDate.toISOString(),
          draft: false,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);
      axios.post.mockResolvedValue({});

      const { run } = require('../index');
      await run();

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: expect.stringContaining('PR Status Alert')
        })
      );
      expect(core.info).toHaveBeenCalledWith('✅ Slack notification sent');
    });

    test('should send Teams notification when webhook configured', async () => {
      mockInputs['teams-webhook'] = 'https://outlook.office.com/webhook/test';

      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 15,
          title: 'Stalled PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/15',
          created_at: stalledDate.toISOString(),
          updated_at: stalledDate.toISOString(),
          draft: false,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);
      axios.post.mockResolvedValue({});

      const { run } = require('../index');
      await run();

      expect(axios.post).toHaveBeenCalledWith(
        'https://outlook.office.com/webhook/test',
        expect.objectContaining({
          '@type': 'MessageCard'
        })
      );
      expect(core.info).toHaveBeenCalledWith('✅ Teams notification sent');
    });

    test('should not send notifications when no issues found', async () => {
      mockInputs['slack-webhook'] = 'https://hooks.slack.com/test';

      mockGithubService.listPullRequests.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('Report Generation', () => {
    test('should generate report with all sections', async () => {
      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 16,
          title: 'Test PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/16',
          created_at: stalledDate.toISOString(),
          updated_at: stalledDate.toISOString(),
          draft: false,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      const reportCall = core.setOutput.mock.calls.find(call => call[0] === 'report');
      expect(reportCall).toBeDefined();

      const report = reportCall[1];
      expect(report).toContain('Pull Request Status Report');
      expect(report).toContain('Stalled PRs');
      expect(report).toContain('Unassigned PRs');
      expect(report).toContain('Blocked PRs');
      expect(report).toContain('Long-Running PRs');
    });

    test('should show "All Clear" when no issues', async () => {
      mockGithubService.listPullRequests.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      const reportCall = core.setOutput.mock.calls.find(call => call[0] === 'report');
      const report = reportCall[1];

      expect(report).toContain('All Clear!');
      expect(report).toContain('No issues found');
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      mockGithubService.listPullRequests.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      const { run } = require('../index');
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        'Action failed: API rate limit exceeded'
      );
    });

    test('should handle Slack notification errors', async () => {
      mockInputs['slack-webhook'] = 'https://hooks.slack.com/test';

      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      mockGithubService.listPullRequests.mockResolvedValue([{
          number: 18,
          title: 'Stalled PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/pr/18',
          created_at: stalledDate.toISOString(),
          updated_at: stalledDate.toISOString(),
          draft: false,
          assignees: [],
          requested_reviewers: [],
          labels: []
        }]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);
      axios.post.mockRejectedValue(new Error('Network error'));

      const { run } = require('../index');
      await run();

      expect(core.warning).toHaveBeenCalledWith(
        'Failed to send Slack notification: Network error'
      );
    });
  });

  describe('Multiple Issues', () => {
    test('should count total issues correctly', async () => {
      const stalledDate = new Date();
      stalledDate.setDate(stalledDate.getDate() - 10);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 20);

      mockGithubService.listPullRequests.mockResolvedValue([
          {
            number: 19,
            title: 'Stalled PR',
            user: { login: 'user1' },
            html_url: 'https://github.com/test/pr/19',
            created_at: stalledDate.toISOString(),
            updated_at: stalledDate.toISOString(),
            draft: false,
            assignees: [],
            requested_reviewers: [],
            labels: []
          },
          {
            number: 20,
            title: 'Old PR',
            user: { login: 'user2' },
            html_url: 'https://github.com/test/pr/20',
            created_at: oldDate.toISOString(),
            updated_at: new Date().toISOString(),
            draft: false,
            assignees: [{ login: 'assignee' }],
            requested_reviewers: [],
            labels: []
          },
          {
            number: 21,
            title: 'Blocked PR',
            user: { login: 'user3' },
            html_url: 'https://github.com/test/pr/21',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            draft: false,
            assignees: [{ login: 'assignee' }],
            requested_reviewers: [],
            labels: [{ name: 'blocked' }]
          }
        ]);

      mockGithubService.getPullRequestReviews.mockResolvedValue([]);

      const { run } = require('../index');
      await run();

      // PR 19: stalled + unassigned = 2 issues
      // PR 20: old = 1 issue
      // PR 21: blocked = 1 issue
      // Total = 4 issues
      expect(core.setOutput).toHaveBeenCalledWith('total-issues', 4);
    });
  });
});
