import { expect, test } from 'claude-code/testing'

import { check, logText, logged, snippet } from './register'
import type { Entry } from './register'

const shell = (tool: string, command: string) => check(tool, { command })?.label

test('stops risky shell commands in Bash and PowerShell', () => {
  expect(shell('Bash', 'rm -rf build')).toBe('Recursive force delete (rm -rf)')
  expect(shell('Bash', 'rm -fr /tmp/x')).toBe('Recursive force delete (rm -rf)')
  expect(shell('PowerShell', 'Remove-Item .\\out -Recurse -Force')).toBe('Recursive force delete (Remove-Item -Recurse -Force)')
  expect(shell('Bash', 'git push origin main --force')).toBe('Force push (git push --force)')
  expect(shell('Bash', 'git push -f')).toBe('Force push (git push --force)')
  expect(shell('Bash', 'git reset --hard HEAD~1')).toBe('Discards uncommitted work (git reset --hard)')
  expect(shell('Bash', 'git clean -fd')).toBe('Deletes untracked files (git clean -f)')
  expect(shell('PowerShell', 'Remove-AzResourceGroup -Name rg-prod')).toBe('Deletes Azure resources (Remove-Az…)')
  expect(shell('PowerShell', 'remove-mguser -UserId x')).toBe('Deletes Microsoft Graph objects (Remove-Mg…)')
  expect(shell('Bash', 'az group delete --name rg-prod --yes')).toBe('Deletes Azure resources (az … delete)')
  expect(shell('PowerShell', 'Format-Volume -DriveLetter D')).toBe('Wipes a disk or volume')
  expect(shell('PowerShell', 'Restart-Computer')).toBe('Shuts down or restarts the computer')
})

test('lets everyday commands through', () => {
  for (const command of [
    'rm notes.txt',
    'rm -r build',
    'Remove-Item .\\out.txt',
    'git push origin main',
    'git push --force-with-lease',
    'git reset HEAD file.txt',
    'git status',
    'Get-AzResourceGroup',
    'az group list',
    'ls -la',
  ]) {
    expect(shell('Bash', command)).toBeUndefined()
  }
})

test('asks before editing settings, .env and SSH files', () => {
  expect(check('Edit', { file_path: 'C:\\Users\\me\\.claude\\settings.json' })?.label).toBe('Edits Claude Code settings')
  expect(check('Write', { file_path: '/home/me/app/.env.local' })?.label).toBe('Edits a .env secrets file')
  expect(check('Write', { file_path: '/home/me/.ssh/config' })?.label).toBe('Edits SSH keys or config')
  expect(check('Edit', { file_path: '/home/me/app/src/settings.json' })).toBeUndefined()
  expect(check('Read', { file_path: '/home/me/.ssh/config' })).toBeUndefined()
})

test('shortens what it shows to one line', () => {
  expect(snippet('rm   -rf\n build')).toBe('rm -rf build')
  expect(snippet('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`)
})

test('keeps the newest 20 log entries', () => {
  const entry = (n: number): Entry => ({ at: n, tool: 'Bash', label: 'l', what: 'w', outcome: 'blocked' })
  let log: Entry[] = []
  for (let n = 0; n < 25; n++) log = logged(log, entry(n))
  expect(log.length).toBe(20)
  expect(log[0]?.at).toBe(24)
  expect(logText([])).toBe('Guard Rails: nothing stopped yet.')
  expect(logText([entry(0)])).toContain('BLOCKED  Bash: l')
})
