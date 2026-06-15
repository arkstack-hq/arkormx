import type {
    DatabaseValue,
    QueryComparisonOperator,
    QueryJoinBoolean,
    QueryJoinConstraint,
    QueryScalarComparisonOperator,
} from './types/adapter'

/**
 * A fluent builder for the `on`/`where` constraints of a join clause.
 *
 * Instances are handed to the closure form of the query builder join helpers
 * (for example `query.join('posts', join => join.on(...).where(...))`) and
 * mirror Laravel's `JoinClause` surface. Column identifiers are treated as raw
 * database identifiers (qualify them as `table.column` when needed).
 *
 * @author Legacy (3m1n3nc3)
 */
export class JoinClause {
    private readonly constraints: QueryJoinConstraint[] = []

    /**
     * Adds a column-to-column `on` constraint, joined with `and`.
     *
     * Accepts either a closure (for a nested group) or a column comparison in
     * the `(first, second)` or `(first, operator, second)` form.
     *
     * @param first    The left-hand column or a nested closure.
     * @param operator The comparison operator (defaults to `=`).
     * @param second   The right-hand column.
     * @returns
     */
    public on (
        first: string | ((join: JoinClause) => void),
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
    ): this {
        return this.addOn('and', first, operator, second)
    }

    /**
     * Adds a column-to-column `on` constraint, joined with `or`.
     *
     * @param first    The left-hand column or a nested closure.
     * @param operator The comparison operator (defaults to `=`).
     * @param second   The right-hand column.
     * @returns
     */
    public orOn (
        first: string | ((join: JoinClause) => void),
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
    ): this {
        return this.addOn('or', first, operator, second)
    }

    /**
     * Adds a column-to-value constraint, joined with `and`.
     *
     * @param column   The column being compared.
     * @param operator The comparison operator or the value when omitted.
     * @param value    The value to compare against.
     * @returns
     */
    public where (
        column: string,
        operator?: QueryComparisonOperator | string | DatabaseValue,
        value?: DatabaseValue,
    ): this {
        return this.addWhere('and', column, operator, value)
    }

    /**
     * Adds a column-to-value constraint, joined with `or`.
     *
     * @param column   The column being compared.
     * @param operator The comparison operator or the value when omitted.
     * @param value    The value to compare against.
     * @returns
     */
    public orWhere (
        column: string,
        operator?: QueryComparisonOperator | string | DatabaseValue,
        value?: DatabaseValue,
    ): this {
        return this.addWhere('or', column, operator, value)
    }

    /**
     * Adds an `is null` constraint joined with `and`.
     *
     * @param column The column to test for null.
     * @returns
     */
    public whereNull (column: string): this {
        this.constraints.push({ type: 'null', boolean: 'and', column, not: false })

        return this
    }

    /**
     * Adds an `is null` constraint joined with `or`.
     *
     * @param column The column to test for null.
     * @returns
     */
    public orWhereNull (column: string): this {
        this.constraints.push({ type: 'null', boolean: 'or', column, not: false })

        return this
    }

    /**
     * Adds an `is not null` constraint joined with `and`.
     *
     * @param column The column to test for non-null.
     * @returns
     */
    public whereNotNull (column: string): this {
        this.constraints.push({ type: 'null', boolean: 'and', column, not: true })

        return this
    }

    /**
     * Adds an `is not null` constraint joined with `or`.
     *
     * @param column The column to test for non-null.
     * @returns
     */
    public orWhereNotNull (column: string): this {
        this.constraints.push({ type: 'null', boolean: 'or', column, not: true })

        return this
    }

    /**
     * Adds a raw constraint joined with `and`.
     *
     * @param sql      The raw SQL fragment (with `?` placeholders for bindings).
     * @param bindings The values bound to the placeholders.
     * @returns
     */
    public onRaw (sql: string, bindings: DatabaseValue[] = []): this {
        this.constraints.push({ type: 'raw', boolean: 'and', sql, bindings })

        return this
    }

    /**
     * Adds a raw constraint joined with `or`.
     *
     * @param sql      The raw SQL fragment (with `?` placeholders for bindings).
     * @param bindings The values bound to the placeholders.
     * @returns
     */
    public orOnRaw (sql: string, bindings: DatabaseValue[] = []): this {
        this.constraints.push({ type: 'raw', boolean: 'or', sql, bindings })

        return this
    }

    /**
     * Returns the accumulated constraints for this join clause.
     *
     * @returns
     */
    public getConstraints (): QueryJoinConstraint[] {
        return this.constraints
    }

    private addOn (
        boolean: QueryJoinBoolean,
        first: string | ((join: JoinClause) => void),
        operator?: QueryScalarComparisonOperator | string,
        second?: string,
    ): this {
        if (typeof first === 'function') {
            const nested = new JoinClause()
            first(nested)
            this.constraints.push({ type: 'nested', boolean, constraints: nested.getConstraints() })

            return this
        }

        const [resolvedOperator, resolvedSecond] = second === undefined
            ? ['=', operator]
            : [operator, second]

        if (typeof resolvedSecond !== 'string')
            throw new Error('A join "on" constraint requires a second column.')

        this.constraints.push({
            type: 'column',
            boolean,
            first,
            operator: (resolvedOperator ?? '=') as QueryScalarComparisonOperator,
            second: resolvedSecond,
        })

        return this
    }

    private addWhere (
        boolean: QueryJoinBoolean,
        column: string,
        operator?: QueryComparisonOperator | string | DatabaseValue,
        value?: DatabaseValue,
    ): this {
        const [resolvedOperator, resolvedValue] = value === undefined
            ? ['=', operator as DatabaseValue]
            : [operator, value]

        this.constraints.push({
            type: 'value',
            boolean,
            column,
            operator: (resolvedOperator ?? '=') as QueryComparisonOperator,
            value: resolvedValue,
        })

        return this
    }
}
