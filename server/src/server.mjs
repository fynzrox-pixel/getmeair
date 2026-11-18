import { config } from './config.mjs';
import { createApp } from './app.mjs';

const { server } = createApp({ config });

server.listen(config.port, config.host, () => {
  console.log(`Getmeair server listening on http://${config.host}:${config.port}`);
  console.log(`Database: ${config.dbPath}`);
  if (config.allowDevLogin) {
    console.log('WARNING: development login is enabled. Disable GETMEAIR_ALLOW_DEV_LOGIN in production.');
  }
  if (!config.telegramBotToken) {
    console.log('Telegram initData login is disabled until TELEGRAM_BOT_TOKEN is configured.');
  }
  if (!config.ownerBootstrapSecret) {
    console.log('Owner claim is disabled until OWNER_BOOTSTRAP_SECRET is configured.');
  }
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
