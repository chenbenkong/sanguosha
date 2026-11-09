import React from 'react';
import { Card } from '../../../types';
import CardComponent from '../../../components/CardComponent';

export type SkillChoiceRequest = {
  skill: string;
  owner: string;
  title: string;
  hint?: string;
  mode: 'choose' | 'multi' | 'card' | 'target';
  choices?: { id: string; label: string; desc?: string }[];
  cards?: Card[];
  targets?: { id: number; name: string; sub?: string }[];
  min?: number;
  max?: number;
  cancelLabel?: string;
};
export type SkillChoiceResult =
  | { kind: 'choose'; id: string }
  | { kind: 'multi'; ids: string[] }
  | { kind: 'card'; ids: string[] }
  | { kind: 'target'; ids: number[] }
  | { kind: 'cancel' }
  | { kind: 'timeout' };

/** 通用技能选择弹窗：单选 / 多选 / 选牌 / 选目标 */
export const SkillChoiceModal: React.FC<{
  request: SkillChoiceRequest;
  selected: string[];
  left: number | null;
  seconds: number;
  valid: boolean;
  onToggle: (key: string, single: boolean) => void;
  onChoose: (id: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ request, selected, left, seconds, valid, onToggle, onChoose, onSubmit, onCancel }) => (
  <div className="absolute inset-0 z-50 modal-mask flex items-center justify-center p-4">
    <div className="modal-frame w-full max-w-2xl p-5" role="dialog" aria-label={`${request.skill}选择`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="modal-title text-2xl font-ancient">【{request.skill}】</h3>
        <span className="modal-text-dim text-sm tabular-nums">{left ?? seconds} 秒</span>
      </div>
      <p className="modal-text text-base mb-1">{request.title}</p>
      {request.hint && <p className="modal-text-dim text-sm mb-2">{request.hint}</p>}
      <div className="modal-divider mb-3" />

      {request.mode === 'choose' && (
        <div className="flex flex-col gap-2">
          {request.choices?.map(ch => (
            <button
              key={ch.id}
              onClick={() => onChoose(ch.id)}
              className="btn-ink min-h-[44px] px-4 py-2 rounded-lg text-left"
            >
              <span className="font-bold">{ch.label}</span>
              {ch.desc && <span className="block text-xs opacity-70">{ch.desc}</span>}
            </button>
          ))}
        </div>
      )}

      {request.mode === 'multi' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {request.choices?.map(ch => (
              <button
                key={ch.id}
                onClick={() => onToggle(ch.id, false)}
                className={`btn-ink min-h-[44px] px-3 py-2 rounded-lg text-sm ${selected.includes(ch.id) ? 'ring-2 ring-[#e8cf94]' : ''}`}
              >
                <span className="font-bold">{ch.label}</span>
              </button>
            ))}
          </div>
          <p className="modal-text-dim text-xs text-center mt-2">
            已选 {selected.length} 项，需 {request.min ?? 1}–{request.max ?? 3} 项
          </p>
        </>
      )}

      {request.mode === 'card' && (
        <>
          <div className="flex flex-wrap gap-2 justify-center max-h-[46vh] overflow-y-auto p-1 scrollbar-thin">
            {request.cards?.map(c => (
              <div
                key={c.id}
                className="relative cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                onClick={() => onToggle(c.id, false)}
                role="button"
                aria-label={`选择【${c.name}】`}
              >
                <CardComponent card={c} small />
                {selected.includes(c.id) && <span className="absolute inset-0 rounded-lg ring-2 ring-[#e8cf94] bg-[#e8cf94]/10" />}
              </div>
            ))}
          </div>
          <p className="modal-text-dim text-xs text-center mt-2">
            已选 {selected.length} 张，需 {request.min ?? 1}–{request.max ?? (request.cards?.length ?? 0)} 张
          </p>
        </>
      )}

      {request.mode === 'target' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {request.targets?.map(t => (
            <button
              key={t.id}
              onClick={() => onToggle(String(t.id), (request.max ?? 1) <= 1)}
              className={`btn-ink min-h-[44px] px-3 py-2 rounded-lg text-sm ${selected.includes(String(t.id)) ? 'ring-2 ring-[#e8cf94]' : ''}`}
            >
              <span className="font-bold">{t.name}</span>
              {t.sub && <span className="block text-xs opacity-70">{t.sub}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel} className="btn-ink min-h-[44px] px-4 rounded-lg text-sm">
          {request.cancelLabel || '取消'}
        </button>
        {(request.mode === 'card' || request.mode === 'target' || request.mode === 'multi') && (
          <button
            onClick={onSubmit}
            disabled={!valid}
            className="btn-ink min-h-[44px] px-5 rounded-lg text-sm font-bold disabled:opacity-40"
          >
            {request.mode === 'card' ? '确认选择' : (request.mode === 'multi' ? '确认猜测' : '确认目标')}
          </button>
        )}
      </div>
    </div>
  </div>
);
