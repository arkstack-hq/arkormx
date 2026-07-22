import { CliApp } from '../CliApp'
import { Command } from '@h3ravel/musket'
import { loadArkormConfig } from '../../helpers/runtime-config'
import { resolve } from 'node:path'

export class ModelsSyncCommand extends Command<CliApp> {
  protected signature = `models:sync
        {--schema= : Path to prisma schema file used when adapter introspection is unavailable}
        {--models= : Path to models directory}
        {--r|registry-only : Only sync the generated model registry type augmentation}
    `

  protected description = 'Sync model declare attributes from the active adapter when supported'

  async handle() {
    this.app.command = this
    // Load the project config (and its adapter) before resolving it; harnesses
    // may hand us a CliApp that hasn't applied the config yet.
    await loadArkormConfig()

    let result

    try {
      const options = {
        schemaPath: this.option('schema') ? resolve(String(this.option('schema'))) : undefined,
        modelsDir: this.option('models') ? resolve(String(this.option('models'))) : undefined,
      }
      result =
        this.option('registryOnly') || this.option('registry-only') || this.option('r')
          ? this.app.syncModelRegistry({ modelsDir: options.modelsDir })
          : await this.app.syncModels(options)
    } catch (error) {
      return void this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }

    const updatedLines =
      result.updated.length === 0
        ? [this.app.splitLogger('Updated', 'none')]
        : result.updated.map((path) => this.app.splitLogger('Updated', path))

    this.success('SUCCESS: Model sync completed with the following results:')
    ;[
      this.app.splitLogger(
        'Source',
        result.source === 'adapter'
          ? 'adapter introspection'
          : result.source === 'registry'
            ? 'model registry'
            : 'prisma schema',
      ),
      ...(result.schemaPath ? [this.app.splitLogger('Schema', result.schemaPath)] : []),
      this.app.splitLogger('Models', result.modelsDir),
      ...(result.modelTypesPath
        ? [this.app.splitLogger('Model Types', result.modelTypesPath)]
        : []),
      this.app.splitLogger('Processed', String(result.total)),
      ...updatedLines,
      this.app.splitLogger('Skipped', String(result.skipped.length)),
    ].map((line) => this.success(line))
  }
}
