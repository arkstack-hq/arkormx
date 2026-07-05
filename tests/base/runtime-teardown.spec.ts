import { configureArkormRuntime, disposeArkormRuntime, resetArkormRuntimeForTests } from '../../src'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  resetArkormRuntimeForTests()
})

describe('disposeArkormRuntime', () => {
  it('disposes a configured adapter', async () => {
    const dispose = vi.fn(async () => {})
    configureArkormRuntime(undefined, { adapter: { dispose } as never })

    await disposeArkormRuntime()

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('disconnects a Prisma-style client', async () => {
    const $disconnect = vi.fn(async () => {})
    configureArkormRuntime({ $disconnect } as never)

    await disposeArkormRuntime()

    expect($disconnect).toHaveBeenCalledTimes(1)
  })

  it('ends a bare connection-pool client', async () => {
    const end = vi.fn(async () => {})
    configureArkormRuntime({ end } as never)

    await disposeArkormRuntime()

    expect(end).toHaveBeenCalledTimes(1)
  })

  it('does not double-close a client the adapter already owns', async () => {
    const destroy = vi.fn(async () => {})
    const dispose = vi.fn(async () => {})
    // A Kysely-like client (has destroy) that the adapter already disposes.
    configureArkormRuntime({ destroy } as never, { adapter: { dispose } as never })

    await disposeArkormRuntime()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(destroy).not.toHaveBeenCalled()
  })

  it('still disconnects a separate Prisma client after disposing the adapter', async () => {
    const $disconnect = vi.fn(async () => {})
    const dispose = vi.fn(async () => {})
    configureArkormRuntime({ $disconnect } as never, { adapter: { dispose } as never })

    await disposeArkormRuntime()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect($disconnect).toHaveBeenCalledTimes(1)
  })

  it('swallows teardown errors so the process can still exit', async () => {
    const dispose = vi.fn(async () => {
      throw new Error('boom')
    })
    configureArkormRuntime(undefined, { adapter: { dispose } as never })

    await expect(disposeArkormRuntime()).resolves.toBeUndefined()
  })

  it('is a no-op when nothing is configured', async () => {
    await expect(disposeArkormRuntime()).resolves.toBeUndefined()
  })
})
