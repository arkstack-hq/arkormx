import { Post } from './helpers/core-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'
import { setupCoreRuntime } from './helpers/core-fixtures'

const idsOf = (models: { getAttribute(key: string): unknown }[]) =>
  models.map((model) => Number(model.getAttribute('id')))

describe('chunking & lazy streaming', () => {
  beforeEach(() => {
    setupCoreRuntime()
  })

  describe('chunk', () => {
    it('invokes the callback with each chunk and completes', async () => {
      const pages: number[][] = []

      const completed = await Post.query()
        .orderBy({ id: 'asc' })
        .chunk(2, (models, page) => {
          pages.push([page, ...idsOf(models.all() as never)])
        })

      expect(completed).toBe(true)
      expect(pages).toEqual([
        [1, 100, 101],
        [2, 102],
      ])
    })

    it('stops early and resolves false when the callback returns false', async () => {
      const seen: number[] = []

      const completed = await Post.query()
        .orderBy({ id: 'asc' })
        .chunk(2, (models) => {
          seen.push(...idsOf(models.all() as never))

          return false
        })

      expect(completed).toBe(false)
      expect(seen).toEqual([100, 101])
    })

    it('rejects a non-positive chunk size', async () => {
      await expect(Post.query().chunk(0, () => {})).rejects.toThrow()
    })
  })

  describe('chunkById', () => {
    it('pages by the key column', async () => {
      const seen: number[] = []

      const completed = await Post.query().chunkById(2, (models) => {
        seen.push(...idsOf(models.all() as never))
      })

      expect(completed).toBe(true)
      expect(seen).toEqual([100, 101, 102])
    })
  })

  describe('each / eachById', () => {
    it('each visits every record in order with its index', async () => {
      const visited: Array<[number, number]> = []

      await Post.query()
        .orderBy({ id: 'asc' })
        .each((model, index) => {
          visited.push([index, Number((model as never as { getAttribute(k: string): unknown }).getAttribute('id'))])
        }, 2)

      expect(visited).toEqual([
        [0, 100],
        [1, 101],
        [2, 102],
      ])
    })

    it('each stops early on false', async () => {
      const visited: number[] = []

      const completed = await Post.query()
        .orderBy({ id: 'asc' })
        .each((model) => {
          visited.push(
            Number((model as never as { getAttribute(k: string): unknown }).getAttribute('id')),
          )

          return false
        }, 2)

      expect(completed).toBe(false)
      expect(visited).toEqual([100])
    })

    it('eachById visits every record', async () => {
      const visited: number[] = []

      await Post.query().eachById((model) => {
        visited.push(Number((model as never as { getAttribute(k: string): unknown }).getAttribute('id')))
      }, 2)

      expect(visited).toEqual([100, 101, 102])
    })
  })

  describe('lazy streaming', () => {
    it('lazy() yields every record as an async iterator', async () => {
      const ids: number[] = []

      for await (const post of Post.query().orderBy({ id: 'asc' }).lazy(2)) {
        ids.push(Number((post as never as { getAttribute(k: string): unknown }).getAttribute('id')))
      }

      expect(ids).toEqual([100, 101, 102])
    })

    it('lazyById() streams ascending by key', async () => {
      const ids: number[] = []

      for await (const post of Post.query().lazyById(2)) {
        ids.push(Number((post as never as { getAttribute(k: string): unknown }).getAttribute('id')))
      }

      expect(ids).toEqual([100, 101, 102])
    })

    it('lazyByIdDesc() streams descending by key', async () => {
      const ids: number[] = []

      for await (const post of Post.query().lazyByIdDesc(2)) {
        ids.push(Number((post as never as { getAttribute(k: string): unknown }).getAttribute('id')))
      }

      expect(ids).toEqual([102, 101, 100])
    })
  })
})
