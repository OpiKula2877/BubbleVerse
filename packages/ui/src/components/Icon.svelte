<script lang="ts" module>
  /** 24×24 stroke icons. */
  const PATHS: Record<string, string> = {
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    hammer:
      'M15 12 6.5 20.5a2.1 2.1 0 0 1-3-3L12 9 M17.6 6.4 13 11 M14 4l6 6 M12.5 5.5 15 3l6 6-2.5 2.5',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
    save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z M17 21v-8H7v8 M7 3v5h8',
    discard: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6',
    undo: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
    redo: 'm15 14 5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
    play: 'M6 4l14 8-14 8V4Z',
    stop: 'M6 6h12v12H6z',
    step: 'M5 4l10 8-10 8V4Z M19 5v14',
    record: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
    grid: 'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
    close: 'M18 6 6 18 M6 6l12 12',
    plus: 'M12 5v14 M5 12h14',
    minus: 'M5 12h14',
    trash: 'M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6 M9 6V4h6v2',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
    bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
    chevronRight: 'm9 18 6-6-6-6',
    chevronDown: 'm6 9 6 6 6-6',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M21 21l-4.3-4.3',
    copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
    image: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6 M15.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    home: 'M3 11 12 3l9 8 M5 9.5V21h14V9.5',
    hide: 'M5 12h14',
    warning: 'M12 3 2 21h20L12 3Z M12 10v5 M12 18h.01',
    check: 'M20 6 9 17l-5-5',
    dots: 'M5 12h.01 M12 12h.01 M19 12h.01',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    pause: 'M7 5h3v14H7z M14 5h3v14h-3z',
    code: 'm8 6-6 6 6 6 M16 6l6 6-6 6',
    upload: 'M12 15V3 M7 8l5-5 5 5 M5 21h14',
    download: 'M12 3v12 M7 10l5 5 5-5 M5 21h14',
    keyboard:
      'M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M19 10h-.01 M7 14h.01 M17 14h.01 M10 14h4',
    volume: 'M11 5 6 9H3v6h3l5 4V5Z M15.5 8.5a5 5 0 0 1 0 7 M18.5 5.5a9 9 0 0 1 0 13',
    palette:
      'M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-4 3.5h-2a2 2 0 0 0-1.5 3.3A1.4 1.4 0 0 1 12 21Z M7.5 11.5h.01 M10 7.5h.01 M14.5 7.5h.01 M17 11h.01',
    sparkles:
      'M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z',
  };
</script>

<script lang="ts">
  let {
    name,
    size = 18,
    stroke = 1.8,
  }: { name: string; size?: number; stroke?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name] ?? ''} />
</svg>
