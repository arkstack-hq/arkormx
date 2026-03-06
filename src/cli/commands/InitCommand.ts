import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { join } from 'node:path'
import { getUserConfig } from '../../helpers/runtime-config'

/**
 * The InitCommand class implements the CLI command for initializing Arkorm by creating 
 * a default config file in the current directory.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export class InitCommand extends Command<CliApp> {
    protected signature = `init
        {--force : Force overwrite if config file already exists (existing file will be backed up) }
    `

    protected description = 'Initialize Arkorm by creating a default config file in the current directory'

    /**
     * Command handler for the init command.
     */
    async handle () {
        this.app.command = this
        const outputDir = join(process.cwd(), 'arkorm.config.js')
        const stubsDir = getUserConfig('stubsDir') ?? ''
        const stubPath = join(stubsDir, 'arkorm.config.stub')

        if (existsSync(outputDir) && !this.option('force')) {
            this.error('Error: Arkorm has already been initialized. Use --force to reinitialize.')
            process.exit(1)
        }

        this.app.ensureDirectory(outputDir)

        if (existsSync(outputDir) && this.option('force')) {
            copyFileSync(outputDir, outputDir.replace(/\.js$/, `.backup.${Date.now()}.js`))
        }

        writeFileSync(outputDir, readFileSync(stubPath, 'utf-8'))

        this.success('Arkorm initialized successfully!')
    }
}