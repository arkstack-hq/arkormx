import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'

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

    async handle () {
        this.app.command = this
        const name = this.argument('name')
        if (!name)
            return void this.error('Error: Name argument is required.')

        const created = this.app.makeModel(name, {
            force: this.option('force'),
            factory: this.option('factory'),
            seeder: this.option('seeder'),
            migration: this.option('migration'),
            all: this.option('all'),
        })

        const lines = [
            `Model: ${created.model.path}`,
            created.factory ? `Factory: ${created.factory.path}` : '',
            created.seeder ? `Seeder: ${created.seeder.path}` : '',
            created.migration ? `Migration: ${created.migration.path}` : '',
        ].filter(Boolean)

        this.success(`Created files:\n${lines.join('\n')}`)
    }
}
