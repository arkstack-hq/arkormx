import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'

export class MakeFactoryCommand extends Command<CliApp> {
    protected signature = `make:factory
        {name : Name of the factory to create}
        {--f|force : Overwrite existing file}
    `

    protected description = 'Create a new model factory class'

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
