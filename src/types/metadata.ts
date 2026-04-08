import type { RelationshipModelStatic } from './ModelStatic'
import type { SoftDeleteConfig } from './core'
import type { PrimaryKeyGeneration, TimestampColumnBehavior } from './migrations'

export type ColumnMap = Record<string, string>

export interface ModelMetadata {
    table: string
    primaryKey: string
    columns: ColumnMap
    softDelete: SoftDeleteConfig
    primaryKeyGeneration?: PrimaryKeyGeneration
    timestampColumns?: TimestampColumnBehavior[]
}

export type RelationMetadataType =
    | 'hasOne'
    | 'hasMany'
    | 'belongsTo'
    | 'belongsToMany'
    | 'hasOneThrough'
    | 'hasManyThrough'
    | 'morphOne'
    | 'morphMany'
    | 'morphToMany'

interface BaseRelationMetadata {
    type: RelationMetadataType
    relatedModel: RelationshipModelStatic
}

export interface HasOneRelationMetadata extends BaseRelationMetadata {
    type: 'hasOne'
    foreignKey: string
    localKey: string
}

export interface HasManyRelationMetadata extends BaseRelationMetadata {
    type: 'hasMany'
    foreignKey: string
    localKey: string
}

export interface BelongsToRelationMetadata extends BaseRelationMetadata {
    type: 'belongsTo'
    foreignKey: string
    ownerKey: string
}

export interface BelongsToManyRelationMetadata extends BaseRelationMetadata {
    type: 'belongsToMany'
    throughTable: string
    foreignPivotKey: string
    relatedPivotKey: string
    parentKey: string
    relatedKey: string
}

export interface HasOneThroughRelationMetadata extends BaseRelationMetadata {
    type: 'hasOneThrough'
    throughTable: string
    firstKey: string
    secondKey: string
    localKey: string
    secondLocalKey: string
}

export interface HasManyThroughRelationMetadata extends BaseRelationMetadata {
    type: 'hasManyThrough'
    throughTable: string
    firstKey: string
    secondKey: string
    localKey: string
    secondLocalKey: string
}

export interface MorphOneRelationMetadata extends BaseRelationMetadata {
    type: 'morphOne'
    morphName: string
    morphIdColumn: string
    morphTypeColumn: string
    localKey: string
}

export interface MorphManyRelationMetadata extends BaseRelationMetadata {
    type: 'morphMany'
    morphName: string
    morphIdColumn: string
    morphTypeColumn: string
    localKey: string
}

export interface MorphToManyRelationMetadata extends BaseRelationMetadata {
    type: 'morphToMany'
    throughTable: string
    morphName: string
    morphIdColumn: string
    morphTypeColumn: string
    relatedPivotKey: string
    parentKey: string
    relatedKey: string
}

export type RelationMetadata =
    | HasOneRelationMetadata
    | HasManyRelationMetadata
    | BelongsToRelationMetadata
    | BelongsToManyRelationMetadata
    | HasOneThroughRelationMetadata
    | HasManyThroughRelationMetadata
    | MorphOneRelationMetadata
    | MorphManyRelationMetadata
    | MorphToManyRelationMetadata