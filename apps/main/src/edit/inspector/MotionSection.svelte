<script lang="ts">
  import { Button, Field, NumberField, Segmented, Select, t, Toggle } from '@bv/ui';
  import {
    orbitWouldCycle,
    type BubbleId,
    type Easing,
    type Motion,
    type OrbitMotion,
    type PathMotion,
    type Pulse,
    type Spin,
    type TrackMotion,
    type WanderMotion,
  } from '@bv/world';
  import type { Editor } from '../../lib/editor.svelte';
  import { motionEditor } from '../motion-editor.svelte';
  import { commonField, update } from './common';

  let { editor, ids }: { editor: Editor; ids: BubbleId[] } = $props();

  const w = $derived(editor.world!);
  const track = $derived(commonField(w, ids, (b) => b.motion.track?.type ?? 'none'));
  const tr = $derived(ids.length ? editor.index.get(ids[0]!)?.motion.track : undefined);
  const pulse = $derived(commonField(w, ids, (b) => b.motion.pulse ?? null));
  const spin = $derived(commonField(w, ids, (b) => b.motion.spin ?? null));
  const centers = $derived(
    editor.index
      .flatten()
      .filter((b) => ids.every((id) => !orbitWouldCycle(editor.index, id, b.id)))
      .map((b) => ({ value: b.id, label: editor.index.pathString(b.id) })),
  );

  function setMotion(fn: (m: Motion) => Motion, key?: string) {
    update(editor, (b) => ({ ...b, motion: fn(b.motion) }), key);
  }

  function setTrack(patch: Partial<TrackMotion>, key?: string) {
    setMotion((m) => (m.track ? { ...m, track: { ...m.track, ...patch } as TrackMotion } : m), key);
  }

  function changeType(v: string) {
    const id = ids[0];
    if (v === 'none') return setMotion(({ track: _t, ...rest }) => rest);
    if (v === 'orbit') {
      const center = centers.find((c) => c.value !== id)?.value;
      if (!center) return;
      const o: OrbitMotion = {
        type: 'orbit',
        center,
        rx: 220,
        ry: 160,
        tilt: 0,
        speed: 20,
        dir: 'cw',
        phase: 0,
      };
      return setMotion((m) => ({ ...m, track: o }));
    }
    if (v === 'wander') {
      const wd: WanderMotion = {
        type: 'wander',
        area: { shape: 'circle', r: 60 },
        speed: 25,
        smoothness: 0.6,
      };
      return setMotion((m) => ({ ...m, track: wd }));
    }
    const p: PathMotion = {
      type: 'path',
      points: [
        { x: 0, y: 0, smooth: true },
        { x: 120, y: 0, smooth: true },
      ],
      loop: 'pingpong',
      speed: 60,
      easing: 'easeInOut',
    };
    setMotion((m) => ({ ...m, track: p }));
  }
</script>

<Field label={t('motion.track')}>
  <Select
    value={track?.value}
    mixed={track?.mixed}
    options={[
      { value: 'none', label: t('motion.none') },
      { value: 'path', label: t('motion.path') },
      { value: 'orbit', label: t('motion.orbit') },
      { value: 'wander', label: t('motion.wander') },
    ]}
    onchange={changeType}
  />
</Field>

