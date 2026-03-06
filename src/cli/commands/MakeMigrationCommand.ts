import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'

export class MakeMigrationCommand extends Command<CliApp> {
    protected signature = `make:migration
        {name : Name of the migration to create}
    `

    protected description = 'Create a new migration class file'

    async handle () {
        this.app.command = this
        const name = this.argument('name')
        if (!name)
            return void this.error('Error: Name argument is required.')

        const created = this.app.makeMigration(name)

        this.success(`Created migration: ${created.path}`)
    }
}
