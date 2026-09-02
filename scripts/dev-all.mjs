import { spawn } from 'node:child_process'

const apps = ['dev:web', 'dev:system', 'dev:driver', 'dev:cliente']

for (const script of apps) {
  const child = spawn('npm', ['run', script], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  child.on('exit', (code) => {
    if (code) process.exitCode = code ?? 1
  })
}
