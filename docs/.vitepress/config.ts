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
                    { text: 'Get Started', link: '/guide/getting-started' },
                    { text: 'Setup', link: '/guide/setup' },
                    { text: 'Typing', link: '/guide/typing' },
                ],
            },
        ],
        socialLinks: [
            { icon: 'github', link: 'https://github.com/arkstack/arkorm' },
            { icon: 'npm', link: 'https://www.npmjs.com/package/arkorm' },
        ]
    },
})
