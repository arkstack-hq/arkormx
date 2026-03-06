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

        this.success('Created files:')
            ;[
                ['Model', created.model.path],
                [`Prisma schema ${created.prisma.updated ? '(updated)' : '(already up to date)'}`, created.prisma.path],
                created.factory ? ['Factory', created.factory.path] : '',
                created.seeder ? ['Seeder', created.seeder.path] : '',
                created.migration ? ['Migration', created.migration.path] : '',
            ].filter(Boolean).map(([name, path]) => this.success(this.app.splitLogger(name, path)))
    }
}
