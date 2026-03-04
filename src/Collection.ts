import { collect } from '@h3ravel/collect.js'

type CollectConstructor = new <T>(items?: T[]) => {
    all: () => T[]
}

const BaseCollection = collect([]).constructor as CollectConstructor

export class ArkCollection<T = unknown> extends BaseCollection<T> {
    public static make<TItem = unknown> (items: TItem[] = []): ArkCollection<TItem> {
        return new ArkCollection<TItem>(items)
    }
}

export function arkCollect<T = unknown> (items: T[] = []): ArkCollection<T> {
    return ArkCollection.make(items)
}