export abstract class Relation<TModel> {
    public abstract getResults (): Promise<TModel | TModel[] | null>
}
