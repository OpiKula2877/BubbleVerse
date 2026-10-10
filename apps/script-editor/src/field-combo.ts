import { cancelCapture, captureCombo, normalizeCombo, t } from '@bv/ui';
import * as Blockly from 'blockly/core';

/**
 * The shortcut field of the "when … is pressed" block: a click starts listening and the keys
 * pressed next are written in (any keys: `Alt+Space`, `Ctrl` alone, `T+L+P` held together),
 * so nobody has to know key names. Esc alone or a click elsewhere cancels.
 */
export class FieldCombo extends Blockly.Field<string> {
  override SERIALIZABLE = true;
  private listening = false;

  static override fromJson(options: Blockly.FieldConfig & { value?: string }): FieldCombo {
    return new FieldCombo(options.value ?? 'Ctrl+Alt+K');
  }

  protected override doClassValidation_(value?: unknown): string | null {
    return typeof value === 'string' ? normalizeCombo(value) : null;
  }

  protected override getText_(): string {
    return this.listening ? t('editor.pressKeys') : `⌨ ${this.getValue() ?? ''}`;
  }

  protected override showEditor_(): void {
    if (this.listening) return;
    this.listening = true;
    this.forceRerender();
    const click = () => cancelCapture();
    // The click that opened the field is still being handled.
    setTimeout(() => {
      if (!this.listening) return;
      window.addEventListener('pointerdown', click, true);
      window.addEventListener('blur', click);
    });
    void captureCombo().then((combo) => {
      window.removeEventListener('pointerdown', click, true);
      window.removeEventListener('blur', click);
      this.listening = false;
      if (combo && !this.disposed) this.setValue(combo);
      if (!this.disposed) this.forceRerender();
    });
  }

  override dispose(): void {
    if (this.listening) cancelCapture();
    super.dispose();
  }
}

export function registerFieldCombo(): void {
  if (!Blockly.registry.hasItem(Blockly.registry.Type.FIELD, 'field_combo'))
    Blockly.fieldRegistry.register('field_combo', FieldCombo);
}
