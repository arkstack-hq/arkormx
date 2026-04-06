import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import type { DatabaseAdapter } from '../../../src'
import { configureArkormRuntime, Model, QueryBuilder } from '../../../src'

export class DbUser extends Model<'user'> {
    protected static override delegate = 'users'

    public profile () {
        return this.hasOne(DbProfile, 'userId')
    }

    public posts () {
        return this.hasMany(DbPost, 'userId')
    }

    public roles () {
        return this.belongsToMany(DbRole, 'roleUsers', 'userId', 'roleId')
    }

    public avatar () {
        return this.hasOneThrough(DbImage, 'userProfile', 'userId', 'profileId')
    }

    public postImages () {
        return this.hasManyThrough(DbImage, 'posts', 'userId', 'postId')
    }

    public comments () {
        return this.morphMany(DbComment, 'commentable')
    }

    public primaryComment () {
        return this.morphOne(DbComment, 'commentable')
    }

    public tags () {
        return this.morphToMany(DbTag, 'taggables', 'taggable', 'tagId')
    }

    public scopeActive (query: QueryBuilder<DbUser>) {
        return query.whereKey('isActive', 1)
    }
}

export class DbProfile extends Model {
    protected static override delegate = 'userProfile'

    public user () {
        return this.belongsTo(DbUser, 'userId')
    }

    public image () {
        return this.hasOne(DbImage, 'profileId')
    }
}

export class DbPost extends Model {
    protected static override delegate = 'posts'

    public user () {
        return this.belongsTo(DbUser, 'userId')
    }

    public comments () {
        return this.morphMany(DbComment, 'commentable')
    }
}

export class DbRole extends Model {
    protected static override delegate = 'roles'
}

export class DbImage extends Model {
    protected static override delegate = 'images'
}

export class DbComment extends Model {
    protected static override delegate = 'comments'
}

export class DbTag extends Model {
    protected static override delegate = 'tags'
}

export class DbArticle extends Model<'article'> {
    protected static override delegate = 'articles'
    protected static override softDeletes = true
}

export const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL as string,
    }),
})

const TEST_LOCK_ID = 42424242

export async function connectPostgresRuntime () {
    configureArkormRuntime(prisma as unknown as Record<string, unknown>)
    await prisma.$connect()
}

export async function disconnectPostgresRuntime () {
    await prisma.$disconnect()
}

export async function seedPostgresFixtures () {
    configureArkormRuntime(prisma as unknown as Record<string, unknown>)

    await prisma.$executeRawUnsafe('TRUNCATE TABLE "taggables", "tags", "comments", "images", "role_users", "roles", "posts", "profiles", "articles", "users" RESTART IDENTITY CASCADE')

    await prisma.user.createMany({
        data: [
            { name: 'Jane', email: 'jane@example.com', isActive: 1 },
            { name: 'John', email: 'john@example.com', isActive: 0 },
        ],
    })

    await prisma.userProfile.createMany({
        data: [
            { userId: 1 },
            { userId: 2 },
        ],
    })

    await prisma.post.createMany({
        data: [
            { userId: 1, title: 'A' },
            { userId: 1, title: 'B' },
            { userId: 2, title: 'C' },
        ],
    })

    await prisma.role.createMany({
        data: [
            { name: 'admin' },
            { name: 'editor' },
        ],
    })

    await prisma.roleUser.createMany({
        data: [
            { userId: 1, roleId: 1 },
            { userId: 1, roleId: 2 },
        ],
    })

    await prisma.image.createMany({
        data: [
            { profileId: 1, postId: 1, url: 'a.png' },
            { profileId: 1, postId: 2, url: 'b.png' },
        ],
    })

    await prisma.comment.createMany({
        data: [
            { commentableId: 1, commentableType: 'DbUser', body: 'Hi user' },
            { commentableId: 1, commentableType: 'DbPost', body: 'Hi post' },
        ],
    })

    await prisma.tag.createMany({
        data: [
            { name: 'orm' },
            { name: 'prisma' },
        ],
    })

    await prisma.taggable.createMany({
        data: [
            { tagId: 1, taggableId: 1, taggableType: 'DbUser' },
            { tagId: 2, taggableId: 1, taggableType: 'DbUser' },
        ],
    })

    await prisma.article.createMany({
        data: [
            { title: 'Live', deletedAt: null },
            { title: 'Archived', deletedAt: new Date('2026-03-04T12:00:00.000Z') },
        ],
    })
}

export async function acquirePostgresTestLock () {
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${TEST_LOCK_ID})`)
}

export async function releasePostgresTestLock () {
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${TEST_LOCK_ID})`)
}

export function setPostgresModelAdapter (adapter?: DatabaseAdapter) {
    DbUser.setAdapter(adapter)
    DbProfile.setAdapter(adapter)
    DbPost.setAdapter(adapter)
    DbRole.setAdapter(adapter)
    DbImage.setAdapter(adapter)
    DbComment.setAdapter(adapter)
    DbTag.setAdapter(adapter)
    DbArticle.setAdapter(adapter)
}
