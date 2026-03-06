import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'

/**
 * The MakeFactoryCommand class implements the CLI command for creating new factory classes.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class MakeFactoryCommand extends Command<CliApp> {
    protected signature = `make:factory
        {name : Name of the factory to create}
        {--f|force : Overwrite existing file}
    `

    protected description = 'Create a new model factory class'

    /**
     * Command handler for the make:factory command.
     * 
     * @returns 
     */
    async handle () {
        this.app.command = this
        const name = this.argument('name')
        if (!name)
            return void this.error('Error: Name argument is required.')

        const created = this.app.makeFactory(name, {
            force: this.option('force'),
        })

        this.success(`Created factory: ${created.path}`)
    }
}
