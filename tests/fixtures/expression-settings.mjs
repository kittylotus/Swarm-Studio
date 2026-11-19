export async function openExpressionSettings(page, tab) {
    const trigger = page.locator('[data-expression-settings-open]');
    await trigger.waitFor({ state: 'attached' });
    if (!await trigger.isVisible()) return;
    const drawer = page.locator('.expression-settings-drawer');
    if (!await drawer.isVisible()) await trigger.click();
    if (tab) await drawer.getByRole('tab', { name: tab, exact: true }).click();
}

export async function closeExpressionSettings(page) {
    const drawer = page.locator('.expression-settings-drawer');
    if (!await drawer.isVisible()) return;
    await drawer.getByRole('button', { name: 'Close expression settings' }).click();
    await drawer.waitFor({ state: 'hidden' });
}
