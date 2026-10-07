export interface MenuItem {
  label?: string;
  icon?: string;
  action?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  shortcut?: string;
}
