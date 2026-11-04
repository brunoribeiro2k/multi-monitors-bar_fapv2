import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
const start = source.indexOf('\t_applyMainPanelColor(');
const end = source.indexOf('\n\t_applyMainPanelLayout(', start);
assert.ok(start >= 0 && end > start, 'find main panel color methods');
const methods = source.slice(start, end).replace(
    /\n\t(?=_restoreMainPanelColor\()/g, ',\n\t');

// Minimal St.Widget: set_style() emits notify::style like the real one.
class Panel {
    constructor() {
        this.style = null;
        this.handlers = new Map();
        this.nextId = 1;
    }

    get_style() { return this.style; }
    set_style(style) {
        this.style = style;
        for (const handler of [...this.handlers.values()])
            handler();
    }

    connect(signal, handler) {
        assert.equal(signal, 'notify::style');
        const id = this.nextId++;
        this.handlers.set(id, handler);
        return id;
    }

    disconnect(id) { this.handlers.delete(id); }
}

let color = 'rgba(0,0,0,0.7)';
const Main = { panel: new Panel() };
const context = vm.createContext({ Main, panelColor: () => color });
const manager = vm.runInContext(`({${methods}})`, context);
manager._settings = {};

manager._applyMainPanelColor();
const colored = ' background-color: rgba(0,0,0,0.7) !important;';
assert.equal(Main.panel.get_style(), colored, 'applies the configured color');
assert.equal(Main.panel.handlers.size, 1, 'watches the panel style once');

// Shell resets the style after login: the color must come back.
Main.panel.set_style(null);
assert.equal(Main.panel.get_style(), colored, 'restores the color after a reset');

// Applying again (settings changed) must not stack watchers.
manager._applyMainPanelColor();
assert.equal(Main.panel.handlers.size, 1, 'does not stack watchers');

// Without a color the panel is not guarded.
color = '';
manager._applyMainPanelColor();
Main.panel.set_style('color: red;');
assert.equal(Main.panel.get_style(), 'color: red;', 'leaves the style alone without a color');

// disable() puts the original style back and stops watching.
color = 'rgba(0,0,0,0.7)';
manager._applyMainPanelColor();
manager._restoreMainPanelColor();
assert.equal(Main.panel.get_style(), null, 'restores the original style');
assert.equal(Main.panel.handlers.size, 0, 'disconnects the watcher');
Main.panel.set_style('color: blue;');
assert.equal(Main.panel.get_style(), 'color: blue;', 'no longer guards after disable');

console.log('main panel color ok');
