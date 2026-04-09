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
        const parentValue = this.parent.getAttribute(this.parentKey)

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