import { existsSync, rmSync } from 'node:fs'
import { createEmptyAppliedMigrationsState, readAppliedMigrationsStateFromStore, resolveMigrationStateFilePath, supportsDatabaseMigrationState, writeAppliedMigrationsStateToStore } from '../../helpers/migration-history'

import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'

/**
 * The MigrationHistoryCommand class manages tracked migration run history.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.2.4
 */
export class MigrationHistoryCommand extends Command<CliApp> {
    protected signature = `migrate:history
        {--state-file= : Path to applied migration state file}
        {--reset : Clear tracked migration history file}
        {--delete : Delete tracked migration history file}
        {--json : Print raw JSON output}
    `

    protected description = 'Inspect or reset tracked migration history'

    async handle () {
        this.app.command = this

        const stateFilePath = resolveMigrationStateFilePath(
            process.cwd(),
            this.option('state-file') ? String(this.option('state-file')) : undefined
        )
        const adapter = this.app.getConfig('adapter')
        const usesDatabaseState = supportsDatabaseMigrationState(adapter)

        if (this.option('delete')) {
            if (usesDatabaseState) {
                await adapter.writeAppliedMigrationsState(createEmptyAppliedMigrationsState())
                this.success('Deleted tracked migration state from database.')

                return
            }

            if (!existsSync(stateFilePath)) {
                this.success(`No migration state file found at ${this.app.formatPathForLog(stateFilePath)}`)

                return
            }

            rmSync(stateFilePath)
            this.success(`Deleted migration state file: ${this.app.formatPathForLog(stateFilePath)}`)

            return
        }

        if (this.option('reset')) {
            await writeAppliedMigrationsStateToStore(adapter, stateFilePath, createEmptyAppliedMigrationsState())
            this.success(usesDatabaseState
                ? 'Reset migration state in database.'
                : `Reset migration state: ${this.app.formatPathForLog(stateFilePath)}`)

            return
        }

        const state = await readAppliedMigrationsStateFromStore(adapter, stateFilePath)
        if (this.option('json')) {
            this.success(JSON.stringify({
                path: usesDatabaseState ? 'database' : stateFilePath,
                ...state,
            }, null, 2))

            return
        }

        this.success(this.app.splitLogger('State', usesDatabaseState ? 'database' : stateFilePath))
        this.success(this.app.splitLogger('Tracked', String(state.migrations.length)))

        if (state.migrations.length === 0) {
            this.success('No tracked migrations found.')

            return
        }

        state.migrations
            .sort((left, right) => left.appliedAt.localeCompare(right.appliedAt))
            .forEach((migration) => {
                this.success(this.app.splitLogger('Applied:', `${migration.id.split(':').at(0)} @ ${migration.appliedAt}`))
            })
    }
}
