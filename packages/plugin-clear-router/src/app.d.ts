declare module 'arkormx' {
    interface Model {
        resolveRouteBinding?(value: unknown, field?: string): unknown | Promise<unknown>
    }
} 
