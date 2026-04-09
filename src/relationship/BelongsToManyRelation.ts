import type { BelongsToManyRelationMetadata, PivotModelStatic, QueryComparisonOperator, QueryCondition, RelationshipModelStatic } from 'src/types'

import { ArkormCollection } from '../Collection'
import { LengthAwarePaginator, Paginator } from '../Paginator'
import type { QueryBuilder } from '../QueryBuilder'
import { Relation } from './Relation'

/**
 * Defines a many-to-many relationship.
 * 
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class BelongsToManyRelation<TParent, TRelated> extends Relation<TRelated> {
    private static readonly queryDecorationMarker = Symbol('belongsToManyQueryDecoration')
    private pivotColumns = new Set<string>()
    private pivotAccessor = 'pivot'
    private pivotCreatedAtColumn: string | undefined
    private pivotUpdatedAtColumn: string | undefined
    private pivotWhere: QueryCondition | undefined
    private pivotModel: PivotModelStatic | undefined
    private shouldAttachPivot = false

    public constructor(
        private readonly parent: TParent & { getAttribute: (key: string) => unknown },
        private readonly related: RelationshipModelStatic,
        private readonly throughDelegate: string,
        private readonly foreignPivotKey: string,
        private readonly relatedPivotKey: string,
        private readonly parentKey: string,
        private readonly relatedKey: string,
    ) {
        super()
    }

    /**
     * Specifies additional pivot columns to include on the related models.
     * 
     * @param columns   The pivot columns to include on the related models. 
     * @returns 
     */
    public withPivot (...columns: Array<string | string[]>): this {
        columns.flat().forEach((column) => {
            if (typeof column !== 'string' || column.trim().length === 0)
                return

            this.pivotColumns.add(column.trim())
        })
        this.shouldAttachPivot = true

        return this
    }

    /**
     * Specifies that the pivot table contains timestamp columns and optionally 
     * allows customizing the names of those columns.
     * 
     * @param createdAtColumn    The name of the "created at" timestamp column.
     * @param updatedAtColumn    The name of the "updated at" timestamp column.
     * @returns                  The current instance of the relationship.
     */
    public withTimestamps (createdAtColumn = 'createdAt', updatedAtColumn = 'updatedAt'): this {
        this.pivotCreatedAtColumn = createdAtColumn
        this.pivotUpdatedAtColumn = updatedAtColumn

        return this.withPivot(createdAtColumn, updatedAtColumn)
    }

    /**
     * Specifies a custom accessor name for the pivot attributes on the related models. 
     * By default, pivot attributes are accessible via the `pivot` property on the 
     * related models.
     * 
     * @param accessor    The custom accessor name for the pivot attributes.
     * @returns           The current instance of the relationship.
     */
    public as (accessor: string): this {
        const normalized = accessor.trim()
        if (normalized.length === 0)
            return this

        this.pivotAccessor = normalized
        this.shouldAttachPivot = true

        return this
    }

    /**
     * Specifies a custom pivot model to use for the pivot records. The pivot model can 
     * be used to define custom behavior or methods on the pivot records, as well as to 
     * specify a custom hydration method for the pivot records.
     * 
     * @param pivotModel    The custom pivot model to use.
     * @returns             The current instance of the relationship.
     */
    public using (pivotModel: PivotModelStatic): this {
        this.pivotModel = pivotModel
        this.shouldAttachPivot = true

        return this
    }

    /**
     * Adds a "pivot column" condition to the relationship query. 
     * 
     * @param column    The pivot column to apply the condition on.
     * @param value     The value to compare the pivot column against.
     */
    public wherePivot (column: string, value: unknown): this
    /**
     * Adds a "pivot column" condition to the relationship query. 
     * 
     * @param column    The pivot column to apply the condition on.
     * @param operator  The operator to use for the comparison.
     * @param value     The value to compare the pivot column against.
     */
    public wherePivot (column: string, operator: QueryComparisonOperator, value: unknown): this
    public wherePivot (column: string, operatorOrValue: unknown, value?: unknown): this {
        const normalizedColumn = column.trim()
        if (normalizedColumn.length === 0)
            return this

        if (arguments.length === 2)
            return this.addPivotWhere(
                this.makePivotComparison(normalizedColumn, '=', operatorOrValue)
            )

        return this.addPivotWhere(
            this.makePivotComparison(normalizedColumn, operatorOrValue as QueryComparisonOperator,
                value
            ))
    }

    /**
     * Adds a "pivot column in" condition to the relationship query.
     * 
     * @param column 
     * @param values 
     * @returns 
     */
    public wherePivotNotIn (column: string, values: unknown[]): this {
        return this.addPivotWhere(this.makePivotComparison(column, 'not-in', values))
    }

    /**
     * Adds a "pivot column between" condition to the relationship query.
     * 
     * @param column 
     * @param range 
     * @returns 
     */
    public wherePivotBetween (column: string, range: [unknown, unknown]): this {
        return this.addPivotWhere({
            type: 'group',
            operator: 'and',
            conditions: [
                this.makePivotComparison(column, '>=', range[0]),
                this.makePivotComparison(column, '<=', range[1]),
            ],
        })
    }

    /**
     * Adds a "pivot column not between" condition to the relationship query.
     * 
     * @param column 
     * @param range 
     * @returns 
     */
    public wherePivotNotBetween (column: string, range: [unknown, unknown]): this {
        return this.addPivotWhere({
            type: 'not',
            condition: {
                type: 'group',
                operator: 'and',
                conditions: [
                    this.makePivotComparison(column, '>=', range[0]),
                    this.makePivotComparison(column, '<=', range[1]),
                ],
            },
        })
    }

    /**
     * Adds a "pivot column is null" condition to the relationship query.
     * 
     * @param column 
     * @returns 
     */
    public wherePivotNull (column: string): this {
        return this.addPivotWhere(this.makePivotComparison(column, 'is-null'))
    }

    /**
     * Adds a "pivot column is not null" condition to the relationship query.
     * 
     * @param column 
     * @returns 
     */
    public wherePivotNotNull (column: string): this {
        return this.addPivotWhere(this.makePivotComparison(column, 'is-not-null'))
    }

    private addPivotWhere (condition: QueryCondition): this {
        if (!this.pivotWhere) {
            this.pivotWhere = condition

            return this
        }

        this.pivotWhere = {
            type: 'group',
            operator: 'and',
            conditions: [this.pivotWhere, condition],
        }

        return this
    }

    private makePivotComparison (
        column: string,
        operator: QueryComparisonOperator,
        value?: unknown,
    ): QueryCondition {
        const normalizedColumn = column.trim()

        if (operator === 'is-null' || operator === 'is-not-null') {
            return {
                type: 'comparison',
                column: normalizedColumn,
                operator,
            }
        }

        return {
            type: 'comparison',
            column: normalizedColumn,
            operator,
            value: value as never,
        }
    }

    private buildPivotWhere (parentValue: unknown): QueryCondition {
        const baseCondition: QueryCondition = {
            type: 'comparison',
            column: this.foreignPivotKey,
            operator: '=',
            value: parentValue as never,
        }

        if (!this.pivotWhere)
            return baseCondition

        return {
            type: 'group',
            operator: 'and',
            conditions: [baseCondition, this.pivotWhere],
        }
    }

    private buildPivotTarget (): { table: string, primaryKey: string } {
        return {
            table: this.throughDelegate,
            primaryKey: this.relatedPivotKey,
        }
    }

    private buildRelatedPivotCondition (relatedValues: unknown[]): QueryCondition | null {
        const normalizedValues = relatedValues.filter(value => value != null)
        if (normalizedValues.length === 0)
            return null

        if (normalizedValues.length === 1) {
            return {
                type: 'comparison',
                column: this.relatedPivotKey,
                operator: '=',
                value: normalizedValues[0] as never,
            }
        }

        return {
            type: 'comparison',
            column: this.relatedPivotKey,
            operator: 'in',
            value: normalizedValues as never,
        }
    }

    private buildPivotMutationWhere (relatedValues: unknown[] = []): QueryCondition {
        const baseCondition = this.buildPivotWhere(this.resolveParentPivotValue())
        const relatedCondition = this.buildRelatedPivotCondition(relatedValues)

        if (!relatedCondition)
            return baseCondition

        return {
            type: 'group',
            operator: 'and',
            conditions: [baseCondition, relatedCondition],
        }
    }

    private normalizeIdentifierValue (value: unknown): unknown {
        if (typeof value === 'string' && /^-?\d+$/.test(value))
            return Number(value)

        return value
    }

    private isPlainObject (value: unknown): value is Record<string, unknown> {
        return typeof value === 'object'
            && value !== null
            && !Array.isArray(value)
            && !(value instanceof Date)
    }

    private isModelLike (value: unknown): value is { getAttribute: (key: string) => unknown } {
        return this.isPlainObject(value) && typeof value.getAttribute === 'function'
    }

    private normalizeRelatedItems (related: TRelated | unknown | Array<TRelated | unknown>): Array<TRelated | unknown> {
        return Array.isArray(related) ? related : [related]
    }

    private normalizeSyncEntries (
        related: TRelated | unknown | Array<TRelated | unknown> | Record<string, Record<string, unknown>>,
        pivotAttributes: Record<string, unknown> = {},
    ): Array<{ related: TRelated | unknown, attributes: Record<string, unknown> }> {
        if (Array.isArray(related)) {
            return related.map(item => ({
                related: item,
                attributes: { ...pivotAttributes },
            }))
        }

        if (this.isPlainObject(related) && !this.isModelLike(related)) {
            return Object.entries(related).map(([key, attributes]) => ({
                related: this.normalizeIdentifierValue(key),
                attributes: this.isPlainObject(attributes) ? attributes : {},
            }))
        }

        return [{ related, attributes: { ...pivotAttributes } }]
    }

    private resolveParentPivotValue (): unknown {
        return this.parent.getAttribute(this.parentKey)
    }

    private resolveRelatedPivotValue (related: TRelated | unknown): unknown {
        if (related && typeof related === 'object' && 'getAttribute' in (related as Record<string, unknown>)) {
            return (related as { getAttribute: (key: string) => unknown }).getAttribute(this.relatedKey)
        }

        return related
    }

    private buildPivotInsertValues (related: TRelated | unknown, attributes: Record<string, unknown> = {}): Record<string, unknown> {
        const values: Record<string, unknown> = {
            ...attributes,
            [this.foreignPivotKey]: this.resolveParentPivotValue(),
            [this.relatedPivotKey]: this.resolveRelatedPivotValue(related),
        }

        if (this.pivotCreatedAtColumn && !(this.pivotCreatedAtColumn in values))
            values[this.pivotCreatedAtColumn] = new Date()

        if (this.pivotUpdatedAtColumn && !(this.pivotUpdatedAtColumn in values))
            values[this.pivotUpdatedAtColumn] = new Date()

        return values
    }

    private attachPivotToSingleResult (related: TRelated, pivotRow: Record<string, unknown>): TRelated {
        if (!this.shouldAttachPivotAttributes())
            return related

        const model = related as unknown as { setAttribute: (key: string, value: unknown) => unknown }
        model.setAttribute(this.pivotAccessor, this.createPivotRecord(pivotRow))

        return related
    }

    private async insertPivotRow (values: Record<string, unknown>, adapter = this.getRelationAdapter()): Promise<void> {
        await adapter.insert({
            target: this.buildPivotTarget(),
            values,
        })
    }

    private async selectPivotRows (where: QueryCondition, adapter = this.getRelationAdapter()): Promise<Record<string, unknown>[]> {
        return await adapter.select({
            target: this.buildPivotTarget(),
            where,
        })
    }

    private async deletePivotRows (where: QueryCondition, adapter = this.getRelationAdapter()): Promise<number> {
        if (typeof adapter.deleteMany === 'function') {
            return await adapter.deleteMany({
                target: this.buildPivotTarget(),
                where,
            })
        }

        const rows = await this.selectPivotRows(where, adapter)
        await Promise.all(rows.map(async (row) => {
            await adapter.delete({
                target: this.buildPivotTarget(),
                where: {
                    type: 'group',
                    operator: 'and',
                    conditions: Object.entries(row).map(([column, value]) => ({
                        type: 'comparison',
                        column,
                        operator: '=',
                        value: value as never,
                    })),
                },
            })
        }))

        return rows.length
    }

    private buildPivotUpdateValues (attributes: Record<string, unknown> = {}): Record<string, unknown> {
        const values = { ...attributes }

        if (this.pivotUpdatedAtColumn && !(this.pivotUpdatedAtColumn in values))
            values[this.pivotUpdatedAtColumn] = new Date()

        return values
    }

    private async updatePivotRows (
        related: TRelated | unknown,
        attributes: Record<string, unknown>,
        adapter = this.getRelationAdapter(),
    ): Promise<number> {
        const values = this.buildPivotUpdateValues(attributes)
        if (Object.keys(values).length === 0)
            return 0

        const where = this.buildPivotMutationWhere([this.resolveRelatedPivotValue(related)])

        if (typeof adapter.updateMany === 'function') {
            return await adapter.updateMany({
                target: this.buildPivotTarget(),
                where,
                values,
            })
        }

        const rows = await this.selectPivotRows(where, adapter)
        await Promise.all(rows.map(async (row) => {
            await adapter.update({
                target: this.buildPivotTarget(),
                where: {
                    type: 'group',
                    operator: 'and',
                    conditions: Object.entries(row).map(([column, value]) => ({
                        type: 'comparison',
                        column,
                        operator: '=',
                        value: value as never,
                    })),
                },
                values,
            })
        }))

        return rows.length
    }

    /**
     * Creates a new instance of the related model with the given attributes and attaches 
     * pivot attributes if pivot attributes should be included.
     * 
     * @param attributes    The attributes to initialize the related model with.
     * @returns             A new instance of the related model.
     */
    public make (attributes: Record<string, unknown> = {}): TRelated {
        return this.related.hydrate(attributes)
    }

    /**
     * Creates a new related model record with the given attributes, creates a pivot record 
     * with the given pivot attributes, and attaches pivot attributes if pivot attributes 
     * should be included.
     * 
     * @param attributes        The attributes to initialize the related model with.
     * @param pivotAttributes   The attributes to initialize the pivot record with.
     * @returns                 A new instance of the related model with pivot attributes attached.
     */
    public async create (
        attributes: Record<string, unknown> = {},
        pivotAttributes: Record<string, unknown> = {},
    ): Promise<TRelated> {
        const related = await this.related.query().create(attributes as never) as TRelated
        const pivotRow = this.buildPivotInsertValues(related, pivotAttributes)

        await this.insertPivotRow(pivotRow)

        return this.attachPivotToSingleResult(related, pivotRow)
    }

    /**
     * Saves a related model record, creates a pivot record with the given pivot attributes 
     * if the related model was not previously persisted, and attaches pivot attributes if 
     * pivot attributes should be included.
     * 
     * @param related           The related model instance to save.
     * @param pivotAttributes   The attributes to initialize the pivot record with.
     * @returns                 A new instance of the related model with pivot attributes attached.
     */
    public async save (
        related: TRelated,
        pivotAttributes: Record<string, unknown> = {},
    ): Promise<TRelated> {
        const saveable = related as TRelated & {
            save?: () => Promise<TRelated>
            getRawAttributes?: () => Record<string, unknown>
        }

        let persisted = related

        if (typeof saveable.save === 'function') {
            try {
                persisted = await saveable.save()
            } catch (error) {
                const shouldCreate = typeof error === 'object'
                    && error !== null
                    && 'code' in error
                    && error.code === 'MODEL_NOT_FOUND'

                if (!shouldCreate)
                    throw error

                const attributes = typeof saveable.getRawAttributes === 'function'
                    ? saveable.getRawAttributes()
                    : {}

                persisted = await this.related.query().create(attributes as never) as TRelated
            }
        }

        const pivotRow = this.buildPivotInsertValues(persisted, pivotAttributes)

        await this.insertPivotRow(pivotRow)

        return this.attachPivotToSingleResult(persisted, pivotRow)
    }

    /**
     * Attaches one or more related model records to the parent model by creating pivot 
     * records with the given pivot attributes if pivot attributes should be included.
     * 
     * @param related           The related model instance(s) to attach.
     * @param pivotAttributes   The attributes to initialize the pivot record with.
     * @returns                 The number of related model records attached.
     */
    public async attach (
        related: TRelated | unknown | Array<TRelated | unknown>,
        pivotAttributes: Record<string, unknown> = {},
    ): Promise<number> {
        const items = Array.isArray(related) ? related : [related]

        await Promise.all(items.map(async (item) => {
            await this.insertPivotRow(this.buildPivotInsertValues(item, pivotAttributes))
        }))

        return items.length
    }

    /**
     * Detaches one or more related model records from the parent model by deleting
     * matching pivot rows. When no related value is provided, all matching pivot rows
     * for the parent are removed.
     *
     * @param related
     * @returns
     */
    public async detach (related?: TRelated | unknown | Array<TRelated | unknown>): Promise<number> {
        const where = related === undefined
            ? this.buildPivotWhere(this.resolveParentPivotValue())
            : this.buildPivotMutationWhere(
                this.normalizeRelatedItems(related).map(item => this.resolveRelatedPivotValue(item))
            )

        return await this.deletePivotRows(where)
    }

    /**
     * Synchronizes the pivot table so only the provided related values remain attached.
     * Existing matching rows can receive updated pivot attributes during the operation.
     *
     * @param related
     * @param pivotAttributes
     * @returns
     */
    public async sync (
        related: TRelated | unknown | Array<TRelated | unknown> | Record<string, Record<string, unknown>>,
        pivotAttributes: Record<string, unknown> = {},
    ): Promise<{ attached: number, detached: number, updated: number }> {
        const adapter = this.getRelationAdapter()

        return await adapter.transaction(async (transaction) => {
            const existingRows = await this.selectPivotRows(
                this.buildPivotWhere(this.resolveParentPivotValue()),
                transaction,
            )
            const desiredEntries = new Map<string, { related: TRelated | unknown, attributes: Record<string, unknown> }>()

            this.normalizeSyncEntries(related, pivotAttributes).forEach((entry) => {
                const relatedValue = this.resolveRelatedPivotValue(entry.related)
                if (relatedValue == null)
                    return

                desiredEntries.set(String(relatedValue), {
                    related: relatedValue,
                    attributes: entry.attributes,
                })
            })

            let detached = 0
            let attached = 0
            let updated = 0

            const existingKeys = new Set<string>()
            for (const row of existingRows) {
                const relatedValue = row[this.relatedPivotKey]
                if (relatedValue == null)
                    continue

                const relatedKey = String(relatedValue)
                existingKeys.add(relatedKey)

                if (!desiredEntries.has(relatedKey)) {
                    detached += await this.deletePivotRows(
                        this.buildPivotMutationWhere([relatedValue]),
                        transaction,
                    )
                }
            }

            for (const [relatedKey, entry] of desiredEntries) {
                if (!existingKeys.has(relatedKey)) {
                    await this.insertPivotRow(this.buildPivotInsertValues(entry.related, entry.attributes), transaction)
                    attached += 1

                    continue
                }

                if (Object.keys(entry.attributes).length === 0)
                    continue

                updated += await this.updatePivotRows(entry.related, entry.attributes, transaction)
            }

            return { attached, detached, updated }
        })
    }

    private shouldAttachPivotAttributes (): boolean {
        return this.shouldAttachPivot
            || this.pivotColumns.size > 0
            || Boolean(this.pivotCreatedAtColumn)
            || Boolean(this.pivotUpdatedAtColumn)
            || Boolean(this.pivotModel)
    }

    private getPivotColumnSelection (): string[] {
        return [
            this.foreignPivotKey,
            this.relatedPivotKey,
            ...this.pivotColumns,
        ].filter((column, index, all) => all.indexOf(column) === index)
    }

    /**
     * Creates a pivot record from a row of data.
     * 
     * @param row   The row of data containing pivot attributes.
     * @returns     The pivot record.
     */
    private createPivotRecord (row: Record<string, unknown>): unknown {
        const attributes = this.getPivotColumnSelection().reduce<Record<string, unknown>>((all, column) => {
            all[column] = row[column]

            return all
        }, {})

        if (!this.pivotModel)
            return attributes

        if (typeof this.pivotModel.hydrate === 'function')
            return this.pivotModel.hydrate(attributes)

        return new this.pivotModel(attributes)
    }

    /**
     * Attaches pivot attributes to the related models if pivot attributes should be included.
     * 
     * @param results 
     * @param pivotRows 
     * @returns 
     */
    private attachPivotToResults (
        results: ArkormCollection<TRelated>,
        pivotRows: Record<string, unknown>[]
    ): ArkormCollection<TRelated> {
        if (!this.shouldAttachPivotAttributes())
            return results

        const pivotByRelatedKey = new Map<string, Record<string, unknown>>()
        pivotRows.forEach((row) => {
            const relatedValue = row[this.relatedPivotKey]
            if (relatedValue == null)
                return

            pivotByRelatedKey.set(String(relatedValue), row)
        })

        results.all().forEach((related) => {
            const model = related as unknown as { getAttribute: (key: string) => unknown, setAttribute: (key: string, value: unknown) => unknown }
            const relatedValue = model.getAttribute(this.relatedKey)
            if (relatedValue == null)
                return

            const pivotRow = pivotByRelatedKey.get(String(relatedValue))
            if (!pivotRow)
                return

            model.setAttribute(this.pivotAccessor, this.createPivotRecord(pivotRow))
        })

        return results
    }

    private attachPivotToModel (model: TRelated | null, pivotRows: Record<string, unknown>[]): TRelated | null {
        if (!model)
            return model

        const attached = this.attachPivotToResults(
            new ArkormCollection<TRelated>([model] as TRelated[]),
            pivotRows,
        )

        return attached.all()[0] ?? null
    }

    private decorateQueryBuilder (
        query: QueryBuilder<TRelated>,
        pivotRows: Record<string, unknown>[]
    ): QueryBuilder<TRelated> {
        const decorated = query as QueryBuilder<TRelated> & Record<PropertyKey, unknown>

        if (decorated[BelongsToManyRelation.queryDecorationMarker])
            return query

        const originalGet = query.get.bind(query)
        const originalFirst = query.first.bind(query)
        const originalPaginate = query.paginate.bind(query)
        const originalSimplePaginate = query.simplePaginate.bind(query)
        const originalClone = query.clone.bind(query)

        decorated.get = (async () => {
            const results = await originalGet()

            return this.attachPivotToResults(results, pivotRows)
        }) as QueryBuilder<TRelated>['get']

        decorated.first = (async () => {
            const result = await originalFirst()

            return this.attachPivotToModel(result, pivotRows)
        }) as QueryBuilder<TRelated>['first']

        decorated.paginate = (async (perPage = 15, page?: number, options = {}) => {
            const paginator = await originalPaginate(perPage, page, options)
            const data = this.attachPivotToResults(paginator.data, pivotRows)

            return new LengthAwarePaginator(data, paginator.meta.total, paginator.meta.perPage, paginator.meta.currentPage, options)
        }) as QueryBuilder<TRelated>['paginate']

        decorated.simplePaginate = (async (perPage = 15, page?: number, options = {}) => {
            const paginator = await originalSimplePaginate(perPage, page, options)
            const data = this.attachPivotToResults(paginator.data, pivotRows)

            return new Paginator(data, paginator.meta.perPage, paginator.meta.currentPage, paginator.meta.hasMorePages, options)
        }) as QueryBuilder<TRelated>['simplePaginate']

        decorated.clone = (() => {
            return this.decorateQueryBuilder(originalClone(), pivotRows)
        }) as QueryBuilder<TRelated>['clone']

        decorated[BelongsToManyRelation.queryDecorationMarker] = true

        return query
    }

    private async loadPivotRowsForParent (): Promise<Record<string, unknown>[]> {
        const parentValue = this.resolveParentPivotValue()

        return await this.createRelationTableLoader().selectRows({
            table: this.throughDelegate,
            where: this.buildPivotWhere(parentValue),
            columns: this.getPivotColumnSelection().map(column => ({ column })),
        })
    }

    /**
     * Build the relationship query.
     *
     * @returns
     */
    public async getQuery (): Promise<QueryBuilder<TRelated>> {
        const pivotRows = await this.loadPivotRowsForParent()
        const ids = pivotRows.map(row => row[this.relatedPivotKey])

        return this.decorateQueryBuilder(
            this.applyConstraint(this.related.query().where({ [this.relatedKey]: { in: ids } })),
            pivotRows,
        )
    }

    public getMetadata (): BelongsToManyRelationMetadata {
        const shouldAttachPivot = this.shouldAttachPivotAttributes()

        return {
            type: 'belongsToMany',
            relatedModel: this.related,
            throughTable: this.throughDelegate,
            foreignPivotKey: this.foreignPivotKey,
            relatedPivotKey: this.relatedPivotKey,
            parentKey: this.parentKey,
            relatedKey: this.relatedKey,
            pivotAccessor: shouldAttachPivot ? this.pivotAccessor : undefined,
            pivotColumns: [...this.pivotColumns],
            pivotCreatedAtColumn: this.pivotCreatedAtColumn,
            pivotUpdatedAtColumn: this.pivotUpdatedAtColumn,
            pivotWhere: this.pivotWhere,
            pivotModel: this.pivotModel,
        }
    }

    /**
     * Fetches the related models for this relationship.
     * 
     * @returns 
     */
    public async getResults (): Promise<ArkormCollection<TRelated>> {
        const query = await this.getQuery()

        return query.get()
    }
}