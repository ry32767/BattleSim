import { useEffect, useRef } from 'react';
import type { Command, PublicState } from '@battle/contracts';

export const commandLabels: Record<Command['kind'], string> = {
  MOVE: '移動', WAIT: '待機', HOLD: '保持', TRACK: '追跡', GUARD: '護衛',
  FULL_GUARD: 'フルガード', ALL_ROUND: '全周シールド', STEALTH: '隠密', FIRE_AT: '地形射撃', SPECIAL: '固有行動',
};

type Props = {
  unit: PublicState['units'][number]; commands: Command[]; selectedIndex: number;
  weaponName: (id: string) => string; effectName: (id: string) => string;
  targetName: (id: string) => string; surfaceName: (id: string) => string; onSelect: (index: number) => void;
  onExpand?: () => void; expanded?: boolean;
};

export function ActionFlow({ unit, commands, selectedIndex, weaponName, effectName, targetName, surfaceName, onSelect, onExpand, expanded = false }: Props) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const strip = list.current, node = strip?.querySelector('[aria-current="step"]');
    if (expanded || !strip || !node) return;
    // Scroll only this strip: scrolling ancestors would move the board behind a closed mobile drawer.
    const bounds = strip.getBoundingClientRect(), item = node.getBoundingClientRect();
    if (item.left < bounds.left) strip.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right) strip.scrollLeft += item.right - bounds.right;
  }, [unit.id, selectedIndex, commands.length, expanded]);
  return <section className={`action-flow ${expanded ? 'expanded' : ''}`} aria-label="選択中のキャラの行動">
    <div className="row spread flow-heading"><strong>{unit.name}-{unit.copy} <small>{commands.length}件登録</small></strong>{onExpand && <button onClick={onExpand}>一覧を拡大</button>}</div>
    <ol className="command-strip" ref={list} aria-label="登録済み行動">
      <li className="flow-node"><button className={`command flow-start ${selectedIndex < 0 ? 'active' : ''}`} aria-current={selectedIndex < 0 ? 'step' : undefined} onClick={() => onSelect(-1)}><strong>開始</strong><small>開始時の装備・向き</small></button></li>
      {commands.map((command, index) => {
        const ticks = command.kind === 'MOVE' ? (command.path?.length ?? 0) * 5 : command.durationTicks ?? 5;
        const target = command.allyId ?? command.contactId;
        return <li className={`flow-node kind-${command.kind.toLowerCase()}`} key={`${unit.id}:${index}`}>
          <button className={`command ${selectedIndex === index ? 'active' : ''}`} aria-current={selectedIndex === index ? 'step' : undefined} onClick={() => onSelect(index)}>
            <strong><span className="flow-number">{index + 1}</span> {commandLabels[command.kind]}</strong>
            <small>{command.kind === 'MOVE' ? `経路 ${command.path?.length ?? 0}辺 · ` : ''}予定 {ticks / 10}秒</small>
            {command.path?.length ? <small>終点 {surfaceName(command.path.at(-1)!)}</small> : null}
            {command.targetSurfaceId && <small>地形 {surfaceName(command.targetSurfaceId)}</small>}
            {target && <small>対象 {targetName(target)}</small>}
            {command.effectId && <small>{effectName(command.effectId)}</small>}
            {command.weaponId && <small>{weaponName(command.weaponId)}</small>}
            <small className="flow-equipment">M {command.main ? weaponName(command.main) : '前の設定'}{command.mainDirection !== undefined ? ` ${command.mainDirection}°` : ''}{command.mainMode === 'shield' ? ' / 盾' : ''}</small>
            <small className="flow-equipment">S {command.sub ? weaponName(command.sub) : '前の設定'}{command.subDirection !== undefined ? ` ${command.subDirection}°` : ''}{command.subMode === 'shield' ? ' / 盾' : ''}</small>
          </button>
        </li>;
      })}
    </ol>
    <p className="flow-note">{commands.length ? '矢印の順に実行。ブロックを選ぶと編集できます。終了後は保持・自動戦闘。実際の時間は戦闘・移動待ちで変わります。' : 'まだ行動は登録されていません。移動や待機を追加してください。'}</p>
  </section>;
}
