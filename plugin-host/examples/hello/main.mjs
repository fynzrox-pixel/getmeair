import { createPlugin } from '../../sdk/node/getmeair-plugin.mjs';

const plugin = createPlugin({
  async onInitialize(params) {
    await plugin.storageSet('initializedAt', new Date().toISOString());
    plugin.log(`initialized for ${params.pluginId}`);
    plugin.registerCommand({
      id: 'hello.say',
      title: 'Hello Getmeair',
      description: 'Show a greeting from the reference plugin.',
    });
    plugin.registerMenu({
      items: [
        {
          id: 'hello.menu',
          title: 'Hello Getmeair',
          command: 'hello.say',
        },
      ],
    });
    return { ok: true };
  },
  async onEvent(params) {
    if (params.name === 'message.created') {
      const count = Number(await plugin.storageGet('messageCount') || 0) + 1;
      await plugin.storageSet('messageCount', count);
    }
    return { ok: true };
  },
  async onCommand(params) {
    const greeting = params.config?.greeting || 'Hello from Getmeair';
    plugin.log(greeting);
    return { ok: true, message: greeting };
  },
  async onMenu() {
    return {
      items: [
        { id: 'hello.menu', title: 'Hello Getmeair', command: 'hello.say' },
      ],
    };
  },
});
