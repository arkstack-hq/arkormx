import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'

/**
 * The MakeModelCommand class implements the CLI command for creating new model 
 * classes along with optional linked resources such as factories, seeders, and migrations.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class MakeModelCommand extends Command<CliApp> {
    protected signature = `make:model
        {name : Name of the model to create}
        {--f|force : Overwrite existing files}
        {--factory : Create and link a factory}
        {--seeder : Create a seeder}
        {--migration : Create a migration}
        {--p|pivot : Indicate the required model is an intermediate pivot model}
        {--all : Create and link factory, seeder, and migration}
    `

    protected description = 'Create a new model and optional linked resources'

    /**
     * Command handler for the make:model command.
     * 
     * @returns 
     */
    async handle () {
        this.app.command = this
        const name = this.argument('name')
        if (!name) return void this.error('Error: Name argument is required.')

        const created = this.app.makeModel(name, this.options())
        const createdFiles: Array<[string, string]> = [
            ['Model', created.model.path],
        ]

        if (created.prisma) {
            createdFiles.push([
                `Prisma schema ${created.prisma.updated ? '(updated)' : '(already up to date)'}`,
                created.prisma.path,
            ])
        }

        if (created.factory)
            createdFiles.push(['Factory', created.factory.path])

        if (created.seeder)
            createdFiles.push(['Seeder', created.seeder.path])

        if (created.migration)
            createdFiles.push(['Migration', created.migration.path])

        this.success('Created files:')
        createdFiles.map(([fileType, path]) => this.success(this.app.splitLogger(fileType, path)))
    }
}
