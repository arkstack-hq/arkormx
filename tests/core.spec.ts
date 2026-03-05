import { beforeEach, describe, expect, it } from 'vitest'
import { ArkCollection, configureArkormRuntime, createPrismaAdapter, Model, QueryBuilder } from '../src'

type Row = Record<string, unknown>

function matchesWhere (row: Row, where: Record<string, unknown> | undefined): boolean {
    if (!where)
        return true

    if (Array.isArray(where.AND))
        return (where.AND as Record<string, unknown>[]).every(clause => matchesWhere(row, clause))

    return Object.entries(where).every(([key, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value) && 'in' in (value as Record<string, unknown>)) {
            const candidate = (value as { in: unknown[] }).in

            return Array.isArray(candidate) ? candidate.includes(row[key]) : false
        }

        if (value && typeof value === 'object' && !Array.isArray(value) && 'not' in (value as Record<string, unknown>)) {
            const disallowed = (value as { not: unknown }).not

            return row[key] !== disallowed
        }

        return row[key] === value
    })
}

function makeDelegate (rows: Row[]) {
    const data = rows.map(row => ({ ...row }))

    return {
        findMany: async (args?: { where?: Row, skip?: number, take?: number }) => {
            const filtered = data.filter(row => matchesWhere(row, args?.where))
            const skip = args?.skip || 0
            const take = args?.take ?? filtered.length

            return filtered.slice(skip, skip + take).map(row => ({ ...row }))
        },
        findFirst: async (args?: { where?: Row }) => {
            const found = data.find(row => matchesWhere(row, args?.where))

            return found ? { ...found } : null
        },
        create: async ({ data: payload }: { data: Row }) => {
            data.push({ ...payload })

            return { ...payload }
        },
        update: async ({ where, data: payload }: { where: Row, data: Row }) => {
            const index = data.findIndex(row => matchesWhere(row, where))
            if (index < 0)
                throw new Error('Record not found')

            data[index] = { ...data[index], ...payload }

            return { ...data[index] }
        },
        delete: async ({ where }: { where: Row }) => {
            const index = data.findIndex(row => matchesWhere(row, where))
            if (index < 0)
                throw new Error('Record not found')

            const [removed] = data.splice(index, 1)

            return { ...removed }
        },
        count: async ({ where }: { where?: Row } = {}) => {
            return data.filter(row => matchesWhere(row, where)).length
        },
    }
}

class User extends Model {
    protected static override delegate = 'users'
    protected override casts = {
        isActive: 'boolean',
        meta: 'json',
        createdAt: 'date',
    } as const
    protected override hidden = ['password']
    protected override appends = ['displayName']

    public profile () {
        return this.hasOne(Profile, 'userId')
    }

    public posts () {
        return this.hasMany(Post, 'userId')
    }

    public roles () {
        return this.belongsToMany(Role, 'roleUsers', 'userId', 'roleId')
    }

    public avatar () {
        return this.hasOneThrough(Image, 'profiles', 'userId', 'profileId')
    }

    public postImages () {
        return this.hasManyThrough(Image, 'posts', 'userId', 'postId')
    }

    public comments () {
        return this.morphMany(Comment, 'commentable')
    }

    public tags () {
        return this.morphToMany(Tag, 'taggables', 'taggable', 'tagId')
    }

    public getDisplayNameAttribute (): string {
        return String(this.getAttribute('name')).toUpperCase()
    }

    public setNameAttribute (value: unknown): unknown {
        return String(value).trim()
    }

    public scopeActive (query: QueryBuilder<User>) {
        return query.where({ isActive: 1 })
    }
}

class Profile extends Model {
    protected static override delegate = 'profiles'

    public user () {
        return this.belongsTo(User, 'userId')
    }

    public image () {
        return this.hasOne(Image, 'profileId')
    }
}

class Post extends Model {
    protected static override delegate = 'posts'

    public user () {
        return this.belongsTo(User, 'userId')
    }

    public comments () {
        return this.morphMany(Comment, 'commentable')
    }
}

class Role extends Model {
    protected static override delegate = 'roles'
}

class Image extends Model {
    protected static override delegate = 'images'
}

class Comment extends Model {
    protected static override delegate = 'comments'
}

class Tag extends Model {
    protected static override delegate = 'tags'
}

class Article extends Model {
    protected static override delegate = 'articles'
    protected static override softDeletes = true
}

