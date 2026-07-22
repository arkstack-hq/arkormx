import type { RegisteredModelClass, RegisteredModelName, RelatedModelClass } from '../types/model'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { getRegisteredModels, getRegisteredPaths, registerModels } from './runtime-registry'

import { createJiti } from 'jiti'
import { existsSync } from 'node:fs'
import { getUserConfig } from './runtime-config'
import { pathToFileURL } from 'node:url'

type ModelModule = Record<string, unknown> & {
  default?: unknown
}

const modelExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']

const isModelModule = (value: unknown): value is ModelModule =>
  typeof value === 'object' && value !== null

const isModelConstructor = (value: unknown): value is RelatedModelClass => {
  if (typeof value !== 'function') return false

  const candidate = value as unknown as Record<string, unknown>

  return (
    typeof candidate.query === 'function' &&
    typeof candidate.hydrate === 'function' &&
    typeof candidate.getTable === 'function' &&
    typeof candidate.getPrimaryKey === 'function'
  )
}

const resolveModelExport = (module: ModelModule | unknown, modelName: string): unknown => {
  if (!isModelModule(module)) return module

  return module.default ?? module[modelName] ?? module
}

const resolveRuntimeDirectory = (directory: string): string => {
  if (existsSync(directory)) return directory

  const buildOutput = getUserConfig('paths')?.buildOutput
  if (typeof buildOutput !== 'string' || buildOutput.trim().length === 0) return directory

  const relativeSource = relative(process.cwd(), directory)
  if (!relativeSource || relativeSource.startsWith('..')) return directory

  const mappedDirectory = join(buildOutput, relativeSource)

  return existsSync(mappedDirectory) ? mappedDirectory : directory
}

const resolveRuntimeModelPath = (sourcePath: string): string => {
  const extension = extname(sourcePath).toLowerCase()
  const candidates: string[] = []

  if (modelExtensions.includes(extension)) {
    candidates.push(sourcePath)
  } else {
    candidates.push(...modelExtensions.map((modelExtension) => `${sourcePath}${modelExtension}`))
  }

  const buildOutput = getUserConfig('paths')?.buildOutput
  if (typeof buildOutput === 'string' && buildOutput.trim().length > 0) {
    candidates.slice().forEach((candidate) => {
      const relativeSource = relative(process.cwd(), candidate)
      if (!relativeSource || relativeSource.startsWith('..')) return

      const mappedFile = join(buildOutput, relativeSource)
      const mappedExtension = extname(mappedFile).toLowerCase()

      if (['.ts', '.tsx', '.mts', '.cts'].includes(mappedExtension)) {
        const base = mappedFile.slice(0, -mappedExtension.length)
        candidates.push(`${base}.js`, `${base}.mjs`, `${base}.cjs`)

        return
      }

      candidates.push(mappedFile)
    })
  }

  return candidates.find((candidate) => existsSync(candidate)) ?? sourcePath
}

const getModelDirectories = (): string[] => {
  const configured = getUserConfig('paths')?.models
  const registered = getRegisteredPaths('models') as string[]
  const directories = [...(typeof configured === 'string' ? [configured] : []), ...registered]

  return directories
    .map((directory) =>
      resolveRuntimeDirectory(isAbsolute(directory) ? directory : resolve(directory)),
    )
    .filter((directory, index, all) => all.indexOf(directory) === index)
}

const loadModel = (modelName: string, exportName: string): RelatedModelClass | undefined => {
  const jiti = createJiti(`${pathToFileURL(resolve('.')).href}/`, {
    interopDefault: false,
    tsconfigPaths: true,
    sourceMaps: true,
  })

  for (const directory of getModelDirectories()) {
    const sourcePath = join(directory, modelName)
    const modulePath = resolveRuntimeModelPath(sourcePath)
    if (!existsSync(modulePath)) continue

    const module = jiti(modulePath) as ModelModule | unknown
    const model = resolveModelExport(module, exportName)

    if (!isModelConstructor(model)) continue

    registerModels(model)

    return model
  }
}

/**
 * Synchronously resolve an application model by name.
 *
 * Registered models are returned first. If a model has not been registered yet,
 * ArkORM loads it from the configured models paths, registers it, and returns
 * the matching constructor.
 *
 * @param modelName
 * @returns
 */
export function getModel<TName extends RegisteredModelName>(
  modelName: TName,
): RegisteredModelClass<TName>
export function getModel<TModel extends RelatedModelClass = RelatedModelClass>(
  modelName: string,
): TModel
export function getModel(modelName: string): RelatedModelClass {
  const normalized = modelName.trim()
  const exportName = normalized
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/\.[^.]+$/, '')

  if (!normalized || !exportName) throw new Error('Model name is required.')

  const registeredModel = getRegisteredModels().find((model) => model.name === exportName)
  if (registeredModel) return registeredModel as unknown as RelatedModelClass

  const model = loadModel(normalized, exportName)
  if (model) return model

  throw new Error(`Model "${modelName}" not found.`)
}
