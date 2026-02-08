import { describe, it, expect, vi } from 'vitest';

// Mock the vscode module before any imports that reference it
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn(),
      update: vi.fn(),
    }),
  },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
}));

import { isCommandToken, detectDangerousCommand, shouldConfirmCommand } from './config';
import type { SafeModeSettings } from './config';

describe('isCommandToken', () => {
  it('should detect "rm" at the start of a command', () => {
    expect(isCommandToken('rm file.txt', 'rm ')).toBe(true);
  });

  it('should NOT detect "rm" inside another word like "echo rm"', () => {
    expect(isCommandToken('echo rm', 'rm ')).toBe(false);
  });

  it('should detect "rm" after a pipe operator', () => {
    expect(isCommandToken('ls | rm file', 'rm ')).toBe(true);
  });

  it('should detect "rm" after && operator', () => {
    expect(isCommandToken('ls && rm file', 'rm ')).toBe(true);
  });

  it('should detect "rm" after || operator', () => {
    expect(isCommandToken('ls || rm file', 'rm ')).toBe(true);
  });

  it('should detect "rm" after semicolon', () => {
    expect(isCommandToken('ls; rm file', 'rm ')).toBe(true);
  });

  it('should NOT detect "rm" as substring of "rmdir" when checking for "rm " pattern', () => {
    // "rm " pattern requires a space/tab/end after "rm"
    // "rmdir" starts with "rm" but next char is 'd', not space
    expect(isCommandToken('rmdir foo', 'rm ')).toBe(false);
  });

  it('should detect "rmdir" when checking for "rmdir" pattern', () => {
    expect(isCommandToken('rmdir foo', 'rmdir')).toBe(true);
  });

  it('should handle redirect-style operator patterns', () => {
    expect(isCommandToken('echo hello > /etc/passwd', '> /')).toBe(true);
    expect(isCommandToken('echo hello >> /tmp/log', '>> /')).toBe(true);
  });

  it('should NOT match redirect patterns when not present', () => {
    expect(isCommandToken('echo hello > file.txt', '> /')).toBe(false);
  });

  it('should detect "sudo" at the start of a command', () => {
    expect(isCommandToken('sudo apt update', 'sudo')).toBe(true);
  });

  it('should detect command with tab separator', () => {
    expect(isCommandToken('rm\tfile.txt', 'rm\t')).toBe(true);
  });
});

describe('detectDangerousCommand', () => {
  it('should detect "rm" as a delete operation', () => {
    const result = detectDangerousCommand('rm -rf /tmp/test');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('delete');
  });

  it('should detect "sudo" as an admin operation', () => {
    const result = detectDangerousCommand('sudo apt update');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('sudo');
  });

  it('should detect "curl" as a download operation', () => {
    const result = detectDangerousCommand('curl https://example.com');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('download');
  });

  it('should detect "npm install" as a package operation', () => {
    const result = detectDangerousCommand('npm install express');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('package');
  });

  it('should detect "git push" as a git operation', () => {
    const result = detectDangerousCommand('git push origin main');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('git');
  });

  it('should detect "kill" as a kill operation', () => {
    const result = detectDangerousCommand('kill 1234');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('kill');
  });

  it('should detect "chmod" as a permission operation', () => {
    const result = detectDangerousCommand('chmod 777 file.txt');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('permission');
  });

  it('should detect "docker rm" as a docker operation', () => {
    const result = detectDangerousCommand('docker rm container123');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('docker');
  });

  it('should detect "ssh" as a network operation', () => {
    const result = detectDangerousCommand('ssh user@host');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('network');
  });

  it('should detect "mv" as a move operation', () => {
    const result = detectDangerousCommand('mv file1 file2');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('move');
  });

  it('should detect "reboot" as a system operation', () => {
    const result = detectDangerousCommand('reboot');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('system');
  });

  it('should return null for safe commands', () => {
    expect(detectDangerousCommand('echo hello')).toBeNull();
    expect(detectDangerousCommand('cat file.txt')).toBeNull();
    expect(detectDangerousCommand('ls -la')).toBeNull();
    expect(detectDangerousCommand('pwd')).toBeNull();
  });

  it('should detect dangerous commands that appear after chain operators', () => {
    const result = detectDangerousCommand('ls && rm -rf /tmp');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('delete');
  });

  it('should be case-insensitive', () => {
    const result = detectDangerousCommand('RM -rf /tmp');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('delete');
  });
});

describe('shouldConfirmCommand', () => {
  const allEnabledSettings: SafeModeSettings = {
    confirmDelete: true,
    confirmMove: true,
    confirmSudo: true,
    confirmNetwork: true,
    confirmDownload: true,
    confirmPackage: true,
    confirmGit: true,
    confirmDocker: true,
    confirmPermission: true,
    confirmKill: true,
    confirmSystem: true,
  };

  it('should require confirmation for dangerous command when setting is enabled', () => {
    const result = shouldConfirmCommand('rm file.txt', allEnabledSettings);
    expect(result.confirm).toBe(true);
    expect(result.category).toBe('delete');
  });

  it('should NOT require confirmation when specific setting is disabled', () => {
    const settings = { ...allEnabledSettings, confirmDelete: false };
    const result = shouldConfirmCommand('rm file.txt', settings);
    expect(result.confirm).toBe(false);
  });

  it('should NOT require confirmation for safe commands', () => {
    const result = shouldConfirmCommand('echo hello', allEnabledSettings);
    expect(result.confirm).toBe(false);
    expect(result.category).toBe('');
  });
});
