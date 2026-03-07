import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { getDefaultStubsPath, getUserConfig } from '../../helpers/runtime-config'

import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { join } from 'node:path'

/**
 * The InitCommand class implements the CLI command for initializing Arkormˣ by creating 
 * a default config file in the current directory.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class InitCommand extends Command<CliApp> {
    protected signature = `init
        {--force : Force overwrite if config file already exists (existing file will be backed up) }
    `

    protected description = 'Initialize Arkormˣ by creating a default config file in the current directory'

    /**
     * Command handler for the init command.
     */
    async handle () {
        this.app.command = this
        const outputDir = join(process.cwd(), 'arkormx.config.js')
        const { stubs } = getUserConfig('paths') ?? {}
        const stubsDir = typeof stubs === 'string' && stubs.trim().length > 0
            ? stubs
            : getDefaultStubsPath()
        const preferredStubPath = join(stubsDir, 'arkormx.config.stub')
        const legacyStubPath = join(stubsDir, 'arkorm.config.stub')
        const stubPath = existsSync(preferredStubPath)
            ? preferredStubPath
            : legacyStubPath

        if (existsSync(outputDir) && !this.option('force')) {
            this.error('Error: Arkormˣ has already been initialized. Use --force to reinitialize.')
            process.exit(1)
        }

        this.app.ensureDirectory(outputDir)

        if (existsSync(outputDir) && this.option('force')) {
            copyFileSync(outputDir, outputDir.replace(/\.js$/, `.backup.${Date.now()}.js`))
        }

        if (!existsSync(stubPath)) {
            this.error(`Error: Missing config stub at ${preferredStubPath} (or ${legacyStubPath})`)

            process.exit(1)
        }

        writeFileSync(outputDir, readFileSync(stubPath, 'utf-8'))

        this.success('Arkormˣ initialized successfully!')
    }
}