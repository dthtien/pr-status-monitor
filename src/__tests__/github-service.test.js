const core = require('@actions/core');
const github = require('@actions/github');

// Mock the dependencies
jest.mock('@actions/core');
jest.mock('@actions/github');
let githubService;
// Mock Octokit
const mockOctokit = {
  rest: {
    repos: {
      getContent: jest.fn()
    },
    pulls: {
      list: jest.fn(),
      listReviews: jest.fn(),
      listFiles: jest.fn()
    },
    issues: {
      create: jest.fn(),
      addAssignees: jest.fn(),
      listComments: jest.fn(),
      createComment: jest.fn()
    }
  }
};


describe('GitHubService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton
    const GitHubService = require('../github-service');
    GitHubService.reset();

    // Mock inputs
    core.getInput = jest.fn((name) => {
      if (name === 'github-token') return 'fake-token';
      return '';
    });
    core.debug = jest.fn();
    core.info = jest.fn();
    core.warning = jest.fn();
    core.error = jest.fn();

    github.getOctokit = jest.fn().mockReturnValue(mockOctokit);
    github.context = {
      repo: {
        owner: 'test-owner',
        repo: 'test-repo'
      }
    };

    // Get fresh singleton instance
    delete require.cache[require.resolve('../github-service')];
    githubService = require('../github-service');
  });

  describe('getContent', () => {
    test('should return content when file exists', async () => {
      const mockData = { content: 'base64content', name: 'test.txt' };
      mockOctokit.rest.repos.getContent.mockResolvedValue({ data: mockData });

      const result = await githubService.getContent('test.txt');

      expect(result).toEqual(mockData);
      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'test.txt'
      });
    });

    test('should return null when file does not exist', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(new Error('Not Found'));

      const result = await githubService.getContent('missing.txt');

      expect(result).toBeNull();
      expect(core.debug).toHaveBeenCalledWith('Content not found at: missing.txt');
    });
  });

  describe('listPullRequests', () => {
    test('should return pull requests list', async () => {
      const mockPRs = [{ number: 1, title: 'Test PR' }];
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: mockPRs });

      const result = await githubService.listPullRequests();

      expect(result).toEqual(mockPRs);
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        state: 'open',
        per_page: 100,
        sort: 'updated',
        direction: 'asc'
      });
    });

    test('should throw error when API call fails', async () => {
      mockOctokit.rest.pulls.list.mockRejectedValue(new Error('API Error'));

      await expect(githubService.listPullRequests()).rejects.toThrow('API Error');
      expect(core.error).toHaveBeenCalledWith('Failed to list pull requests: API Error');
    });
  });

  describe('getPullRequestReviews', () => {
    test('should return reviews for a PR', async () => {
      const mockReviews = [{ state: 'APPROVED' }];
      mockOctokit.rest.pulls.listReviews.mockResolvedValue({ data: mockReviews });

      const result = await githubService.getPullRequestReviews(123);

      expect(result).toEqual(mockReviews);
      expect(mockOctokit.rest.pulls.listReviews).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123
      });
    });
  });

  describe('getPullRequestFiles', () => {
    test('should return files for a PR', async () => {
      const mockFiles = [{ filename: 'test.js' }];
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({ data: mockFiles });

      const result = await githubService.getPullRequestFiles(123);

      expect(result).toEqual(mockFiles);
    });

    test('should return empty array on error', async () => {
      mockOctokit.rest.pulls.listFiles.mockRejectedValue(new Error('API Error'));

      const result = await githubService.getPullRequestFiles(123);

      expect(result).toEqual([]);
      expect(core.warning).toHaveBeenCalledWith('Failed to get PR files: API Error');
    });
  });

  describe('assignPullRequest', () => {
    test('should assign users to PR successfully', async () => {
      mockOctokit.rest.issues.addAssignees.mockResolvedValue();

      const result = await githubService.assignPullRequest(123, ['user1', 'user2']);

      expect(result).toBe(true);
      expect(mockOctokit.rest.issues.addAssignees).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        assignees: ['user1', 'user2']
      });
    });

    test('should return false on assignment failure', async () => {
      mockOctokit.rest.issues.addAssignees.mockRejectedValue(new Error('Failed'));

      const result = await githubService.assignPullRequest(123, ['user1']);

      expect(result).toBe(false);
      expect(core.warning).toHaveBeenCalledWith('Failed to assign PR #123: Failed');
    });
  });

  describe('createIssue', () => {
    test('should create issue successfully', async () => {
      const mockIssue = { number: 456, html_url: 'test-url' };
      mockOctokit.rest.issues.create.mockResolvedValue({ data: mockIssue });

      const result = await githubService.createIssue('Test Issue', 'Body', ['label1']);

      expect(result).toEqual(mockIssue);
      expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'Test Issue',
        body: 'Body',
        labels: ['label1']
      });
    });
  });

  describe('commentOnPRs', () => {
    test('should comment on PRs without recent bot comments', async () => {
      const mockPRs = [{
        number: 123,
        author: 'test-user',
        assignees: [],
        requested_reviewers: [],
        daysSinceUpdate: 5
      }];

      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] });

      await githubService.commentOnPRs(mockPRs, 'Test comment for {days} days');

      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: 'Test comment for 5 days'
      });
      expect(core.info).toHaveBeenCalledWith('💬 Commenting on PR #123 with message: Test comment for 5 days');
    });

    test('should skip PRs with recent bot comments', async () => {
      const mockPRs = [{
        number: 123,
        author: 'test-user',
        assignees: [],
        requested_reviewers: []
      }];


      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [
          {
            user: { type: 'Bot' },
            body: 'This PR has been inactive for a while.',
            created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
          }
        ]
      });

      await githubService.commentOnPRs(mockPRs, 'Test comment');

      expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
      expect(core.debug).toHaveBeenCalledWith('  ⏭️  Skipped PR #123 (already commented recently)');
    });
  });

  describe('getContext', () => {
    test('should return owner and repo', () => {
      const context = githubService.getContext();

      expect(context).toEqual({
        owner: 'test-owner',
        repo: 'test-repo'
      });
      expect(core.getInput).toHaveBeenCalledWith('github-token', { required: true });
      expect(github.getOctokit).toHaveBeenCalledWith('fake-token');
    });
  });
});
