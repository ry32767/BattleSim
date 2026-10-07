import { useEffect, useRef, useState } from 'react';
import type { Command, PublicState, Slot } from '@battle/contracts';
import { content } from '@battle/content';
import { displayIconUrl } from './officialIcons';

type Equipment = Required<Pick<Command, 'main' | 'sub' | 'mainMode' | 'subMode' | 'mainDirection' | 'subDirection'>>;
type Action = 'MOVE' | 'WAIT' | 'GUARD' | 'TRACK' | 'MORE' | 'EQUIPMENT' | 'CONTACT';
type Props = {
  point: { x: number; y: number }; unit?: PublicState['units'][number]; contact?: PublicState['contacts'][number];
  equipment: Equipment; editable: boolean; canTrack: boolean;
  onEquipment: (next: Equipment) => void; onAction: (action: Action) => void; onClose: () => void;
};
const weaponName = (id: string) => id === 'none' ? '空き' : content.weapons.find(w => w.id === id)?.name ?? id;
function sectorPath(index: number, count: number) {
  const step = Math.PI * 2 / count, angle = -Math.PI / 2 + index * step;
  const start = angle - step / 2 + .025, end = angle + step / 2 - .025;
  const point = (radius: number, a: number) => `${174 + Math.cos(a) * radius},${174 + Math.sin(a) * radius}`;
  return `M${point(168, start)} A168,168 0 ${end-start>Math.PI?1:0},1 ${point(168, end)} L${point(64, end)} A64,64 0 ${end-start>Math.PI?1:0},0 ${point(64, start)} Z`;
}

export function CharacterWheel({ point, unit, contact, equipment, editable, canTrack, onEquipment, onAction, onClose }: Props) {
  const [slot, setSlot] = useState<Slot | null>(null), [hovered, setHovered] = useState<number | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const host = useRef<HTMLDivElement>(null);
  const pointerStarted = useRef(false);
  const dismiss = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { host.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus(); }, [slot]);
  const size = Math.min(348, viewport.width - 16, Math.max(240, viewport.height - 148));
  const left = Math.max(8, Math.min(point.x - size / 2, viewport.width - size - 8));
  const top = Math.max(8, Math.min(point.y - size / 2 - 44, viewport.height - size - 140));
  const name = unit ? `${unit.name}-${unit.copy}` : contact?.tag || contact?.number || '接触';
  const icon = displayIconUrl(unit?.presetId ?? (contact?.channel === 'visual' ? contact.presetId ?? '' : ''));
  const options = slot && unit ? [...new Set(unit.loadout[slot])].map(id => ({
    label: weaponName(id), detail: id === equipment[slot] ? '選択中' : '切り替え', disabled: !editable,
    selected: id === equipment[slot], run: () => { if (id !== equipment[slot]) onEquipment({ ...equipment, [slot]: id, [slot + 'Mode']: 'attack' }); },
  })) : unit ? [
    { label: 'MAIN', detail: weaponName(equipment.main), disabled: false, selected: false, run: () => setSlot('main') },
    { label: 'SUB', detail: weaponName(equipment.sub), disabled: false, selected: false, run: () => setSlot('sub') },
    { label: '移動', detail: '経路を設定', disabled: !editable, selected: false, run: () => onAction('MOVE') },
    { label: '待機', detail: '0.5秒追加', disabled: !editable, selected: false, run: () => onAction('WAIT') },
    { label: '護衛', detail: '味方を選ぶ', disabled: !editable, selected: false, run: () => onAction('GUARD') },
    { label: '追跡', detail: '接触を選ぶ', disabled: !editable || !canTrack, selected: false, run: () => onAction('TRACK') },
    { label: 'その他', detail: '防御・固有行動', disabled: !editable, selected: false, run: () => onAction('MORE') },
    { label: '装備・向き', detail: '詳細設定', disabled: false, selected: false, run: () => onAction('EQUIPMENT') },
  ] : [{ label: '接触詳細', detail: 'タグを編集', disabled: false, selected: false, run: () => onAction('CONTACT') }];
  const navigate = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (slot) setSlot(null); else dismiss(); return; }
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'Tab'].includes(e.key)) return;
    const buttons = [...host.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.shiftKey || e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    e.preventDefault(); e.stopPropagation(); buttons[next]?.focus();
  };
  return <div className="character-wheel-overlay" onPointerDown={e => { if (e.target === e.currentTarget) dismiss(); }} onContextMenu={e => { e.preventDefault(); if (e.target === e.currentTarget) dismiss(); }}>
    <div ref={host} className={`character-wheel ${slot ?? 'actions'}`} role="menu" aria-label="キャラの行動" style={{ left, top, width: size }} onKeyDown={navigate}
      onPointerDownCapture={() => { pointerStarted.current = true; }} onClickCapture={e => {
        // Releasing the opening long press must not click the newly mounted center button.
        if (e.detail > 0 && !pointerStarted.current) { e.preventDefault(); e.stopPropagation(); }
        pointerStarted.current = false;
      }}>
      <header><strong>{name}</strong><button aria-label="行動メニューを閉じる" onClick={dismiss}>×</button></header>
      <div className="wheel-disc">
        <svg viewBox="0 0 348 348" aria-hidden="true">{options.map((option, i) => <path key={i} d={sectorPath(i, options.length)} className={`${option.selected?'selected ':''}${hovered===i?'hovered ':''}${option.disabled?'disabled':''}`}
          onPointerEnter={() => setHovered(i)} onPointerLeave={() => setHovered(null)} onClick={() => { if (!option.disabled) option.run(); }} />)}</svg>
        {options.map((option, i) => {
          const angle = -Math.PI / 2 + i * Math.PI * 2 / options.length;
          return <button key={`${slot}-${i}`} className="wheel-option" role={slot ? 'menuitemradio' : 'menuitem'} aria-checked={slot ? option.selected : undefined}
            aria-label={slot ? `${slot.toUpperCase()} ${option.label}` : ({'移動':'移動経路を設定','待機':'待機を追加','護衛':'護衛対象を選ぶ','装備・向き':'装備・向きを設定','接触詳細':'タグ・接触詳細を編集'} as Record<string,string>)[option.label] ?? option.label}
            disabled={option.disabled} style={{ left: `${50 + Math.cos(angle) * 35}%`, top: `${50 + Math.sin(angle) * 35}%` }}
            onPointerEnter={() => setHovered(i)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(i)} onBlur={() => setHovered(null)} onClick={option.run}>
            <strong>{option.label}</strong><small>{option.detail}</small>
          </button>;
        })}
        <button className="wheel-center" aria-label={slot ? '行動メニューに戻る' : '行動メニューを閉じる'} onClick={() => slot ? setSlot(null) : dismiss()}>
          {slot ? <><strong>{slot.toUpperCase()}</strong><span>← 戻る</span></> : <>{icon && <img src={icon} alt="" referrerPolicy="no-referrer" />}<span>閉じる</span></>}
        </button>
      </div>
      {unit && <footer><span><b>M</b> {weaponName(equipment.main)} <b>S</b> {weaponName(equipment.sub)}</span><small>{editable ? '扇形を選ぶとコマンドに保存' : '現在の装備を表示 · 編集できません'}</small></footer>}
    </div>
  </div>;
}
