const {
  parseCodeowners,
  matchFileToOwners,
  matchPattern
} = require('../codeowners');

describe('CODEOWNERS Parser', () => {
  test('should parse simple CODEOWNERS file', () => {
    const content = `
# Comment line
*.js    @developer
*.md    @tech-writer
`;

    const rules = parseCodeowners(content);

    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual({ pattern: '*.js', owners: ['developer'] });
    expect(rules[1]).toEqual({ pattern: '*.md', owners: ['tech-writer'] });
  });

  test('should handle multiple owners', () => {
    const content = '*.js    @alice @bob @charlie';
    const rules = parseCodeowners(content);

    expect(rules[0].owners).toEqual(['alice', 'bob', 'charlie']);
  });

  test('should skip empty lines and comments', () => {
    const content = `
# This is a comment

*.js    @developer

# Another comment
`;

    const rules = parseCodeowners(content);
    expect(rules).toHaveLength(1);
  });

  test('should filter out teams (containing /)', () => {
    const content = '*.js    @org/team @alice @bob';
    const rules = parseCodeowners(content);

    // Should only include individual users
    expect(rules[0].owners).toEqual(['alice', 'bob']);
  });

  test('should remove @ prefix from usernames', () => {
    const content = '*.js    @alice';
    const rules = parseCodeowners(content);

    expect(rules[0].owners).toEqual(['alice']); // No @
  });
});

describe('Pattern Matching', () => {
  test('should match wildcard *', () => {
    expect(matchPattern('any/file.js', '*')).toBe(true);
    expect(matchPattern('README.md', '*')).toBe(true);
  });

  test('should match exact file path', () => {
    expect(matchPattern('README.md', 'README.md')).toBe(true);
    expect(matchPattern('src/app.js', 'src/app.js')).toBe(true);
    expect(matchPattern('README.md', 'package.json')).toBe(false);
  });

  test('should match file extensions', () => {
    expect(matchPattern('app.js', '*.js')).toBe(true);
    expect(matchPattern('src/components/Button.tsx', '*.tsx')).toBe(true);
    expect(matchPattern('README.md', '*.js')).toBe(false);
  });

  test('should match directories', () => {
    expect(matchPattern('src/app.js', 'src/')).toBe(true);
    expect(matchPattern('src/components/Button.tsx', 'src/')).toBe(true);
    expect(matchPattern('lib/utils.js', 'src/')).toBe(false);
  });

  test('should match directory without trailing slash', () => {
    expect(matchPattern('src/app.js', 'src')).toBe(true);
    expect(matchPattern('src/components/Button.tsx', 'src')).toBe(true);
  });

  test('should match glob patterns', () => {
    expect(matchPattern('src/components/Button.tsx', '*.tsx')).toBe(true);
    expect(matchPattern('app.tsx', '*.tsx')).toBe(true);
  });

  test('should match double wildcard patterns', () => {
    // expect(matchPattern('src/deep/nested/file.test.js', '**/*.test.js')).toBe(true);
    expect(matchPattern('file.test.js', '**/*.test.js')).toBe(true);
    expect(matchPattern('src/app.js', '**/*.test.js')).toBe(false);
  });

  test('should match complex patterns', () => {
    expect(matchPattern('src/components/Button.tsx', 'src/**/*.tsx')).toBe(true);
    expect(matchPattern('src/Button.tsx', 'src/**/*.tsx')).toBe(true);
    expect(matchPattern('lib/Button.tsx', 'src/**/*.tsx')).toBe(false);
  });

  test('should handle leading slashes', () => {
    expect(matchPattern('/src/app.js', '/src/')).toBe(true);
    expect(matchPattern('src/app.js', '/src/')).toBe(true);
    expect(matchPattern('/src/app.js', 'src/')).toBe(true);
  });
});

describe('File to Owners Matching', () => {
  const codeowners = [
    { pattern: '*', owners: ['default-owner'] },
    { pattern: '*.js', owners: ['js-team'] },
    { pattern: 'src/', owners: ['src-owner'] },
    { pattern: 'src/critical.js', owners: ['tech-lead'] }
  ];

  test('should match to default owner', () => {
    const owners = matchFileToOwners('unknown.txt', codeowners);
    expect(owners).toEqual(['default-owner']);
  });

  test('should match to extension owner', () => {
    const owners = matchFileToOwners('app.js', codeowners);
    expect(owners).toEqual(['js-team']);
  });

  test('should match to directory owner', () => {
    const owners = matchFileToOwners('src/utils.ts', codeowners);
    expect(owners).toEqual(['src-owner']);
  });

  test('should use last matching rule', () => {
    // src/critical.js matches *, *.js, src/, and src/critical.js
    // Last rule should win
    const owners = matchFileToOwners('src/critical.js', codeowners);
    expect(owners).toEqual(['tech-lead']);
  });

  test('should return empty array if no match', () => {
    const emptyCodeowners = [
      { pattern: '*.js', owners: ['js-team'] }
    ];

    const owners = matchFileToOwners('README.md', emptyCodeowners);
    expect(owners).toEqual([]);
  });
});

describe('Real-world CODEOWNERS Examples', () => {
  test('should parse and match GitHub-style CODEOWNERS', () => {
    const content = `
# Global owners
*       @global-owner1 @global-owner2

# Documentation
*.md    @docs-team
/docs/  @docs-lead

# Frontend
/src/components/  @frontend-team
*.tsx             @react-specialist

# Backend
/api/             @backend-team
*.py              @python-expert

# DevOps
/.github/workflows/   @devops
Dockerfile            @devops
`;

    const rules = parseCodeowners(content);

    // Test various files
    expect(matchFileToOwners('README.md', rules)).toContain('docs-team');
    expect(matchFileToOwners('src/components/Button.tsx', rules)).toContain('react-specialist');
    expect(matchFileToOwners('api/users.py', rules)).toContain('python-expert');
    expect(matchFileToOwners('.github/workflows/ci.yml', rules)).toContain('devops');
  });

  test('should handle complex nested patterns', () => {
    const content = `
*                           @default
/src/                       @src-team
/src/components/            @component-team
/src/components/forms/      @forms-team
/src/components/forms/*.tsx @forms-specialist
`;

    const rules = parseCodeowners(content);

    expect(matchFileToOwners('src/components/forms/LoginForm.tsx', rules))
      .toEqual(['forms-specialist']);

    expect(matchFileToOwners('src/components/forms/helpers.ts', rules))
      .toEqual(['forms-team']);

    expect(matchFileToOwners('src/components/Button.tsx', rules))
      .toEqual(['component-team']);
  });
});

describe('Edge Cases', () => {
  test('should handle malformed lines gracefully', () => {
    const content = `
*.js    @alice
malformed-line-without-owner
*.md    @bob

`;

    const rules = parseCodeowners(content);
    expect(rules).toHaveLength(2); // Should skip malformed line
  });

  test('should handle files with dots in path', () => {
    expect(matchPattern('src/file.name.with.dots.js', '*.js')).toBe(true);
    expect(matchPattern('.github/workflows/ci.yml', '.github/')).toBe(true);
  });

  test('should handle special characters in filenames', () => {
    expect(matchPattern('file-with-dashes.js', '*.js')).toBe(true);
    expect(matchPattern('file_with_underscores.js', '*.js')).toBe(true);
  });

  test('should return empty owners for team-only rules', () => {
    const content = '*.js    @org/frontend-team';
    const rules = parseCodeowners(content);

    expect(rules).toHaveLength(0); // No individual users
  });
});
