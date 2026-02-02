# Changelog

All notable changes to the BlueMonster extension will be documented in this file.

## [0.1.0] - 2026-02-01

### Added
- 🎨 **New UI Design**
  - Thinking panel moved above input area for better visibility
  - Mode selector (Agent, Ask, Edit, Plan)
  - Multi-image upload support with preview
  - Cleaner toolbar layout

- 🖼️ **Image Analysis**
  - Upload multiple images at once
  - Image preview with individual removal
  - Images sent to Copilot for visual analysis

- 📟 **Terminal Output Sync**
  - Command output now displayed in chat
  - Formatted code blocks for readability
  - Error messages with details

- 📁 **File Operation Notifications**
  - Visual feedback for file read/write operations
  - Auto-open modified files in editor
  - New/modified file indicators

### Changed
- Removed CLI button (LM API is sufficient)
- Updated help command with mode descriptions
- Improved terminal command execution with output capture

### Fixed
- PATH issues with Homebrew commands
- Terminal output capture reliability

## [0.0.1] - Initial Release

### Added
- Basic chat interface with Copilot integration
- Terminal command execution tool
- Model selection
- Confirmation dialogs for terminal commands
- Danger mode for file operations
