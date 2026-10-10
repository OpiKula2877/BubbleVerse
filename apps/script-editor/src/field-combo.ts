import { comboFromEvent, getCore, normalizeCombo, t } from '@bv/ui';
import * as Blockly from 'blockly/core';

/**
 * The shortcut field of the "when … is pressed" block: a click starts listening and the next
 * key combination pressed is written in, so nobody has to know key names. Esc or a click
 * elsewhere cancels.
 */
export class FieldCombo extends Blockly.Field<string> {
  override SERIALIZABLE = true;
  private stop: (() => void) | null = null;

  static override fromJson(options: Blockly.FieldConfig & { value?: string }): FieldCombo {
    return new FieldCombo(options.value ?? 'Ctrl+Alt+K');
  }

  protected override doClassValidation_(value?: unknown): string | null {
    return typeof value === 'string' ? normalizeCombo(value) : null;
  }

  protected override getText_(): string {
    return this.stop ? t('editor.pressKeys') : `⌨ ${this.getValue() ?? ''}`;
  }

  protected override showEditor_(): void {
    if (this.stop) return;
    const core = getCore();
    const key = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const plain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
      if (e.key === 'Escape' && plain) return stop();
      const combo = comboFromEvent(e);
      if (!combo) return;
      stop();
      this.setValue(combo);
    };
    const click = () => stop();
    const stop = () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', click, true);
      window.removeEventListener('blur', click);
      // Shortcuts held by the core would never reach the editor while listening.
      void core.call('pause_shortcuts', { paused: false }).catch(() => undefined);
      this.stop = null;
      this.forceRerender();
    };
    this.stop = stop;
    void core.call('pause_shortcuts', { paused: true }).catch(() => undefined);
    window.addEventListener('keydown', key, true);
    // The click that opened the field is still being handled.
    setTimeout(() => {
      if (this.stop !== stop) return;
      window.addEventListener('pointerdown', click, true);
      window.addEventListener('blur', click);
    });
    this.forceRerender();
  }

  override dispose(): void {
    this.stop?.();
    super.dispose();
  }
}

export function registerFieldCombo(): void {
  if (!Blockly.registry.hasItem(Blockly.registry.Type.FIELD, 'field_combo'))
    Blockly.fieldRegistry.register('field_combo', FieldCombo);
}
