import { t, tk } from '@bv/ui';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { store } from './store.svelte';

/**
 * Updates from GitHub Releases (spec §13, phase 7). Every update is checked against the
 * public key of the Tauri updater before it is installed (spec §16).
 */
export async function checkForUpdates(manual: boolean): Promise<void> {
  if (!store.core.isTauri) return;
  try {
    const update = await check();
    if (!update) {
      if (manual) store.notify(t('update.none'));
      return;
    }
    store.dialog = {
      title: t('update.title'),
      text: tk('update.text', { version: update.version, current: store.version }),
      buttons: [
        {
          label: t('update.install'),
          kind: 'primary',
          action: () => {
            store.notify(t('update.downloading'));
            void update
              .downloadAndInstall()
              .then(() => relaunch())
              .catch((e: unknown) =>
                store.notify(tk('update.failed', { message: String(e) }), true),
              );
          },
        },
        { label: t('update.later'), action: () => {} },
      ],
    };
  } catch (e) {
    if (manual) store.notify(tk('update.failed', { message: String(e) }), true);
  }
}
