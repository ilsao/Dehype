import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').at(1)

export default defineConfig({
  base: repositoryName ? `/${repositoryName}/` : '/',
  plugins: [react(), tailwindcss()],
})
