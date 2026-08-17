# OpenCode Permission Rules

## Permission Configuration

OpenCode automatically approves tools, file edits, and shell commands. Explicit deny rules
still protect sensitive files and destructive operations.

### Denied Bash Commands

- Recursive force deletion with `rm -rf` or `rm -fr`
- Privileged commands through `sudo`
- Disk operations through `mkfs` or `dd`
- Piping downloaded `wget` content into a shell
- Force pushes
- `git reset --hard`

### Web Access

- `websearch` - Allowed for searching the web
- `codesearch` - Allowed for code searches

### File Operations

- `read` - Set to "allow" (always allow reading files)
- `glob` - Set to "allow" (always allow file pattern matching)
- `edit` - Set to "allow" except for protected shell and SSH configuration
- All other operations - Set to "allow" by default

## Usage Guidelines

OpenCode will:

1. **Automatically allow** tools, file edits, and shell commands
2. **Block** access to configured secret paths
3. **Block** explicitly denied destructive shell commands

## Recommendations

- Review agent changes through version control
- Use `uv sync` and `go mod tidy` to keep dependencies clean
- Run tests with `uv run pytest` or `go test` as needed
- Use websearch to research tools and best practices when needed

## Customization

To modify permissions, edit `opencode/opencode.json`. See the [OpenCode Permissions Documentation](https://opencode.ai/docs/permissions/) for details.
