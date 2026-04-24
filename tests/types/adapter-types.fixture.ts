import type {
    AdapterCapabilities,
    AggregateSpec,
    DatabaseAdapter,
    DeleteSpec,
    InsertManySpec,
    InsertSpec,
    QueryCondition,
    RelationLoadSpec,
    SelectSpec,
    UpdateManySpec,
    UpdateSpec,
} from '../../src/types'

type UserRow = {
    id: number
    email: string
    deletedAt: Date | null
}

const capabilities: AdapterCapabilities = {
    transactions: true,
    relationAggregates: true,
    relationFilters: true,
}

const whereCondition: QueryCondition = {
    type: 'group',
    operator: 'and',
    conditions: [
        {
            type: 'comparison',
            column: 'email',
            operator: 'contains',
            value: '@',
        },
        {
            type: 'comparison',
            column: 'deletedAt',
            operator: 'is-null',
        },
    ],
}

const selectSpec: SelectSpec<UserRow> = {
    target: {
        modelName: 'User',
        table: 'users',
    },
    where: whereCondition,
    orderBy: [{ column: 'id', direction: 'desc' }],
    softDeleteMode: 'exclude',
}

const insertSpec: InsertSpec<UserRow> = {
    target: selectSpec.target,
    values: { email: 'jane@example.com' },
}

const insertManySpec: InsertManySpec<UserRow> = {
    target: selectSpec.target,
    values: [insertSpec.values],
}

const updateSpec: UpdateSpec<UserRow> = {
    target: selectSpec.target,
    where: whereCondition,
    values: { email: 'john@example.com' },
}

const updateManySpec: UpdateManySpec<UserRow> = {
    target: selectSpec.target,
    where: whereCondition,
    values: { deletedAt: null },
}

const deleteSpec: DeleteSpec<UserRow> = {
    target: selectSpec.target,
    where: whereCondition,
}

const aggregateSpec: AggregateSpec<UserRow> = {
    target: selectSpec.target,
    where: whereCondition,
    aggregate: {
        type: 'count',
        alias: 'usersCount',
    },
}

const relationLoadSpec: RelationLoadSpec<UserRow> = {
    target: selectSpec.target,
    models: [{ id: 1, email: 'jane@example.com', deletedAt: null }],
    relations: [{ relation: 'posts', constraint: whereCondition }],
}

const adapter: DatabaseAdapter = {
    capabilities,
    async select () {
        return []
    },
    async selectOne () {
        return null
    },
    async insert () {
        return { id: 1 }
    },
    async insertMany () {
        return 1
    },
    async update () {
        return null
    },
    async updateMany () {
        return 0
    },
    async delete () {
        return null
    },
    async deleteMany () {
        return 0
    },
    async count () {
        return 0
    },
    async exists () {
        return false
    },
    async loadRelations () {
    },
    async transaction (callback) {
        return await callback(this)
    },
}

void selectSpec
void insertSpec
void insertManySpec
void updateSpec
void updateManySpec
void deleteSpec
void aggregateSpec
void relationLoadSpec
void adapter