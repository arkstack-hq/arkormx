import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'

/**
 * The MakeMigrationCommand class implements the CLI command for creating new migration classes.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class MakeMigrationCommand extends Command<CliApp> {
    protected signature = `make:migration
        {name : Name of the migration to create}
    `

    protected description = 'Create a new migration class file'

    /**
     * Command handler for the make:migration command.
     * 
     * @returns 
     */
    async handle () {
        this.app.command = this
        const name = this.argument('name')
        if (!name)
            return void this.error('Error: Name argument is required.')

        const created = this.app.makeMigration(name)

        this.success(`Created migration: ${created.path}`)
    }
}
