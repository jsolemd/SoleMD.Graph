import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { loadEnvConfig } from '@next/env'

import { registerNodeInstrumentation } from '../instrumentation.node'

jest.mock('@next/env', () => ({
  loadEnvConfig: jest.fn(),
}))

const loadEnvConfigMock = jest.mocked(loadEnvConfig)

describe('registerNodeInstrumentation', () => {
  const roots: string[] = []
  let cwdSpy: jest.SpyInstance<string, []>

  beforeEach(() => {
    loadEnvConfigMock.mockReset()
    cwdSpy = jest.spyOn(process, 'cwd')
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    for (const root of roots.splice(0)) {
      rmSync(root, { force: true, recursive: true })
    }
  })

  function createTempRoot() {
    const root = mkdtempSync(path.join(tmpdir(), 'solemd-graph-web-'))
    roots.push(root)
    return root
  }

  it('loads environment variables from the nearest npm workspace root', () => {
    const root = createTempRoot()
    const appDir = path.join(root, 'apps', 'web')
    mkdirSync(appDir, { recursive: true })
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ workspaces: ['apps/*'] }),
    )

    cwdSpy.mockReturnValue(appDir)

    registerNodeInstrumentation()

    expect(loadEnvConfigMock).toHaveBeenCalledTimes(1)
    expect(loadEnvConfigMock).toHaveBeenCalledWith(
      root,
      process.env.NODE_ENV !== 'production',
      undefined,
      true,
    )
  })

  it('does not throw when the deployed server bundle has no workspace root', () => {
    const root = createTempRoot()
    const appDir = path.join(root, 'apps', 'web')
    mkdirSync(appDir, { recursive: true })

    cwdSpy.mockReturnValue(appDir)

    expect(() => registerNodeInstrumentation()).not.toThrow()
    expect(loadEnvConfigMock).not.toHaveBeenCalled()
  })
})
