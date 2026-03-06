import { ModelNotFoundException } from '../../src/Exceptions/ModelNotFoundException'
import { configureArkormRuntime, Model, QueryBuilder } from '../../src'

type Row = Record<string, unknown>

function toComparable (value: unknown, template: unknown): unknown {
    if (template instanceof Date) {
        if (value instanceof Date)
            return value

        if (typeof value === 'string' || typeof value === 'number') {
            const parsed = new Date(value)
            if (!Number.isNaN(parsed.getTime()))
                return parsed
        }
    }

    return value
}

function applyOrderBy (rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
    if (!orderBy)
        return rows

    const clauses = Array.isArray(orderBy) ? orderBy : [orderBy]

    return [...rows].sort((leftRow, rightRow) => {
        for (const clause of clauses) {
            const [column, direction] = Object.entries(clause)[0] || []
            if (!column)
                continue

            const leftValue = leftRow[column]
            const rightValue = rightRow[column]
            if (leftValue === rightValue)
                continue

            const descending = String(direction).toLowerCase() === 'desc'
            if (leftValue == null)
                return descending ? 1 : -1
            if (rightValue == null)
                return descending ? -1 : 1

            if (leftValue > rightValue)
                return descending ? -1 : 1
            if (leftValue < rightValue)
                return descending ? 1 : -1
        }

        return 0
    })
}

function matchesWhere (row: Row, where: Record<string, unknown> | undefined): boolean {
    if (!where)
        return true

    if (Array.isArray(where.AND))
        return (where.AND as Record<string, unknown>[]).every(clause => matchesWhere(row, clause))

    if (Array.isArray(where.OR))
        return (where.OR as Record<string, unknown>[]).some(clause => matchesWhere(row, clause))

    if (where.NOT) {
        const notClause = where.NOT
        if (Array.isArray(notClause))
            return !(notClause as Record<string, unknown>[]).every(clause => matchesWhere(row, clause))

        if (notClause && typeof notClause === 'object')
            return !matchesWhere(row, notClause as Record<string, unknown>)
    }

    return Object.entries(where).every(([key, value]) => {
        if (key === 'AND' || key === 'OR' || key === 'NOT')
            return true

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const clause = value as Record<string, unknown>
            const rowValue = row[key]

            if ('in' in clause) {
                const candidate = clause.in
                if (!Array.isArray(candidate) || !candidate.includes(rowValue))
                    return false
            }

            if ('notIn' in clause) {
                const candidate = clause.notIn
                if (!Array.isArray(candidate) || candidate.includes(rowValue))
                    return false
            }

            if ('not' in clause) {
                if (rowValue === clause.not)
                    return false
            }

            if ('gt' in clause) {
                const compareTo = clause.gt
                const leftValue = toComparable(rowValue, compareTo)
                if (!((leftValue as number | string | Date) > (compareTo as number | string | Date)))
                    return false
            }

            if ('gte' in clause) {
                const compareTo = clause.gte
                const leftValue = toComparable(rowValue, compareTo)
                if (!((leftValue as number | string | Date) >= (compareTo as number | string | Date)))
                    return false
            }

            if ('lt' in clause) {
                const compareTo = clause.lt
                const leftValue = toComparable(rowValue, compareTo)
                if (!((leftValue as number | string | Date) < (compareTo as number | string | Date)))
                    return false
            }

            if ('lte' in clause) {
                const compareTo = clause.lte
                const leftValue = toComparable(rowValue, compareTo)
                if (!((leftValue as number | string | Date) <= (compareTo as number | string | Date)))
                    return false
            }

            if (Object.keys(clause).length > 0)
                return true
        }

        return row[key] === value
    })
}

function makeDelegate (rows: Row[]) {
    const data = rows.map(row => ({ ...row }))

    return {
        findMany: async (args?: { where?: Row, orderBy?: Row | Row[], skip?: number, take?: number }) => {
            const filtered = data.filter(row => matchesWhere(row, args?.where))
            const ordered = applyOrderBy(filtered, args?.orderBy)
            const skip = args?.skip || 0
            const take = args?.take ?? ordered.length

            return ordered.slice(skip, skip + take).map(row => ({ ...row }))
        },
        findFirst: async (args?: { where?: Row, orderBy?: Row | Row[], skip?: number }) => {
            const filtered = data.filter(row => matchesWhere(row, args?.where))
            const ordered = applyOrderBy(filtered, args?.orderBy)
            const found = ordered[args?.skip || 0]

            return found ? { ...found } : null
        },
        create: async ({ data: payload }: { data: Row }) => {
            data.push({ ...payload })

            return { ...payload }
        },
        update: async ({ where, data: payload }: { where: Row, data: Row }) => {
            const index = data.findIndex(row => matchesWhere(row, where))
            if (index < 0)
                throw new ModelNotFoundException('Record not found')

            data[index] = { ...data[index], ...payload }

            return { ...data[index] }
        },
        delete: async ({ where }: { where: Row }) => {
            const index = data.findIndex(row => matchesWhere(row, where))
            if (index < 0)
                throw new ModelNotFoundException('Record not found')

            const [removed] = data.splice(index, 1)

            return { ...removed }
        },
        count: async ({ where }: { where?: Row } = {}) => {
            return data.filter(row => matchesWhere(row, where)).length
        },
    }
}

export class User extends Model<'user'> {
    declare id: number
    declare name: string
    declare email: string
    declare isActive: number
    declare createdAt: Date

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
        return query.whereKey('isActive', 1)
    }
}

export class Profile extends Model {
    protected static override delegate = 'profiles'

    public user () {
        return this.belongsTo(User, 'userId')
    }

    public image () {
        return this.hasOne(Image, 'profileId')
    }
}

export class Post extends Model {
    protected static override delegate = 'posts'

    public user () {
        return this.belongsTo(User, 'userId')
    }

    public comments () {
        return this.morphMany(Comment, 'commentable')
    }
}

export class Role extends Model {
    protected static override delegate = 'roles'
}

export class Image extends Model {
    protected static override delegate = 'images'
}

export class Comment extends Model {
    protected static override delegate = 'comments'
}

export class Tag extends Model {
    protected static override delegate = 'tags'
}

export class Article extends Model<'article'> {
    protected static override delegate = 'articles'
    protected static override softDeletes = true
}

export function createCoreClient () {
    return {
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
}

export function setupCoreRuntime () {
    configureArkormRuntime(createCoreClient())
}
