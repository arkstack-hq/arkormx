#!/usr/bin/env node

import { CliApp } from './CliApp'
import { InitCommand } from './commands/InitCommand'
import { MakeFactoryCommand } from './commands/MakeFactoryCommand'
import { MakeMigrationCommand } from './commands/MakeMigrationCommand'
import { MakeModelCommand } from './commands/MakeModelCommand'
import { MakeSeederCommand } from './commands/MakeSeederCommand'
import { MigrateCommand } from './commands/MigrateCommand'
import { SeedCommand } from './commands/SeedCommand'
import { Kernel } from '@h3ravel/musket'
import logo from './logo'

const app = new CliApp()

await Kernel.init(app, {
    logo,
    name: 'Arkorm CLI',
    baseCommands: [
        InitCommand,
        MakeModelCommand,
        MakeFactoryCommand,
        MakeSeederCommand,
        MakeMigrationCommand,
        SeedCommand,
        MigrateCommand,
    ],
    exceptionHandler (exception) {
        throw exception
    },
})
