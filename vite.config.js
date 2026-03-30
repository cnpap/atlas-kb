import tailwindcss from '@tailwindcss/vite';
import laravel from 'laravel-vite-plugin';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const appUrl = env.APP_URL ? new URL(env.APP_URL) : null;
    const devServerHost = env.VITE_DEV_SERVER_HOST ?? appUrl?.hostname ?? 'localhost';
    const devServerPort = Number(env.VITE_DEV_SERVER_PORT ?? 5173);
    const devServerOrigin = env.VITE_DEV_SERVER_ORIGIN ?? `${appUrl?.protocol ?? 'http:'}//${devServerHost}:${devServerPort}`;

    return {
        plugins: [
            laravel({
                input: ['resources/css/app.css', 'resources/js/app.js'],
                refresh: true,
            }),
            tailwindcss(),
        ],
        server: {
            host: '0.0.0.0',
            port: devServerPort,
            strictPort: true,
            cors: true,
            origin: devServerOrigin,
            hmr: {
                host: devServerHost,
                port: devServerPort,
                clientPort: devServerPort,
                protocol: appUrl?.protocol === 'https:' ? 'wss' : 'ws',
            },
            watch: {
                ignored: ['**/storage/framework/views/**'],
            },
        },
    };
});
