import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'

/**
 * The MakeSeederCommand class implements the CLI command for creating new seeder classes.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class MakeSeederCommand extends Command<CliApp> {
    protected signature = `make:seeder
        {name : Name of the seeder to create}
        {--f|force : Overwrite existing file}
    `

    protected description = 'Create a new seeder class'

    /**
     * Command handler for the make:seeder command.
     */
    async handle () {
        this.app.command = this
        const name = this.argument('name')
        if (!name)
            return void this.error('Error: Name argument is required.')

        const created = this.app.makeSeeder(name, this.options())

        this.success(`Created seeder: ${created.path}`)
    }
}
