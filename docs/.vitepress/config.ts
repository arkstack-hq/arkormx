import { defineConfig } from 'vitepress'

export default defineConfig({
    title: 'Arkormˣ',
    description: 'Modern TypeScript-first ORM for Node.js',
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
        ],
        sidebar: [
            {
                text: 'Start Here',
                items: [
                    { text: 'Get Started', link: '/guide/getting-started' },
                    { text: 'Setup', link: '/guide/setup' },
                    { text: 'Configuration', link: '/guide/configuration' },
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
        ],
        socialLinks: [
            { icon: 'github', link: 'https://github.com/arkstack-hq/arkormx' },
            { icon: 'npm', link: 'https://www.npmjs.com/package/arkormx' },
        ],
        search: {
            provider: 'local'
        },
    },
})
