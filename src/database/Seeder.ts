export type SeederConstructor = new () => Seeder
export type SeederInput = Seeder | SeederConstructor
export type SeederCallArgument = SeederInput | SeederInput[]

export const SEEDER_BRAND = Symbol.for('arkormx.seeder')

/**
 * The Seeder class serves as a base for defining database seeders, which are 
 * used to populate the database with initial or test data.
 *
 * @author Legacy (3m1n3nc3)
 * @since 0.1.0
 */
export abstract class Seeder {
    public static readonly [SEEDER_BRAND] = true

    /**
     * Defines the operations to be performed when running the seeder. 
     */
    public abstract run (): Promise<void> | void

    /**
     * Runs one or more seeders.
     * 
     * @param seeders   The seeders to be run.
     */
    public async call (...seeders: SeederCallArgument[]): Promise<void> {
        await Seeder.runSeeders(...seeders)
    }

    /**
     * Converts a SeederInput into a Seeder instance. 
     * 
     * @param input     The SeederInput to convert.
     * @returns         A Seeder instance.
     */
    private static toSeederInstance (input: SeederInput): Seeder {
        if (typeof input === 'function')
            return new input()

        if (typeof input === 'object' && input !== null) {
            const candidate = input as Partial<Seeder>
            if (typeof candidate.run === 'function')
                return input as Seeder
        }

        return input
    }

    /**
     * Runs the given seeders in sequence.
     * 
     * @param seeders   The seeders to be run.
     */
    private static async runSeeders (...seeders: SeederCallArgument[]): Promise<void> {
        const queue = seeders.reduce<SeederInput[]>((all, current) => {
            if (Array.isArray(current))
                return [...all, ...current]

            all.push(current)

            return all
        }, [])

        for (const seeder of queue) {
            const instance = this.toSeederInstance(seeder)
            await instance.run()
        }
    }
}
