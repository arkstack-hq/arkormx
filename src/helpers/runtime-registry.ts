import type { MigrationClass } from '../types/migrations'
import type { SeederConstructor } from '../database/Seeder'
import type { RelationshipModelStatic } from '../types/ModelStatic'
import { RelationResolutionException } from '../Exceptions/RelationResolutionException'

export type RuntimePathKey = 'models' | 'seeders' | 'migrations' | 'factories'
export type RuntimePathInput = string | string[]
export type RuntimePathMap = Partial<Record<RuntimePathKey, RuntimePathInput>>
export type RuntimeConstructor = new (...args: any[]) => any

export type RegisteredModel = RuntimeConstructor
export type RegisteredFactory = RuntimeConstructor | object

interface RuntimeRegistry {
  paths: Record<RuntimePathKey, string[]>
  migrations: MigrationClass[]
  seeders: SeederConstructor[]
  models: RegisteredModel[]
  factories: RegisteredFactory[]
}

const createEmptyRegistry = (): RuntimeRegistry => ({
  paths: {
    models: [],
    seeders: [],
    migrations: [],
    factories: [],
  },
  migrations: [],
  seeders: [],
  models: [],
  factories: [],
})

const registry = createEmptyRegistry()

const pushUnique = <T>(items: T[], values: T[]): void => {
  values.forEach((value) => {
    if (!items.includes(value)) items.push(value)
  })
}

const normalizePathInput = (paths: RuntimePathInput | undefined): string[] => {
  if (paths === undefined) return []

  return (Array.isArray(paths) ? paths : [paths]).filter(
    (path) => typeof path === 'string' && path.trim().length > 0,
  )
}

const normalizeConstructors = <T>(items: T[]): T[] =>
  items.flatMap((item) => (Array.isArray(item) ? item : [item])).filter(Boolean)

/**
 * Register additional runtime discovery paths without replacing configured paths.
 *
 * @param paths
 */
export const registerPaths = (paths: RuntimePathMap): void => {
  Object.entries(paths).forEach(([key, value]) => {
    pushUnique(registry.paths[key as RuntimePathKey], normalizePathInput(value))
  })
}

/**
 * Register additional runtime discovery paths for migrations without replacing configured paths.
 *
 * @param paths
 * @returns
 */
export const loadMigrationsFrom = (paths: RuntimePathInput): void =>
  registerPaths({ migrations: paths })
/**
 * Register additional runtime discovery paths for seeders without replacing configured paths.
 *
 * @param paths
 * @returns
 */
export const loadSeedersFrom = (paths: RuntimePathInput): void => registerPaths({ seeders: paths })
/**
 * Register additional runtime discovery paths for models without replacing configured paths.
 *
 * @param paths
 * @returns
 */
export const loadModelsFrom = (paths: RuntimePathInput): void => registerPaths({ models: paths })
/**
 * Register additional runtime discovery paths for factories without replacing configured paths.
 *
 * @param paths
 * @returns
 */
export const loadFactoriesFrom = (paths: RuntimePathInput): void =>
  registerPaths({ factories: paths })

/**
 * Register migration constructors directly without relying on runtime discovery.
 *
 * @param migrations
 */
export const registerMigrations = (
  ...migrations: Array<MigrationClass | MigrationClass[]>
): void => {
  pushUnique(registry.migrations, normalizeConstructors(migrations) as MigrationClass[])
}

/**
 * Register seeder constructors directly without relying on runtime discovery.
 *
 * @param seeders
 */
export const registerSeeders = (
  ...seeders: Array<SeederConstructor | SeederConstructor[]>
): void => {
  pushUnique(registry.seeders, normalizeConstructors(seeders) as SeederConstructor[])
}

/**
 * Register model constructors directly without relying on runtime discovery.
 *
 * @param models
 */
export const registerModels = (...models: Array<RegisteredModel | RegisteredModel[]>): void => {
  pushUnique(registry.models, normalizeConstructors(models) as RegisteredModel[])
}

/**
 * Register factory constructors or instances directly without relying on runtime discovery.
 *
 * @param factories
 */
export const registerFactories = (
  ...factories: Array<RegisteredFactory | RegisteredFactory[]>
): void => {
  pushUnique(registry.factories, normalizeConstructors(factories) as RegisteredFactory[])
}

/**
 * Get registered runtime discovery paths or registered constructors for a specific type.
 *
 * @param key
 * @returns
 */
export const getRegisteredPaths = (
  key?: RuntimePathKey,
): string[] | Record<RuntimePathKey, string[]> => {
  if (key) return [...registry.paths[key]]

  return {
    models: [...registry.paths.models],
    seeders: [...registry.paths.seeders],
    migrations: [...registry.paths.migrations],
    factories: [...registry.paths.factories],
  }
}

/**
 * Get registered migration constructors instances.
 *
 * @returns
 */
export const getRegisteredMigrations = (): MigrationClass[] => [...registry.migrations]
/**
 * Get registered seeder constructors instances.
 *
 * @returns
 */
export const getRegisteredSeeders = (): SeederConstructor[] => [...registry.seeders]
/**
 * Get registered model constructors instances.
 *
 * @returns
 */
export const getRegisteredModels = (): RegisteredModel[] => [...registry.models]

export const resolveRegisteredModel = (
  modelName: string,
  context: { operation?: string; relation?: string } = {},
): RelationshipModelStatic => {
  const normalized = modelName.trim()
  const model = registry.models.find((registered) => registered.name === normalized)

  if (!model) {
    throw new RelationResolutionException(
      `Model [${normalized}] is not registered. Register it with Arkorm.registerModels() or load it through configured model paths.`,
      {
        operation: context.operation ?? 'relationship.resolveModel',
        model: normalized,
        relation: context.relation,
      },
    )
  }

  return model as unknown as RelationshipModelStatic
}
/**
 * Get registered factory constructors or instances.
 *
 * @returns
 */
export const getRegisteredFactories = (): RegisteredFactory[] => [...registry.factories]

export const resetRuntimeRegistryForTests = (): void => {
  const empty = createEmptyRegistry()

  registry.paths = empty.paths
  registry.migrations = empty.migrations
  registry.seeders = empty.seeders
  registry.models = empty.models
  registry.factories = empty.factories
}
