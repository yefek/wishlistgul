import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const purchasedAt = new Date(2026, 8, 12, 14).getTime();
const purchasedItem = {
    id: 'bought-product', status: 'bought', boughtPrice: 1500,
    boughtAt: purchasedAt, createdAt: purchasedAt, updatedAt: purchasedAt,
    itemName: 'Test ürünü', category: 'diger', price: '2000', priority: 3
};

function functionSource(name) {
    const start = html.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} exists`);
    const end = html.indexOf('\n        }', start);
    return html.slice(start, end + '\n        }'.length);
}

function createApp(fixtureItems = [purchasedItem]) {
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, {
                value: '', style: {}, textContent: '', innerHTML: '', listeners: {},
                classList: {
                    add: (...names) => names.forEach(name => classes.add(name)),
                    remove: (...names) => names.forEach(name => classes.delete(name)),
                    contains: name => classes.has(name)
                },
                addEventListener(name, listener) { this.listeners[name] = listener; },
                focus() { this.focused = true; }
            });
        }
        return elements.get(id);
    }
    const app = {
        items: structuredClone(fixtureItems), activeId: fixtureItems[0]?.id,
        purchaseTargetId: null, wrMonth: 8, wrYear: 2026,
        MONTHS_TR: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
        document: { getElementById: element, body: { style: {} }, querySelectorAll: () => [], querySelector: () => null },
        window: {}, requestAnimationFrame: callback => callback(), setTimeout: callback => callback(),
        safeLocalPersist() { app.localItems = structuredClone(app.items); },
        persistRemoteItems() { app.remoteItems = structuredClone(app.items); },
        render() { app.renderCount = (app.renderCount || 0) + 1; },
        showToast(message) { app.lastToast = message; },
        closeDetailModal() { element('modalBack').classList.remove('show'); app.activeId = null; },
        switchMainView() { app.returnedHome = true; }, resetMobileScroll() {},
        ensureWrappedDashboardShell() {}, getAIStats: () => null,
        hasRealImage: () => false, getImageSrc: () => '',
        wrHighlight: () => '', console
    };
    Object.assign(app, {
        modalBack: element('modalBack'), purchaseBack: element('purchaseBack'),
        purchasePriceInput: element('purchasePrice'), closePurchaseBtn: element('closePurchase')
    });
    element('modalBack').classList.add('show');
    element('wrappedBack').classList.add('show');
    const context = vm.createContext(app);
    for (const name of ['persist', 'refreshWrappedIfOpen', 'getGeneralItems', 'daysInMonth', 'wrEscape', 'wrNumber', 'wrCurrency', 'wrCategoryLabel', 'wrReportData', 'wrMetric']) {
        vm.runInContext(functionSource(name), context);
    }
    const wrappedStart = html.lastIndexOf('        updateWrappedUI = function () {');
    const wrappedEnd = html.indexOf('\n        };', wrappedStart);
    vm.runInContext(html.slice(wrappedStart, wrappedEnd + '\n        };'.length), context);
    const purchaseStart = html.indexOf('        /* ═══ PURCHASE MODAL ═══ */');
    const purchaseEnd = html.indexOf('        /* ═══ FILE PICK ═══ */', purchaseStart);
    vm.runInContext(html.slice(purchaseStart, purchaseEnd), context);
    return {
        app, element,
        edit() { element('editBoughtPrice').listeners.click(); },
        confirm(value) { element('purchasePrice').value = value; element('confirmPurchase').listeners.click(); },
        report(month = 8) { app.wrMonth = month; return app.wrReportData(); }
    };
}

test('all inline application scripts parse', () => {
    for (const [, attributes, source] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (!/\bsrc\s*=/.test(attributes)) new vm.Script(source);
    }
});

test('price correction persists, refreshes statistics and preserves purchase month and detail', () => {
    const { app, element, edit, confirm, report } = createApp([
        purchasedItem, { ...purchasedItem, id: 'second', boughtPrice: 200 }
    ]);
    assert.equal(report().totalSpent, 1700);
    edit();
    assert.equal(element('purchasePrice').value, '1500');
    assert.equal(element('confirmPurchase').textContent, 'Kaydet');
    confirm('950');
    assert.equal(app.items[0].boughtPrice, 950);
    assert.equal(app.items[0].boughtAt, purchasedAt);
    assert.equal(app.items[0].status, 'bought');
    assert.ok(app.items[0].updatedAt > purchasedAt);
    assert.equal(app.localItems[0].boughtPrice, 950);
    assert.equal(app.remoteItems[0].boughtPrice, 950);
    assert.equal(element('mBoughtPriceDisplay').value, '₺ 950');
    assert.equal(element('modalBack').classList.contains('show'), true);
    assert.equal(element('purchaseBack').classList.contains('show'), false);
    assert.equal(app.activeId, purchasedItem.id);
    assert.equal(app.document.body.style.overflow, 'hidden');
    assert.equal(app.returnedHome, undefined);
    assert.match(element('wrStatGrid').innerHTML, /₺1\.150/);
    assert.match(element('wrBudget').innerHTML, /₺1\.150/);
    assert.match(element('wrActivity').innerHTML, /₺950/);
    assert.equal(report().totalSpent, 1150);
    assert.equal(report().boughtItems.length, 2);
    assert.equal(report(9).totalSpent, 0);
    edit();
    assert.equal(element('purchasePrice').value, '950');
});

test('cancel and backdrop dismiss discard changes and keep details open', () => {
    for (const cancelWithBackdrop of [false, true]) {
        const { app, element, edit } = createApp();
        edit();
        element('purchasePrice').value = '99';
        if (cancelWithBackdrop) element('purchaseBack').listeners.click({ target: element('purchaseBack') });
        else element('closePurchase').listeners.click();
        assert.equal(app.items[0].boughtPrice, 1500);
        assert.equal(app.localItems, undefined);
        assert.equal(element('modalBack').classList.contains('show'), true);
        assert.equal(app.document.body.style.overflow, 'hidden');
    }
});

test('empty, negative, malformed and oversized correction cannot overwrite the price', () => {
    for (const invalid of ['', '   ', '-5', 'wrong', '1.5', '9007199254740992', '9'.repeat(400)]) {
        const { app, element, edit, confirm } = createApp();
        edit();
        confirm(invalid);
        assert.equal(app.items[0].boughtPrice, 1500, invalid);
        assert.equal(app.localItems, undefined);
        assert.equal(element('purchaseBack').classList.contains('show'), true);
    }
});

test('zero is a valid corrected price and reaches statistics', () => {
    const { app, element, edit, confirm, report } = createApp();
    edit();
    confirm('0');
    assert.equal(app.items[0].boughtPrice, 0);
    assert.equal(element('mBoughtPriceDisplay').value, '₺ 0');
    assert.equal(report().totalSpent, 0);
    assert.equal(report().boughtItems.length, 1);
    assert.equal(app.items[0].boughtAt, purchasedAt);
});

test('first purchase still marks item bought, timestamps it and returns home', () => {
    const { app, element, confirm } = createApp([{ ...purchasedItem, status: 'want', boughtAt: 0, boughtPrice: 0 }]);
    app.openPurchaseModal(purchasedItem.id);
    assert.equal(element('purchasePrice').value, '');
    assert.equal(element('confirmPurchase').textContent, 'Onayla');
    confirm('700');
    assert.equal(app.items[0].status, 'bought');
    assert.equal(app.items[0].boughtPrice, 700);
    assert.ok(app.items[0].boughtAt > purchasedAt);
    assert.equal(app.returnedHome, true);
});
