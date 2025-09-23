# Quick Start Guide

Get up and running with ValidAI's quality tools in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- Git configured
- VS Code (recommended) with extensions

## Essential Commands

### Development Workflow
```bash
# Start development server
cd validai-app
npm run dev

# Run tests in watch mode
npm run test:watch

# Check types while developing
npm run typecheck
```

### Before Committing
```bash
# Run all quality checks
npm run lint          # Check for code issues
npm run format        # Format code
npm run test          # Run unit tests
npm run typecheck     # Check TypeScript
```

### Full Test Suite
```bash
# Run everything
npm run test:all      # Unit + E2E tests
npm run build         # Verify build works
```

## VS Code Setup

### Required Extensions
Install these extensions for the best development experience:

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "ms-playwright.playwright"
  ]
}
```

### Settings
Add to your VS Code settings:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

## Git Hooks

Pre-commit hooks are automatically configured to:
- Fix linting issues
- Format code with Prettier
- Run TypeScript checks
- Validate commit messages

**Commit Message Format:**
```
feat(auth): add password reset functionality
fix(ui): resolve mobile navigation issue
docs(readme): update installation instructions
```

## Testing Quick Reference

### Running Tests
```bash
npm run test              # Unit tests
npm run test:coverage     # With coverage report
npm run test:e2e          # End-to-end tests
npm run test:e2e:headed   # E2E with visible browser
```

### Writing Tests
```typescript
// Unit test example
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

test('button renders correctly', () => {
  render(<Button>Click me</Button>)
  expect(screen.getByRole('button')).toBeInTheDocument()
})
```

### Test File Structure
```
__tests__/
├── unit/           # Component and function tests
├── integration/    # Multi-component tests
└── fixtures/       # Test data

e2e/               # End-to-end tests
```

## Code Standards Summary

### TypeScript
- Always use explicit types for function parameters and returns
- Avoid `any` type
- Use interfaces for object shapes, types for unions

### React Components
- Use functional components with TypeScript
- Props interface with descriptive names
- Organize imports: React → 3rd party → internal → relative

### Styling
- Use Tailwind CSS utilities
- Organize classes by category (layout, spacing, appearance)
- Use the `cn()` utility for conditional classes

### File Naming
- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utilities: `camelCase.ts`
- Types: `PascalCaseTypes.ts`

## Common Issues & Solutions

### Lint Errors
```bash
# Auto-fix most issues
npm run lint:fix

# Check specific files
npx eslint src/components/Button.tsx --fix
```

### Test Failures
```bash
# Run single test file
npm run test Button.test.tsx

# Update snapshots
npm run test -- --update-snapshots

# Debug with UI
npm run test:ui
```

### Type Errors
```bash
# Check specific file
npx tsc --noEmit src/components/Button.tsx

# Generate types from Supabase
npm run types:generate
```

### Build Issues
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Development Checklist

### Starting New Feature
- [ ] Create feature branch: `feat/feature-name`
- [ ] Start development server: `npm run dev`
- [ ] Enable test watch mode: `npm run test:watch`

### Before Committing
- [ ] All tests pass: `npm run test`
- [ ] No lint errors: `npm run lint`
- [ ] Types check: `npm run typecheck`
- [ ] Code formatted: `npm run format`

### Creating Pull Request
- [ ] Full test suite passes: `npm run test:all`
- [ ] Build succeeds: `npm run build`
- [ ] Write descriptive PR title and description
- [ ] Request review from team member

### Code Review
- [ ] Check for adherence to code standards
- [ ] Verify test coverage for new features
- [ ] Ensure documentation is updated
- [ ] Test changes locally

## Helpful Resources

### Documentation
- [Full Testing Guide](testing-guide.md)
- [Code Standards](code-standards.md)
- [CI/CD Process](ci-cd.md)

### External Links
- [Vitest API](https://vitest.dev/api/)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [Playwright API](https://playwright.dev/docs/api/class-test)

### Team Support
- Ask questions in team chat
- Check existing documentation first
- Update docs when you learn something new

## Next Steps

Once you're comfortable with the basics:

1. **Read the [Testing Strategy](testing-strategy.md)** to understand our testing philosophy
2. **Review [Code Standards](code-standards.md)** for detailed conventions
3. **Explore [CI/CD Process](ci-cd.md)** to understand the deployment pipeline
4. **Check [Architecture Decisions](architecture-decisions.md)** for context on tool choices

## Troubleshooting

### Can't commit?
Pre-commit hooks might be failing. Run the checks manually:
```bash
npm run lint:fix
npm run format
npm run test
```

### Tests running slowly?
```bash
# Run tests in parallel
npm run test -- --reporter=verbose

# Run only changed files
npm run test -- --changed
```

### IDE not showing errors?
- Restart TypeScript server in VS Code: `Ctrl+Shift+P` → "TypeScript: Restart TS Server"
- Check that extensions are installed and enabled
- Verify workspace settings are correct

---

**Remember**: Quality tools are here to help, not hinder. If something doesn't work as expected, ask for help!