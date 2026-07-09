import { Attribute, Model } from '../../src'
import { beforeEach, describe, expect, it } from 'vitest'

import { setupCoreRuntime } from './helpers/core-fixtures'

let recordViewCalls = 0
let touchCalls = 0

class ProbeUser extends Model {
  protected static override table = 'users'
  protected override appends = ['badge']

  // An action that takes an argument — must never be invoked by property access.
  public recordView(viewer: unknown): unknown {
    recordViewCalls += 1

    return viewer
  }

  // A zero-arity action that is NOT an accessor. It must not be invoked by a
  // property read either — a `recordView()`-style method that inserts must never
  // fire just because its property was accessed.
  public touch(): number {
    touchCalls += 1

    return touchCalls
  }

  // A genuine Attribute-object accessor (zero-arity, returns an Attribute).
  public badge(): Attribute {
    return Attribute.make({ get: () => 'VIP' })
  }
}

describe('model accessor probing does not run methods on property access', () => {
  beforeEach(() => {
    setupCoreRuntime()
    recordViewCalls = 0
    touchCalls = 0
  })

  it('does not invoke an argument-taking method when its property is read', () => {
    const user = new ProbeUser()

    void user.recordView
    void user.recordView
    expect('recordView' in user).toBe(true)

    expect(recordViewCalls).toBe(0)
  })

  it('still calls the method when actually invoked', () => {
    const user = new ProbeUser()

    user.recordView('viewer-1')
    expect(recordViewCalls).toBe(1)
  })

  it('does not invoke a zero-arity non-attribute method on property reads', () => {
    const user = new ProbeUser()

    void user.touch
    void user.touch
    void user.touch

    // `touch` is not a model attribute, so reading `user.touch` must never call
    // it. (This is what made `obj.recordView(v)` insert twice: the property read
    // fired recordView() before the call did.)
    expect(touchCalls).toBe(0)
  })

  it('invokes a side-effecting method exactly once when called (no phantom insert)', () => {
    const user = new ProbeUser()

    // Reading then calling must run the body exactly once.
    void user.touch
    user.touch()

    expect(touchCalls).toBe(1)
  })

  it('resolves a genuine Attribute-object accessor', () => {
    const user = new ProbeUser()

    expect((user as unknown as { badge: string }).badge).toBe('VIP')
    expect(user.toObject().badge).toBe('VIP')
  })
})
