import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generationNotificationCopy, requestGenerationNotificationPermission, shouldShowGenerationNotification, showGenerationNotification } from '../src/notifications.ts';

const app = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
const notifications = readFileSync(new URL('../src/notifications.ts', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../public/notification-sw.js', import.meta.url), 'utf8');

assert.equal(shouldShowGenerationNotification(true, 'visible', true), false, 'Focused visible Studio must stay silent.');
assert.equal(shouldShowGenerationNotification(true, 'hidden', false), true, 'Hidden Studio should notify.');
assert.equal(shouldShowGenerationNotification(true, 'visible', false), true, 'Visible but unfocused Studio should notify.');
assert.equal(shouldShowGenerationNotification(false, 'hidden', false), false, 'Opt-out must suppress background notifications.');
assert.deepEqual(generationNotificationCopy({ kind: 'complete', count: 2 }), {
  title: 'Generation complete',
  body: '2 outputs are ready in Library.',
});
assert.equal(generationNotificationCopy({ kind: 'error', message: 'boom' }).title, 'Generation failed');

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalNotification = Object.getOwnPropertyDescriptor(globalThis, 'Notification');
let permissionRequests = 0;
let shownNotification = null;
const notificationMock = {
  permission: 'default',
  async requestPermission() {
    permissionRequests += 1;
    this.permission = 'granted';
    return 'granted';
  },
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true, location: { href: 'https://studio.example/app/' } } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  serviceWorker: {
    async getRegistration() {
      return { async showNotification(title, options) { shownNotification = { title, options }; } };
    },
  },
} });
Object.defineProperty(globalThis, 'Notification', { configurable: true, value: notificationMock });
try {
  assert.equal(await requestGenerationNotificationPermission(), 'granted', 'Opt-in should request permission exactly when permission is undecided.');
  assert.equal(permissionRequests, 1, 'Permission request should happen once.');
  assert.equal(await showGenerationNotification({ kind: 'complete', count: 3 }), true, 'Granted PWA notification should dispatch through the service worker.');
  assert.equal(shownNotification?.title, 'Generation complete');
  assert.equal(shownNotification?.options?.body, '3 outputs are ready in Library.');
  assert.equal(shownNotification?.options?.data?.source, 'swarm-studio');
} finally {
  for (const [name, descriptor] of [['window', originalWindow], ['navigator', originalNavigator], ['Notification', originalNotification]]) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

assert(app.includes('id="generation-notifications-enabled"'), 'Appearance settings must expose the opt-in generation notification toggle.');
assert(app.includes('requestGenerationNotificationPermission()'), 'Permission must be requested only through the explicit settings action.');
assert(app.includes('document.visibilityState, document.hasFocus()'), 'Foreground Studio must suppress system notifications.');
assert(app.includes('notifyGenerationInBackground({ kind: "complete"') && app.includes('notifyGenerationInBackground({ kind: "review"') && app.includes('notifyGenerationInBackground({ kind: "inpaint"'), 'Create, review-before-save, and inpaint completions must share background notifications.');
assert(app.includes('notifyGenerationInBackground({ kind: "error"'), 'Background generation failures must notify too.');
assert(notifications.includes('navigator.serviceWorker.getRegistration()') && notifications.includes('registration.showNotification('), 'Mobile/PWA notifications must use the active service worker registration.');
assert(!notifications.includes('new Notification('), 'Do not regress to main-thread Notification(), which is unreliable on mobile.');
assert(vite.includes('importScripts: ["notification-sw.js"]'), 'Generated Workbox service worker must import the notification click handler.');
assert(worker.includes('notificationclick') && worker.includes('clients.matchAll') && worker.includes('existing.focus()') && worker.includes('clients.openWindow'), 'Notification clicks must focus an existing Studio window or reopen it.');

console.log('generation notification contract OK');
