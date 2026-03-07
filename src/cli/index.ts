#!/usr/bin/env node

import { CliApp } from './CliApp'
import { InitCommand } from './commands/InitCommand'
import { MakeFactoryCommand } from './commands/MakeFactoryCommand'
import { MakeMigrationCommand } from './commands/MakeMigrationCommand'
import { MakeModelCommand } from './commands/MakeModelCommand'
import { MakeSeederCommand } from './commands/MakeSeederCommand'
import { MigrateCommand } from './commands/MigrateCommand'
import { ModelsSyncCommand } from './commands/ModelsSyncCommand'
import { SeedCommand } from './commands/SeedCommand'
import { Kernel } from '@h3ravel/musket'
import logo from './logo'

const app = new CliApp()

await Kernel.init(app, {
    logo,
    name: 'Arkormˣ CLI',
    baseCommands: [
        InitCommand,
        MakeModelCommand,
        MakeFactoryCommand,
        MakeSeederCommand,
        MakeMigrationCommand,
        ModelsSyncCommand,
        SeedCommand,
        MigrateCommand,
    ],
    exceptionHandler (exception) {
        throw exception
    },
})
