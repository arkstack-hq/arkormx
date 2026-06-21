import type {
  ArkormConfig,
  ClientResolver,
  DatabaseAdapter,
  GetUserConfig,
  MigrationClass,
} from './types'
import type {
  RegisteredFactory,
  RegisteredModel,
  RuntimePathInput,
  RuntimePathKey,
} from './helpers/runtime-registry'
import { configureArkormRuntime, getRuntimeAdapter, getUserConfig } from './helpers'
import {
  getRegisteredFactories,
  getRegisteredMigrations,
  getRegisteredModels,
  getRegisteredPaths,
  getRegisteredSeeders,
  loadFactoriesFrom,
  loadMigrationsFrom,
  loadModelsFrom,
  loadSeedersFrom,
  registerFactories,
  registerMigrations,
  registerModels,
  registerSeeders,
} from './helpers/runtime-registry'

import type { SeederConstructor } from './database/Seeder'

export class Arkorm {
  /**
   * Configure the ArkORM runtime with the provided runtime client resolver and adapter-first options.
   *
   * @param client
   * @param options
   * @returns
   */
  static configure(options?: Omit<ArkormConfig, 'prisma'>, client?: ClientResolver) {
    return configureArkormRuntime(client, options)
  }
  configure = Arkorm.configure

  /**
   * Get the user-provided ArkORM configuration
   *
   * @returns
   */
  static getUserConfig: GetUserConfig = () => {
    return getUserConfig()
  }
  getUserConfig = Arkorm.getUserConfig

  /**
   * Get the currently configured runtime adapter, if any.
   *
   * @returns
   */
  static getRuntimeAdapter = (): DatabaseAdapter | undefined => {
    return getRuntimeAdapter()
  }
  getRuntimeAdapter = Arkorm.getRuntimeAdapter

  /**
   * Register migration constructors directly without relying on runtime discovery.
   *
   * @param migrations
   * @returns
   */
  static registerMigrations(...migrations: (MigrationClass | MigrationClass[])[]) {
    return registerMigrations(...migrations)
  }
  registerMigrations = Arkorm.registerMigrations

  /**
   * Register seeder constructors directly without relying on runtime discovery.
   *
   * @param seeders
   * @returns
   */
  static registerSeeders(...seeders: (SeederConstructor | SeederConstructor[])[]) {
    return registerSeeders(...seeders)
  }
  registerSeeders = Arkorm.registerSeeders

  /**
   * Register model constructors directly without relying on runtime discovery.
   *
   * @param models
   * @returns
   */
  static registerModels(...models: (RegisteredModel | RegisteredModel[])[]) {
    return registerModels(...models)
  }
  registerModels = Arkorm.registerModels

  /**
   * Register factory constructors or instances directly without relying on runtime discovery.
   *
   * @param factories
   * @returns
   */
  static registerFactories(...factories: (RegisteredFactory | RegisteredFactory[])[]) {
    return registerFactories(...factories)
  }
  registerFactories = Arkorm.registerFactories

  /**
   * Register additional runtime discovery paths for models without replacing configured paths.
   *
   * @param paths
   * @returns
   */
  static loadModelsFrom(paths: RuntimePathInput) {
    return loadModelsFrom(paths)
  }
  loadModelsFrom = Arkorm.loadModelsFrom

  /**
   * Register additional runtime discovery paths for seeders without replacing configured paths.
   *
   * @param paths
   * @returns
   */
  static loadSeedersFrom(paths: RuntimePathInput) {
    return loadSeedersFrom(paths)
  }
  loadSeedersFrom = Arkorm.loadSeedersFrom

  /**
   * Register additional runtime discovery paths for migrations without replacing configured paths.
   *
   * @param paths
   * @returns
   */
  static loadMigrationsFrom(paths: RuntimePathInput) {
    return loadMigrationsFrom(paths)
  }
  loadMigrationsFrom = Arkorm.loadMigrationsFrom

  /**
   * Register additional runtime discovery paths for factories without replacing configured paths.
   *
   * @param paths
   * @returns
   */
  static loadFactoriesFrom(paths: RuntimePathInput) {
    return loadFactoriesFrom(paths)
  }
  loadFactoriesFrom = Arkorm.loadFactoriesFrom

  /**
   * Get registered runtime discovery paths or registered constructors for a specific type.
   *
   * @param key
   * @returns
   */
  static getRegisteredPaths(key?: RuntimePathKey | undefined) {
    return getRegisteredPaths(key)
  }
  getRegisteredPaths = Arkorm.getRegisteredPaths

  /**
   * Get registered migration constructors instances
   *
   * @returns
   */
  static getRegisteredMigrations() {
    return getRegisteredMigrations()
  }
  getRegisteredMigrations = Arkorm.getRegisteredMigrations

  /**
   * Get registered seeder constructors instances.
   *
   * @returns
   */
  static getRegisteredSeeders() {
    return getRegisteredSeeders()
  }
  getRegisteredSeeders = Arkorm.getRegisteredSeeders

  /**
   * Get registered model constructors instances.
   *
   * @returns
   */
  static getRegisteredModels() {
    return getRegisteredModels()
  }
  getRegisteredModels = Arkorm.getRegisteredModels

  /**
   * Get registered factory constructors or instances.
   *
   * @returns
   */
  static getRegisteredFactories() {
    return getRegisteredFactories()
  }
  getRegisteredFactories = Arkorm.getRegisteredFactories
}

/**
 * Arkormx is an alias for Arkorm.
 */
export class Arkormx extends Arkorm {}