const client = {
    users: makeDelegate([
        { id: 1, name: '  Jane  ', email: 'jane@example.com', password: 'secret', isActive: 1, meta: '{"tier":"pro"}', createdAt: '2026-03-04T12:00:00.000Z' },
        { id: 2, name: 'John', email: 'john@example.com', password: 'secret', isActive: 0, meta: '{"tier":"free"}', createdAt: '2026-03-04T12:00:00.000Z' },
    ]),
    profiles: makeDelegate([
        { id: 10, userId: 1 },
        { id: 11, userId: 2 },
    ]),
    posts: makeDelegate([
        { id: 100, userId: 1, title: 'A' },
        { id: 101, userId: 1, title: 'B' },
        { id: 102, userId: 2, title: 'C' },
    ]),
    roles: makeDelegate([
        { id: 500, name: 'admin' },
        { id: 501, name: 'editor' },
    ]),
    roleUsers: makeDelegate([
        { userId: 1, roleId: 500 },
        { userId: 1, roleId: 501 },
    ]),
    images: makeDelegate([
        { id: 900, profileId: 10, postId: 100, url: 'a.png' },
        { id: 901, profileId: 10, postId: 101, url: 'b.png' },
    ]),
    comments: makeDelegate([
        { id: 1000, commentableId: 1, commentableType: 'User', body: 'Hi user' },
        { id: 1001, commentableId: 100, commentableType: 'Post', body: 'Hi post' },
    ]),
    tags: makeDelegate([
        { id: 1200, name: 'orm' },
        { id: 1201, name: 'prisma' },
    ]),
    taggables: makeDelegate([
        { tagId: 1200, taggableId: 1, taggableType: 'User' },
        { tagId: 1201, taggableId: 1, taggableType: 'User' },
    ]),
    articles: makeDelegate([
        { id: 2000, title: 'Live', deletedAt: null },
        { id: 2001, title: 'Archived', deletedAt: '2026-03-04T12:00:00.000Z' },
    ]),
}

beforeEach(() => {
    configureArkormRuntime(client)
})

describe('Arkorm core', () => {
    it('supports querying and pagination', async () => {
        const users = await User.query().orderBy({ id: 'asc' }).get()
        expect(users.length).toBe(2)

        const page = await User.query().paginate(1, 1)
        expect(page.data.length).toBe(1)
        expect(page.meta.total).toBe(2)
        expect(page.meta.lastPage).toBe(2)
    })

    it('supports mutators, casts and serialization', async () => {
        const user = await User.query().find(1)
        expect(user).not.toBeNull()
        const model = user as User

        expect(model.getAttribute('name')).toBe('Jane')
        expect(model.getAttribute('isActive')).toBe(true)
        expect(model.getAttribute('meta')).toEqual({ tier: 'pro' })
        expect(model.getAttribute('createdAt')).toBeInstanceOf(Date)

        const serialized = model.toObject()
        expect(serialized.password).toBeUndefined()
        expect(serialized.displayName).toBe('JANE')
        expect(typeof serialized.createdAt).toBe('string')
    })

    it('supports one-to-one and one-to-many relations', async () => {
        const user = (await User.query().find(1)) as User
        const profile = await user.profile().getResults()
        const posts = await user.posts().getResults()

        expect(profile).not.toBeNull()
        expect(Array.isArray(posts)).toBe(true)
        expect((posts as Post[]).length).toBe(2)
    })

    it('supports many-to-many and through relations', async () => {
        const user = (await User.query().find(1)) as User

        const roles = await user.roles().getResults()
        const avatar = await user.avatar().getResults()
        const postImages = await user.postImages().getResults()

        expect((roles as Role[]).length).toBe(2)
        expect(avatar).not.toBeNull()
        expect((postImages as Image[]).length).toBe(2)
    })

    it('supports polymorphic one-to-one, one-to-many and many-to-many', async () => {
        class _Media extends Model {
            protected static override delegate = 'images'

            public owner () {
                return this.morphOne(User, 'commentable')
            }
        }

        const user = (await User.query().find(1)) as User

        const comments = await user.comments().getResults()
        const tags = await user.tags().getResults()

        expect((comments as Comment[]).length).toBe(1)
        expect((tags as Tag[]).length).toBe(2)
    })

    it('integrates collections with collect.js', () => {
        const collection = ArkCollection.make([{ id: 1 }, { id: 2 }])
        expect(collection.all().length).toBe(2)
    })

    it('supports local scopes on query builder', async () => {
        const users = await User.scope('active').get()
        expect(users.length).toBe(1)
        expect((users[0] as User).getAttribute('email')).toBe('jane@example.com')
    })

    it('supports constrained eager loading callbacks', async () => {
        const user = await User.query().with({
            posts: (query) => (query as QueryBuilder<Post>).where({ title: 'A' }),
        }).find(1)

        expect(user).not.toBeNull()
        const posts = (user as User).getAttribute('posts') as Post[]
        expect(Array.isArray(posts)).toBe(true)
        expect(posts.length).toBe(1)
    })

    it('supports soft deletes and trashed filters', async () => {
        const visible = await Article.query().get()
        const withTrashed = await Article.withTrashed().get()
        const onlyTrashed = await Article.onlyTrashed().get()

        expect(visible.length).toBe(1)
        expect(withTrashed.length).toBe(2)
        expect(onlyTrashed.length).toBe(1)

        const article = (await Article.query().find(2000)) as Article
        await article.delete()
        expect(article.getAttribute('deletedAt')).toBeInstanceOf(Date)

        await article.restore()
        expect(article.getAttribute('deletedAt')).toBeNull()
    })

    it('creates a Prisma delegate adapter', () => {
        const adapter = createPrismaAdapter(client)
        expect(adapter.users).toBeDefined()
        expect(typeof adapter.users.findMany).toBe('function')
    })
})