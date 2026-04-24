import { SidebarType, defineVersionedConfig } from '@viteplus/versions'

const sidebar: SidebarType = [
    {
        text: 'Start Here',
        items: [
            { text: 'Get Started', link: '/guide/getting-started' },
            { text: 'Setup', link: '/guide/setup' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Prisma Compatibility', link: '/guide/prisma-compatibility' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
        ],
    },
    {
        text: 'Core ORM',
        items: [
            { text: 'Typing', link: '/guide/typing' },
            { text: 'Models', link: '/guide/models' },
            { text: 'Mutators & Accessors', link: '/guide/mutators' },
            { text: 'Casting', link: '/guide/casting' },
            { text: 'Query Builder', link: '/guide/query-builder' },
            { text: 'Transactions', link: '/guide/transactions' },
            { text: 'Pagination', link: '/guide/pagination' },
        ],
    },
    {
        text: 'Relationships & Data',
        items: [
            { text: 'Relationships', link: '/guide/relationships' },
            { text: 'Factories & Seeders', link: '/guide/factories-seeders' },
        ],
    },
    {
        text: 'CLI & Migrations',
        items: [
            { text: 'Migrations & CLI', link: '/guide/migrations-cli' },
        ],
    },
    {
        text: 'Production',
        items: [
            { text: 'Production', link: '/guide/production' },
            { text: 'Postgres Optimizations', link: '/guide/postgres-optimizations' },
        ],
    },
]

const sidebar2x: SidebarType = sidebar.slice().map(section => {
    if (section.text === 'Start Here' && Array.isArray(section.items)) {
        return {
            ...section,
            items: [...section.items].concat(
                { text: 'Upgrade Guide', link: '/guide/upgrade-guide' },
            )
        }
    }
    return section
})

export default defineVersionedConfig({
    title: 'Arkormˣ',
    description: 'Modern TypeScript-first ORM for Node.js',

    versionsConfig: {
        current: '2.x',  // Label for current version
        sources: 'src',     // Current version source directory
        archive: 'versions', // Archive directory for older versions
        versionSwitcher: {
            text: 'v2.x',
            includeCurrentVersion: true
        }
    },

    head: [
        ['link', { rel: 'icon', href: '/logo.png' }],
        ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }],
        ['meta', { name: 'description', content: 'Modern TypeScript-first ORM for Node.js' }],
        ['meta', { name: 'keywords', content: 'API, Node.js, TypeScript, JSON responses, collections, pagination' }],
        ['meta', { name: 'author', content: 'Toneflix' }],
        ['meta', { property: 'og:title', content: 'Arkormˣ' }],
        ['meta', { property: 'og:description', content: 'Modern TypeScript-first ORM for Node.js' }],
        ['meta', { property: 'og:image', content: '/logo.jpg' }],
        ['meta', { property: 'og:url', content: 'https://arkormx.toneflix.net/' }],
        ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
        ['meta', { name: 'twitter:title', content: 'Arkormˣ' }],
        ['meta', { name: 'twitter:description', content: 'Modern TypeScript-first ORM for Node.js' }],
        ['meta', { name: 'twitter:image', content: '/logo.jpg' }]
    ],
    themeConfig: {
        logo: '/logo.png',
        nav: [
            { text: 'Guide', link: '/guide/getting-started' },
            { text: 'CLI', link: '/guide/migrations-cli' },
            { text: 'Production', link: '/guide/production' },
            {
                component: 'VersionSwitcher',
            },
        ],
        sidebar: {
            root: sidebar2x,
            '1.3': sidebar
        },
        socialLinks: [
            { icon: 'github', link: 'https://github.com/arkstack-hq/arkormx' },
            { icon: 'npm', link: 'https://www.npmjs.com/package/arkormx' },
        ],
        search: {
            provider: 'local'
        },
    },
})
