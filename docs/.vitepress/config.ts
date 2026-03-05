import { defineConfig } from 'vitepress'

export default defineConfig({
    title: 'Arkorm',
    description: 'Prisma-first ORM for Arkstack',
    themeConfig: {
        nav: [
            { text: 'Guide', link: '/guide/setup' },
        ],
        sidebar: [
            {
                text: 'Guide',
                items: [
                    { text: 'Setup', link: '/guide/setup' },
                    { text: 'Typing', link: '/guide/typing' },
                ],
            },
        ],
    },
})
