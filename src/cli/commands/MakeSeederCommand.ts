import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'

export class MakeSeederCommand extends Command<CliApp> {
    protected signature = `make:seeder
        {name : Name of the seeder to create}
        {--f|force : Overwrite existing file}
    `

    protected description = 'Create a new seeder class'

    async handle () {
        this.app.command = this
        const name = this.argument('name')
        if (!name)
            return void this.error('Error: Name argument is required.')

        const created = this.app.makeSeeder(name, {
            force: this.option('force'),
        })

        this.success(`Created seeder: ${created.path}`)
    }
}
