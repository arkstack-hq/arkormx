import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { resolve } from 'node:path'

export class ModelsSyncCommand extends Command<CliApp> {
    protected signature = `models:sync
        {--schema= : Path to prisma schema file}
        {--models= : Path to models directory}
    `

    protected description = 'Sync model declare attributes from prisma schema for all model files'

    async handle () {
        this.app.command = this

        const result = this.app.syncModelsFromPrisma({
            schemaPath: this.option('schema') ? resolve(String(this.option('schema'))) : undefined,
            modelsDir: this.option('models') ? resolve(String(this.option('models'))) : undefined,
        })

        const updatedLines = result.updated.length === 0
            ? [this.app.splitLogger('Updated', 'none')]
            : result.updated.map(path => this.app.splitLogger('Updated', path))

        this.success('SUCCESS: Model sync completed with the following results:');

        [
            this.app.splitLogger('Schema', result.schemaPath),
            this.app.splitLogger('Models', result.modelsDir),
            this.app.splitLogger('Processed', String(result.total)),
            ...updatedLines,
            this.app.splitLogger('Skipped', String(result.skipped.length)),
        ].map(line => this.success(line))
    }
}