{#if tr && !track?.mixed}
  {#if tr.type === 'orbit'}
    <Field label={t('motion.center')} wide>
      <Select
        value={tr.center}
        options={centers.filter((c) => !ids.includes(c.value))}
        onchange={(v) => setTrack({ center: v })}
      />
    </Field>
    <Field label={t('motion.rx')}>
      <NumberField value={tr.rx} min={0} onchange={(v) => setTrack({ rx: v }, 'rx')} />
    </Field>
    <Field label={t('motion.ry')}>
      <NumberField value={tr.ry} min={0} onchange={(v) => setTrack({ ry: v }, 'ry')} />
    </Field>
    <Field label={t('motion.tilt')}>
      <NumberField
        value={tr.tilt}
        step={5}
        suffix="°"
        onchange={(v) => setTrack({ tilt: v }, 'tilt')}
      />
    </Field>
    <Field label={t('motion.speed')}>
      <NumberField
        value={tr.speed}
        step={1}
        suffix="°/s"
        onchange={(v) => setTrack({ speed: v }, 'speed')}
      />
    </Field>
    <Field label={t('motion.dir')}>
      <Segmented
        value={tr.dir}
        options={[
          { value: 'cw', label: t('motion.cw') },
          { value: 'ccw', label: t('motion.ccw') },
        ]}
        onchange={(v) => setTrack({ dir: v as OrbitMotion['dir'] })}
      />
    </Field>
    <Field label={t('motion.phase')}>
      <NumberField
        value={tr.phase}
        step={15}
        suffix="°"
        onchange={(v) => setTrack({ phase: v }, 'phase')}
      />
    </Field>
  {:else if tr.type === 'path'}
    <Field label="">
      <Button small icon="target" onclick={() => motionEditor.start('path', ids[0]!)}
        >{t('menu.setPath')}</Button
      >
      <span class="bv-muted">{t('motion.points', { count: tr.points.length })}</span>
    </Field>
    <Field label={t('motion.loop')}>
      <Segmented
        value={tr.loop}
        options={[
          { value: 'loop', label: t('motion.loop.loop') },
          { value: 'pingpong', label: t('motion.loop.pingpong') },
        ]}
        onchange={(v) => setTrack({ loop: v as PathMotion['loop'] })}
      />
    </Field>
    <Field label={t('motion.speed')}>
      <NumberField
        value={tr.speed}
        min={1}
        suffix="/s"
        onchange={(v) => setTrack({ speed: v }, 'speed')}
      />
    </Field>
    <Field label={t('motion.easing')}>
      <Select
        value={tr.easing}
        options={[
          { value: 'linear', label: t('motion.easing.linear') },
          { value: 'easeIn', label: t('motion.easing.in') },
          { value: 'easeOut', label: t('motion.easing.out') },
          { value: 'easeInOut', label: t('motion.easing.inOut') },
        ]}
        onchange={(v) => setTrack({ easing: v as Easing })}
      />
    </Field>
  {:else if tr.type === 'wander'}
    <Field label="">
      <Button small icon="target" onclick={() => motionEditor.start('wander', ids[0]!)}
        >{t('menu.setWander')}</Button
      >
    </Field>
    <Field label={t('motion.area')}>
      <Segmented
        value={tr.area.shape}
        options={[
          { value: 'circle', label: t('motion.area.circle') },
          { value: 'rect', label: t('motion.area.rect') },
        ]}
        onchange={(v) =>
          setTrack({
            area: v === 'circle' ? { shape: 'circle', r: 60 } : { shape: 'rect', w: 160, h: 100 },
          })}
      />
    </Field>
    {#if tr.area.shape === 'circle'}
      <Field label={t('motion.radius')}>
        <NumberField
          value={tr.area.r}
          min={1}
          onchange={(v) => setTrack({ area: { shape: 'circle', r: v } }, 'area')}
        />
      </Field>
    {:else}
      <Field label={t('motion.width')}>
        <NumberField
          value={tr.area.w}
          min={1}
          onchange={(v) =>
            tr.area.shape === 'rect' && setTrack({ area: { ...tr.area, w: v } }, 'area')}
        />
      </Field>
      <Field label={t('motion.height')}>
        <NumberField
          value={tr.area.h}
          min={1}
          onchange={(v) =>
            tr.area.shape === 'rect' && setTrack({ area: { ...tr.area, h: v } }, 'area')}
        />
      </Field>
    {/if}
    <Field label={t('motion.speed')}>
      <NumberField
        value={tr.speed}
        min={1}
        suffix="/s"
        onchange={(v) => setTrack({ speed: v }, 'speed')}
      />
    </Field>
    <Field label={t('motion.smoothness')}>
      <NumberField
        value={Math.round(tr.smoothness * 100)}
        min={0}
        max={100}
        step={5}
        suffix="%"
        onchange={(v) => setTrack({ smoothness: v / 100 }, 'smooth')}
      />
    </Field>
  {/if}
{/if}

<Field label={t('motion.pulse')}>
  <Toggle
    checked={!!pulse?.value}
    mixed={pulse?.mixed}
    onchange={(v) =>
      setMotion(({ pulse: _p, ...m }) =>
        v ? { ...m, pulse: { min: 0.9, max: 1.1, period: 2 } } : m,
      )}
  />
</Field>
{#if pulse?.value && !pulse.mixed}
  {@const p = pulse.value}
  <Field label={t('motion.pulse.range')}>
    <NumberField
      value={Math.round(p.min * 100)}
      min={10}
      max={500}
      suffix="%"
      onchange={(v) =>
        setMotion((m) => ({ ...m, pulse: { ...(m.pulse as Pulse), min: v / 100 } }), 'pmin')}
    />
    <NumberField
      value={Math.round(p.max * 100)}
      min={10}
      max={500}
      suffix="%"
      onchange={(v) =>
        setMotion((m) => ({ ...m, pulse: { ...(m.pulse as Pulse), max: v / 100 } }), 'pmax')}
    />
  </Field>
  <Field label={t('motion.period')}>
    <NumberField
      value={p.period}
      min={0.1}
      step={0.1}
      suffix="s"
      onchange={(v) =>
        setMotion((m) => ({ ...m, pulse: { ...(m.pulse as Pulse), period: v } }), 'pper')}
    />
  </Field>
{/if}

<Field label={t('motion.spin')}>
  <Toggle
    checked={!!spin?.value}
    mixed={spin?.mixed}
    onchange={(v) =>
      setMotion(({ spin: _s, ...m }) =>
        v ? { ...m, spin: { mode: 'constant', speed: 30, angle: 20 } } : m,
      )}
  />
</Field>
{#if spin?.value && !spin.mixed}
  {@const s = spin.value}
  <Field label="">
    <Segmented
      value={s.mode}
      options={[
        { value: 'constant', label: t('motion.spin.constant') },
        { value: 'pendulum', label: t('motion.spin.pendulum') },
      ]}
      onchange={(v) =>
        setMotion((m) => ({ ...m, spin: { ...(m.spin as Spin), mode: v as Spin['mode'] } }))}
    />
  </Field>
  <Field label={t('motion.speed')}>
    <NumberField
      value={s.speed}
      suffix="°/s"
      onchange={(v) =>
        setMotion((m) => ({ ...m, spin: { ...(m.spin as Spin), speed: v } }), 'sspeed')}
    />
  </Field>
  {#if s.mode === 'pendulum'}
    <Field label={t('motion.angle')}>
      <NumberField
        value={s.angle}
        min={0}
        max={180}
        suffix="°"
        onchange={(v) =>
          setMotion((m) => ({ ...m, spin: { ...(m.spin as Spin), angle: v } }), 'sangle')}
      />
    </Field>
  {/if}
{/if}
